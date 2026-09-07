const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectMember } = require("../middleware/rbac");
const { notifyManagers } = require("../lib/notifications");

const router = express.Router();

const QUALITY_STATUSES = ["YES", "NO", "REQUIRES_CORRECTION"];
const PRODUCTIVITY_RATINGS = ["EXCELLENT", "GOOD", "ATTENTION", "CRITICAL"];
const DELAY_JUSTIFIED = ["YES", "NO", "PARTIAL"];
const OVERTIME_RECOMMENDATIONS = ["APPROVED", "NOT_APPROVED", "NA"];
const DELAY_CATEGORIES = [
  "MATERIAL",
  "SUPERVISOR",
  "OTHER_DEPT",
  "EQUIPMENT",
  "TRANSPORT",
  "CLIENT_SITE",
  "POWER",
  "SAFETY",
  "EMPLOYEE",
  "OTHER",
];
const MANAGEMENT_ACTIONS = [
  "NO_ACTION",
  "EMPLOYEE_COACHING",
  "INVESTIGATE_DELAYS",
  "MATERIAL_PROCUREMENT",
  "PROJECT_PLANNING",
  "HR_REVIEW",
];

// The line-item tables (work targets, work not completed, delays,
// materials required, tomorrow's plan) are free-form rows from a paper
// form — validated as "must be an array of objects", not locked to a
// strict per-field shape the way QS/Stores lines are, since nothing
// downstream aggregates across these the way BOQ/stock balances do.
const lineItems = z.array(z.record(z.string(), z.any())).default([]);

const submitSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  employeeIdNumber: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  siteLocation: z.string().optional(),
  supervisorName: z.string().optional(),
  shift: z.string().optional(),

  workTargets: lineItems,
  totalTarget: z.number().nonnegative().optional(),
  totalCompleted: z.number().nonnegative().optional(),
  overallAchievementPercent: z.number().int().min(0).max(100).optional(),

  workCompletedToday: z.string().optional(),

  workNotCompleted: lineItems,

  delayExperienced: z.boolean().default(false),
  totalDelayHours: z.number().nonnegative().max(24).optional(),
  delays: lineItems,
  delayCategories: z.array(z.enum(DELAY_CATEGORIES)).default([]),

  materialsRequired: lineItems,

  qualityStandardMet: z.enum(QUALITY_STATUSES).optional(),
  reworkDetails: z.string().optional(),

  normalHours: z.number().nonnegative().max(24).optional(),
  actualHoursWorked: z.number().nonnegative().max(24).optional(),
  productiveHours: z.number().nonnegative().max(24).optional(),
  delayHours: z.number().nonnegative().max(24).optional(),
  overtimeRequested: z.boolean().default(false),
  overtimeHoursRequested: z.number().nonnegative().max(24).optional(),
  overtimeReason: z.string().optional(),
  expectedOvertimeOutput: z.string().optional(),

  tomorrowPlan: lineItems,

  employeeSignatureName: z.string().min(1, "Employee name/signature is required"),
});

const reviewSchema = z.object({
  targetAchievementPercent: z.number().int().min(0).max(100).optional(),
  productivityRating: z.enum(PRODUCTIVITY_RATINGS).optional(),
  delayJustified: z.enum(DELAY_JUSTIFIED).optional(),
  overtimeRecommendation: z.enum(OVERTIME_RECOMMENDATIONS).optional(),
  supervisorComments: z.string().optional(),
  supervisorSignatureName: z.string().min(1, "Supervisor name/signature is required"),
});

const finalizeSchema = z.object({
  productivityScore: z.number().int().min(0).max(100).optional(),
  overtimeHoursApproved: z.number().nonnegative().max(24).optional(),
  overtimeCost: z.number().nonnegative().max(999999999).optional(),
  managementActions: z.array(z.enum(MANAGEMENT_ACTIONS)).default([]),
});

// Sections K and L are Technical-Manager-filled and TM/Management-only
// to view — the worker who filled A-I and the Foreman who filled J can
// still see their own past submissions (per how this was scoped), just
// not this part of it.
const MANAGEMENT_ONLY_FIELDS = [
  "finalizedById",
  "finalizedAt",
  "productivityScore",
  "overtimeHoursApproved",
  "overtimeCost",
  "managementActions",
  "finalizedBy",
];

function forRole(report, role) {
  if (role === "TECHNICAL_MANAGER" || role === "MANAGEMENT") return report;
  const visible = { ...report };
  for (const field of MANAGEMENT_ONLY_FIELDS) delete visible[field];
  return visible;
}

const INCLUDE = {
  project: { select: { id: true, name: true, code: true } },
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  finalizedBy: { select: { id: true, name: true } },
};

// Stage 1 — the General Worker fills sections A-I and submits.
router.post("/", requireAuth, requireRole("GENERAL_WORKER"), requireProjectMember, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { projectId, reportDate, ...detail } = parsed.data;

  const report = await prisma.productivityReport.create({
    data: {
      projectId,
      reportDate: new Date(reportDate),
      submittedById: req.user.id,
      status: "SUBMITTED",
      ...detail,
    },
    include: INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PRODUCTIVITY_REPORT_SUBMITTED",
    entityType: "ProductivityReport",
    entityId: report.id,
    metadata: { projectId },
  });

  await notifyManagers({
    type: "REPORT_AWAITING_APPROVAL",
    title: "Daily productivity report awaiting supervisor review",
    message: `${report.submittedBy.name} submitted a daily productivity report awaiting Foreman review.`,
    projectId,
    link: "/productivity/review",
    dedupeKey: `PRODUCTIVITY_AWAITING_REVIEW:${report.id}`,
  });

  res.status(201).json(forRole(report, req.user.role));
});

// Reports waiting on the Foreman's section J.
router.get("/pending-review", requireAuth, requireRole("FOREMAN"), async (req, res) => {
  const where = { status: "SUBMITTED" };
  if (req.user.role !== "TECHNICAL_MANAGER") {
    const assignments = await prisma.projectAssignment.findMany({
      where: { userId: req.user.id },
      select: { projectId: true },
    });
    where.projectId = { in: assignments.map((a) => a.projectId) };
  }
  const reports = await prisma.productivityReport.findMany({
    where,
    include: INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
  res.json(reports.map((r) => forRole(r, req.user.role)));
});

// Stage 2 — the Foreman fills section J.
router.patch("/:id/supervisor-review", requireAuth, requireRole("FOREMAN"), async (req, res) => {
  const report = await prisma.productivityReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "SUBMITTED") {
    return res.status(409).json({ error: `Cannot review a report with status ${report.status}` });
  }
  if (req.user.role !== "TECHNICAL_MANAGER") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment) return res.status(403).json({ error: "You are not assigned to this project" });
  }

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await prisma.productivityReport.update({
    where: { id: report.id },
    data: {
      ...parsed.data,
      status: "SUPERVISOR_REVIEWED",
      reviewedById: req.user.id,
      reviewedAt: new Date(),
    },
    include: INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PRODUCTIVITY_REPORT_SUPERVISOR_REVIEWED",
    entityType: "ProductivityReport",
    entityId: report.id,
  });

  await notifyManagers({
    type: "REPORT_AWAITING_APPROVAL",
    title: "Daily productivity report awaiting management review",
    message: `${updated.reviewedBy.name} completed the supervisor review — awaiting Technical Manager sign-off.`,
    projectId: report.projectId,
    link: "/productivity/finalize",
    dedupeKey: `PRODUCTIVITY_AWAITING_FINALIZE:${report.id}`,
  });

  res.json(forRole(updated, req.user.role));
});

// Reports waiting on the Technical Manager's sections K/L.
router.get("/pending-finalize", requireAuth, requireRole(), async (req, res) => {
  const reports = await prisma.productivityReport.findMany({
    where: { status: "SUPERVISOR_REVIEWED" },
    include: INCLUDE,
    orderBy: { reviewedAt: "asc" },
  });
  res.json(reports);
});

// Stage 3 — the Technical Manager fills sections K and L; final.
router.patch("/:id/finalize", requireAuth, requireRole(), async (req, res) => {
  const report = await prisma.productivityReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "SUPERVISOR_REVIEWED") {
    return res.status(409).json({ error: `Cannot finalize a report with status ${report.status}` });
  }

  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await prisma.productivityReport.update({
    where: { id: report.id },
    data: {
      ...parsed.data,
      status: "COMPLETED",
      finalizedById: req.user.id,
      finalizedAt: new Date(),
    },
    include: INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PRODUCTIVITY_REPORT_FINALIZED",
    entityType: "ProductivityReport",
    entityId: report.id,
  });

  res.json(updated);
});

// List — scoped per role: the worker sees their own submissions, the
// Foreman sees ones they've reviewed, Technical Manager/Management see
// everything. K/L are stripped for everyone except TM/Management.
router.get("/", requireAuth, async (req, res) => {
  const { projectId, date } = req.query;
  const where = {};
  if (projectId) where.projectId = projectId;
  if (date) {
    const parsed = z.string().date().safeParse(date);
    if (!parsed.success) return res.status(400).json({ error: "Invalid date" });
    where.reportDate = new Date(parsed.data);
  }

  if (req.user.role === "GENERAL_WORKER") {
    where.submittedById = req.user.id;
  } else if (req.user.role === "FOREMAN") {
    where.reviewedById = req.user.id;
  } else if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    return res.status(403).json({ error: "Not permitted for this role" });
  }

  const reports = await prisma.productivityReport.findMany({
    where,
    include: INCLUDE,
    orderBy: { reportDate: "desc" },
  });
  res.json(reports.map((r) => forRole(r, req.user.role)));
});

router.get("/:id", requireAuth, async (req, res) => {
  const report = await prisma.productivityReport.findUnique({
    where: { id: req.params.id },
    include: INCLUDE,
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  const isOwner = report.submittedById === req.user.id;
  const isReviewer = report.reviewedById === req.user.id;
  const isPrivileged = req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT";
  if (!isOwner && !isReviewer && !isPrivileged) {
    return res.status(403).json({ error: "Not permitted to view this report" });
  }

  res.json(forRole(report, req.user.role));
});

module.exports = router;
