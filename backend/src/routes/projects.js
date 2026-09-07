const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess, blockManagement } = require("../middleware/rbac");
const { computeProjectAnalytics } = require("../lib/analytics");
const {
  gatherCombinedReportData,
  generateCombinedReportPdf,
  generateCombinedReportExcel,
} = require("../lib/combinedReport");
const {
  computeQsAnalytics,
  computeStoresAnalytics,
  computeSheAnalytics,
  computeForemanAnalytics,
  computeFinanceAnalytics,
} = require("../lib/departmentAnalytics");
const {
  gatherDepartmentReportData,
  generateDepartmentReportPdf,
  generateDepartmentReportExcel,
} = require("../lib/departmentReport");
const {
  gatherFinancialReportData,
  generateFinancialReportPdf,
  generateFinancialReportExcel,
} = require("../lib/financialReport");
const {
  gatherProgressReportData,
  generateProgressReportPdf,
  generateProgressReportExcel,
} = require("../lib/progressReport");

const router = express.Router();

const STATUSES = ["PLANNING", "ACTIVE", "DELAYED", "COMPLETED", "CLOSED"];
// Every role that submits department reports and therefore needs
// project access — mirrors the roles the (now-removed) manual
// assignment UI used to offer.
const ASSIGNABLE_ROLES = ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "GENERAL_WORKER"];

const createProjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  client: z.string().optional(),
  mainContractor: z.string().optional(),
  location: z.string().optional(),
  contractValue: z.number().nonnegative().optional(),
  approvedBudget: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  plannedEndDate: z.string().datetime().optional(),
  projectManagerId: z.string().uuid().optional(),
});

const PROJECT_MANAGER_INCLUDE = { projectManager: { select: { id: true, name: true, email: true } } };

// projectManagerId isn't a DB-level FK-to-role constraint (Prisma can't
// express "must be this role"), so it's checked here — same pattern as
// the rest of the app's role checks.
async function validateProjectManagerId(projectManagerId) {
  if (!projectManagerId) return null;
  const user = await prisma.user.findUnique({ where: { id: projectManagerId } });
  if (!user || user.role !== "TECHNICAL_MANAGER") {
    return "projectManagerId must be an existing Technical Manager";
  }
  return null;
}

router.post("/", requireAuth, requireRole(), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  if (data.startDate && data.plannedEndDate && new Date(data.plannedEndDate) < new Date(data.startDate)) {
    return res.status(400).json({ error: "plannedEndDate cannot be before startDate" });
  }
  const pmError = await validateProjectManagerId(data.projectManagerId);
  if (pmError) return res.status(400).json({ error: pmError });

  const project = await prisma.project.create({
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : undefined,
    },
    include: PROJECT_MANAGER_INCLUDE,
  });

  // There's no per-project assignment UI any more — every active
  // department user is auto-enrolled on every project so a new project
  // is immediately visible/usable department-wide, not invisible until
  // someone manually assigns each person to it. Fine at the scale of a
  // handful of concurrent projects; would need revisiting (real
  // per-project team selection) if that ever stops being true.
  const departmentUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ASSIGNABLE_ROLES } },
    select: { id: true, role: true },
  });
  if (departmentUsers.length > 0) {
    await prisma.projectAssignment.createMany({
      data: departmentUsers.map((u) => ({ userId: u.id, projectId: project.id, role: u.role })),
      skipDuplicates: true,
    });
  }

  await recordAudit({ userId: req.user.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id });

  res.status(201).json(project);
});

// Technical Manager sees every project; everyone else sees only
// what they're assigned to, per the brief's "assigned projects" rule.
router.get("/", requireAuth, async (req, res) => {
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" }, include: PROJECT_MANAGER_INCLUDE });
    return res.json(projects);
  }

  const projects = await prisma.project.findMany({
    where: { assignments: { some: { userId: req.user.id } } },
    orderBy: { createdAt: "desc" },
    include: PROJECT_MANAGER_INCLUDE,
  });
  res.json(projects);
});

router.get("/:projectId", requireAuth, requireProjectAccess, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, role: true } } } },
      ...PROJECT_MANAGER_INCLUDE,
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

router.patch("/:projectId", requireAuth, requireRole(), async (req, res) => {
  const parsed = createProjectSchema.partial().extend({
    status: z.enum(STATUSES).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const pmError = await validateProjectManagerId(parsed.data.projectManagerId);
  if (pmError) return res.status(400).json({ error: pmError });

  const project = await prisma.project.update({
    where: { id: req.params.projectId },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      plannedEndDate: parsed.data.plannedEndDate ? new Date(parsed.data.plannedEndDate) : undefined,
    },
    include: PROJECT_MANAGER_INCLUDE,
  });

  await recordAudit({ userId: req.user.id, action: "PROJECT_UPDATED", entityType: "Project", entityId: project.id });

  res.json(project);
});

const assignSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"]),
});

router.post("/:projectId/assignments", requireAuth, requireRole(), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, role } = parsed.data;
  const { projectId } = req.params;

  const assignment = await prisma.projectAssignment.create({
    data: { userId, projectId, role },
  });

  await recordAudit({
    userId: req.user.id,
    action: "USER_ASSIGNED_TO_PROJECT",
    entityType: "ProjectAssignment",
    entityId: assignment.id,
    metadata: { userId, projectId, role },
  });

  res.status(201).json(assignment);
});

router.delete("/:projectId/assignments/:assignmentId", requireAuth, requireRole(), async (req, res) => {
  await prisma.projectAssignment.delete({ where: { id: req.params.assignmentId } });
  await recordAudit({
    userId: req.user.id,
    action: "USER_UNASSIGNED_FROM_PROJECT",
    entityType: "ProjectAssignment",
    entityId: req.params.assignmentId,
  });
  res.status(204).send();
});

// The approved programme — period-by-period planned progress the
// Technical Manager maintains directly (spec: "allow the Technical
// Manager to update or approve programme progress"). Read is open to
// anyone with project access; write is Technical Manager only, same as
// creating/editing the project itself.
const programmeEntrySchema = z.object({
  periodDate: z.string().date(),
  plannedProgress: z.number().int().min(0).max(100),
});

router.get("/:projectId/programme", requireAuth, requireProjectAccess, async (req, res) => {
  const entries = await prisma.programmeEntry.findMany({
    where: { projectId: req.params.projectId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { periodDate: "asc" },
  });
  res.json(entries);
});

router.post("/:projectId/programme", requireAuth, requireRole(), async (req, res) => {
  const parsed = programmeEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const entry = await prisma.programmeEntry.upsert({
    where: {
      projectId_periodDate: { projectId: req.params.projectId, periodDate: new Date(parsed.data.periodDate) },
    },
    create: {
      projectId: req.params.projectId,
      periodDate: new Date(parsed.data.periodDate),
      plannedProgress: parsed.data.plannedProgress,
      createdById: req.user.id,
    },
    update: { plannedProgress: parsed.data.plannedProgress, createdById: req.user.id },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "PROGRAMME_ENTRY_SET",
    entityType: "ProgrammeEntry",
    entityId: entry.id,
    metadata: { projectId: req.params.projectId, periodDate: parsed.data.periodDate, plannedProgress: parsed.data.plannedProgress },
  });

  res.status(201).json(entry);
});

router.delete("/:projectId/programme/:entryId", requireAuth, requireRole(), async (req, res) => {
  await prisma.programmeEntry.delete({ where: { id: req.params.entryId } });
  await recordAudit({
    userId: req.user.id,
    action: "PROGRAMME_ENTRY_DELETED",
    entityType: "ProgrammeEntry",
    entityId: req.params.entryId,
  });
  res.status(204).send();
});

router.get("/:projectId/analytics", requireAuth, requireProjectAccess, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeProjectAnalytics(project));
});

// Real history for trend charts — built up by the snapshot job in
// lib/analytics.js, not computed live (there's nothing to show a trend
// of until snapshots accumulate day over day).
// Accepts an explicit from/to range (spec: "allow filtering by project
// and date range") or falls back to the old "last N days" behaviour
// when no range is given, so existing callers keep working unchanged.
router.get("/:projectId/snapshots", requireAuth, requireProjectAccess, async (req, res) => {
  let since;
  if (req.query.from) {
    since = new Date(req.query.from);
  } else {
    const days = Math.min(Number(req.query.days) || 30, 90);
    since = new Date();
    since.setDate(since.getDate() - days);
  }
  const until = req.query.to ? new Date(req.query.to) : new Date();

  const snapshots = await prisma.projectSnapshot.findMany({
    where: { projectId: req.params.projectId, snapshotDate: { gte: since, lte: until } },
    orderBy: { snapshotDate: "asc" },
  });
  res.json(snapshots);
});

// Department dashboards — Technical Manager/Management only, same
// oversight-tool restriction as the Combined Report and /analytics,
// not requireProjectAccess (department users submit via /reports/*
// but don't get their own analytics view).
router.get("/:projectId/qs-analytics", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeQsAnalytics(project));
});

router.get("/:projectId/stores-analytics", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeStoresAnalytics(project));
});

router.get("/:projectId/she-analytics", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeSheAnalytics(project));
});

router.get("/:projectId/foreman-analytics", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeForemanAnalytics(project));
});

router.get("/:projectId/finance-analytics", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeFinanceAnalytics(project));
});

// Step 6 — one-button combined report: every approved department report
// for the project in a date range, exported as PDF or Excel. Restricted
// to Technical Manager/Management (not requireProjectAccess) since it
// surfaces Finance data across every department at once, not just the
// caller's own department.
// Technical Manager only — Management can view the same underlying
// progress/finance data on-screen (analytics, dashboards) but not
// generate or download a report file of it.
router.get("/:projectId/combined-report", requireAuth, requireRole(), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { from, to, format, recommendations, mainContractor, reportDate } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to query params are required (YYYY-MM-DD)" });
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
    return res.status(400).json({ error: "Invalid date range" });
  }
  if (!["pdf", "xlsx"].includes(format)) {
    return res.status(400).json({ error: "format must be pdf or xlsx" });
  }
  let reportDateParsed;
  if (reportDate) {
    reportDateParsed = new Date(reportDate);
    if (Number.isNaN(reportDateParsed.getTime())) {
      return res.status(400).json({ error: "Invalid reportDate" });
    }
  }

  // req.user only carries {id, role, email} from the JWT — the report's
  // "Prepared By" line needs the actual display name.
  const preparer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
  const data = await gatherCombinedReportData(
    project,
    fromDate,
    toDate,
    recommendations,
    preparer?.name,
    mainContractor,
    reportDateParsed
  );
  const fileBase = `${project.code}-combined-report-${from}-to-${to}`;

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
    generateCombinedReportPdf(data, res);
    return;
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
  const wb = await generateCombinedReportExcel(data);
  await wb.xlsx.write(res);
  res.end();
});

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Shared from/to/format validation for the report-type endpoints below —
// same rules as combined-report.
function parseReportRangeParams(req, res) {
  const { from, to, format } = req.query;
  if (!from || !to) {
    res.status(400).json({ error: "from and to query params are required (YYYY-MM-DD)" });
    return null;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
    res.status(400).json({ error: "Invalid date range" });
    return null;
  }
  if (!["pdf", "xlsx"].includes(format)) {
    res.status(400).json({ error: "format must be pdf or xlsx" });
    return null;
  }
  return { from, to, fromDate, toDate, format };
}

// Project financial report (spec Section 16) — Finance data only,
// standalone from the combined report. Same access rule: Technical
// Manager/Management, since it's cross-category Finance data.
// Technical Manager only — same rule as combined-report above.
router.get("/:projectId/reports/financial", requireAuth, requireRole(), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = parseReportRangeParams(req, res);
  if (!parsed) return;
  const { from, to, fromDate, toDate, format } = parsed;

  const data = await gatherFinancialReportData(project, fromDate, toDate);
  const fileBase = `${project.code}-financial-report-${from}-to-${to}`;

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
    generateFinancialReportPdf(data, res);
    return;
  }
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
  const wb = await generateFinancialReportExcel(data);
  await wb.xlsx.write(res);
  res.end();
});

// Project progress report (spec Section 16) — planned vs actual,
// variance, status and daily history, standalone from the combined
// report. Project-scoped access (not Management-only) since it's purely
// progress data, same rule as /analytics.
router.get("/:projectId/reports/progress", requireAuth, requireProjectAccess, blockManagement, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = parseReportRangeParams(req, res);
  if (!parsed) return;
  const { from, to, fromDate, toDate, format } = parsed;

  const data = await gatherProgressReportData(project, fromDate, toDate);
  const fileBase = `${project.code}-progress-report-${from}-to-${to}`;

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
    generateProgressReportPdf(data, res);
    return;
  }
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
  const wb = await generateProgressReportExcel(data);
  await wb.xlsx.write(res);
  res.end();
});

const DEPARTMENTS = ["FOREMAN", "QS", "SHE", "STORES", "FINANCE"];

// Department-specific report (spec Section 16) — one department's own
// data only. Project-scoped access: a department user assigned to the
// project can pull their own department's report, not just Management.
router.get("/:projectId/reports/department", requireAuth, requireProjectAccess, blockManagement, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { department } = req.query;
  if (!DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: `department must be one of ${DEPARTMENTS.join(", ")}` });
  }
  // requireProjectAccess above lets any assigned project member through
  // regardless of their own department — fine for Foreman/QS/SHE/Stores,
  // but a Finance department report carries the same sensitive
  // cross-project financial detail as the standalone financial report,
  // so it needs the same Management-level restriction.
  if (department === "FINANCE" && req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    return res.status(403).json({ error: "Not permitted for this role" });
  }

  const parsed = parseReportRangeParams(req, res);
  if (!parsed) return;
  const { from, to, fromDate, toDate, format } = parsed;

  const data = await gatherDepartmentReportData(project, department, fromDate, toDate);
  const fileBase = `${project.code}-${department.toLowerCase()}-report-${from}-to-${to}`;

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
    generateDepartmentReportPdf(data, res);
    return;
  }
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
  const wb = await generateDepartmentReportExcel(data);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
