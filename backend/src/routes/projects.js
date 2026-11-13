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
const { notify } = require("../lib/notifications");
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
  const showArchived = req.query.archived === "true";
  const archivedFilter = { isArchived: showArchived };

  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    const projects = await prisma.project.findMany({
      where: archivedFilter,
      orderBy: { createdAt: "desc" },
      include: PROJECT_MANAGER_INCLUDE,
    });
    return res.json(projects);
  }

  const projects = await prisma.project.findMany({
    where: { assignments: { some: { userId: req.user.id } }, ...archivedFilter },
    orderBy: { createdAt: "desc" },
    include: PROJECT_MANAGER_INCLUDE,
  });
  res.json(projects);
});

// ---------- Project pipeline board (Engineer + TM drag; Management view-only) ----------
// Columns are the project lifecycle. DELAYED isn't its own column — a delayed
// project still sits in "Active" and just shows a red dot.
function projectStatusToColumn(status) {
  if (status === "PLANNING") return "planning";
  if (status === "COMPLETED") return "completed";
  if (status === "CLOSED") return "closed";
  return "active"; // ACTIVE or DELAYED
}
const PROJECT_COLUMN_TO_STATUS = { planning: "PLANNING", active: "ACTIVE", completed: "COMPLETED", closed: "CLOSED" };

// NOTE: must be declared before GET "/:projectId" or "/board" would be
// captured as a projectId.
router.get("/board", requireAuth, requireRole("ENGINEER", "MANAGEMENT"), async (_req, res) => {
  const fmtN = (v) => (v != null ? Number(v) : 0);
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    include: PROJECT_MANAGER_INCLUDE,
  });

  const cards = await Promise.all(projects.map(async (p) => {
    const [analytics, bomItems, pendingReqs, openActions] = await Promise.all([
      computeProjectAnalytics(p),
      prisma.bomItem.findMany({ where: { projectId: p.id, isArchived: false }, select: { qtyNeeded: true, qtyOrdered: true, unitPrice: true, budgetUnitPrice: true } }),
      prisma.materialRequisition.count({ where: { projectId: p.id, status: "PENDING", isArchived: false } }),
      prisma.action.count({ where: { projectId: p.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);
    const budgetCost = bomItems.reduce((s, i) => s + fmtN(i.qtyNeeded) * fmtN(i.budgetUnitPrice), 0);
    const actualCost = bomItems.reduce((s, i) => s + fmtN(i.qtyOrdered) * fmtN(i.unitPrice), 0);
    const daysRemaining = p.plannedEndDate ? Math.max(0, Math.floor((new Date(p.plannedEndDate) - now) / 86400000)) : null;
    const pastDue = p.plannedEndDate && new Date(p.plannedEndDate) < now && !["COMPLETED", "CLOSED"].includes(p.status);

    return {
      id: p.id, name: p.name, code: p.code, client: p.client, status: p.status,
      column: projectStatusToColumn(p.status),
      completion: analytics.progress?.actual ?? 0,
      plannedProgress: analytics.progress?.planned ?? null,
      budgetCost, actualCost, variance: actualCost - budgetCost,
      daysRemaining,
      isDelayed: p.status === "DELAYED" || Boolean(pastDue),
      pendingReqs, openActions,
      projectManager: p.projectManager ? { id: p.projectManager.id, name: p.projectManager.name } : null,
      plannedEndDate: p.plannedEndDate,
    };
  }));

  res.json(cards);
});

const projectBoardMoveSchema = z.object({ column: z.enum(["planning", "active", "completed", "closed"]) });

// Move a project card — TM or Engineer only. Sets the real ProjectStatus,
// so the whole app (dashboards, KPIs) reflects the new stage immediately.
router.patch("/:projectId/board", requireAuth, requireRole("ENGINEER"), async (req, res) => {
  const parsed = projectBoardMoveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const status = PROJECT_COLUMN_TO_STATUS[parsed.data.column];

  const existing = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!existing) return res.status(404).json({ error: "Project not found" });

  const project = await prisma.project.update({
    where: { id: req.params.projectId },
    data: { status },
    include: PROJECT_MANAGER_INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PROJECT_STATUS_UPDATED",
    entityType: "Project",
    entityId: project.id,
    metadata: { from: existing.status, to: status },
  });

  res.json({ id: project.id, status: project.status, column: parsed.data.column });
});

// ---------- Project workspace: calendar (site visits) + chart metrics ----------

// Metrics for the Charts view: progress (planned vs actual) + material cost
// (budget vs ordered). Reuses the same maths as the pipeline board.
router.get("/:projectId/workspace-metrics", requireAuth, requireProjectAccess, async (req, res) => {
  const fmtN = (v) => (v != null ? Number(v) : 0);
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [analytics, bomItems] = await Promise.all([
    computeProjectAnalytics(project),
    prisma.bomItem.findMany({
      where: { projectId: project.id, isArchived: false },
      select: { qtyNeeded: true, qtyOrdered: true, unitPrice: true, budgetUnitPrice: true },
    }),
  ]);
  const budgetCost = bomItems.reduce((s, i) => s + fmtN(i.qtyNeeded) * fmtN(i.budgetUnitPrice), 0);
  const actualCost = bomItems.reduce((s, i) => s + fmtN(i.qtyOrdered) * fmtN(i.unitPrice), 0);

  res.json({
    completion: analytics.progress?.actual ?? 0,
    plannedProgress: analytics.progress?.planned ?? null,
    budgetCost,
    actualCost,
  });
});

const siteVisitSchema = z.object({
  date: z.string().date(),
  type: z.enum(["SITE_VISIT", "TESTING"]).default("SITE_VISIT"),
  title: z.string().min(1).max(200),
  notes: z.string().max(1000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
});

const SITE_VISIT_INCLUDE = {
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

// Anyone with project access can SEE the calendar (TM/Engineer/Management bypass).
router.get("/:projectId/site-visits", requireAuth, requireProjectAccess, async (req, res) => {
  const visits = await prisma.siteVisit.findMany({
    where: { projectId: req.params.projectId },
    include: SITE_VISIT_INCLUDE,
    orderBy: { date: "asc" },
  });
  res.json(visits);
});

// Only TM + Engineer can book a visit.
router.post("/:projectId/site-visits", requireAuth, requireRole("ENGINEER"), async (req, res) => {
  const parsed = siteVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const visit = await prisma.siteVisit.create({
    data: {
      projectId: req.params.projectId,
      date: new Date(parsed.data.date),
      type: parsed.data.type,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      assignedToId: parsed.data.assignedToId || null,
      createdById: req.user.id,
    },
    include: SITE_VISIT_INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "SITE_VISIT_SCHEDULED",
    entityType: "SiteVisit",
    entityId: visit.id,
    metadata: { projectId: req.params.projectId, date: parsed.data.date, type: parsed.data.type },
  });

  // Tell the assigned person they've been booked for a site visit.
  if (visit.assignedToId) {
    const typeLabel = visit.type === "TESTING" ? "Testing" : "Site visit";
    await notify({
      userId: visit.assignedToId,
      type: "SITE_VISIT_SCHEDULED",
      title: `${typeLabel} booked for you`,
      message: `${project.name}: "${visit.title}" on ${parsed.data.date}.${visit.notes ? ` Note: ${visit.notes}` : ""}`,
      projectId: req.params.projectId,
      link: "/my-visits",
      dedupeKey: `SITE_VISIT_SCHEDULED:${visit.id}`,
    });
  }

  res.status(201).json(visit);
});

// TM + Engineer can remove a booking.
router.delete("/:projectId/site-visits/:visitId", requireAuth, requireRole("ENGINEER"), async (req, res) => {
  const visit = await prisma.siteVisit.findUnique({ where: { id: req.params.visitId } });
  if (!visit || visit.projectId !== req.params.projectId) {
    return res.status(404).json({ error: "Site visit not found" });
  }
  await prisma.siteVisit.delete({ where: { id: req.params.visitId } });
  await recordAudit({ userId: req.user.id, action: "SITE_VISIT_DELETED", entityType: "SiteVisit", entityId: req.params.visitId });
  res.json({ deleted: true });
});

// ---------- Tender BOQ (QS uploads client BOQ, then prices it) ----------

// Anyone signed in can view a project's tender BOQ.
router.get("/:projectId/tender-boq", requireAuth, async (req, res) => {
  const items = await prisma.tenderBoqItem.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { order: "asc" },
  });
  res.json(items.map((i) => ({
    id: i.id,
    order: i.order,
    bill: i.bill,
    isHeading: i.isHeading,
    itemNumber: i.itemNumber,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity != null ? Number(i.quantity) : null,
    rate: i.rate != null ? Number(i.rate) : null,
  })));
});

const tenderLineSchema = z.object({
  bill: z.string().max(300).nullable().optional(),
  isHeading: z.boolean().optional().default(false),
  itemNumber: z.string().max(60).nullable().optional(),
  description: z.string().max(2000),
  unit: z.string().max(40).nullable().optional(),
  quantity: z.number().nonnegative().max(1e12).nullable().optional(),
  rate: z.number().nonnegative().max(1e12).nullable().optional(),
});

// Import the client (unpriced) BOQ — replaces whatever's there. QS only.
router.post("/:projectId/tender-boq/import", requireAuth, requireRole("QS"), async (req, res) => {
  const parsed = z.object({ lines: z.array(tenderLineSchema).max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const projectId = req.params.projectId;

  // Auto-extract the materials (supply items) from the same lines, so the
  // materials table fills itself the moment a BOQ is uploaded — no separate step.
  const materialRows = parsed.data.lines
    .filter((l) => isBoqMaterial({ isHeading: !!l.isHeading, quantity: l.quantity, description: l.description }))
    .map((l) => ({
      projectId,
      bill: l.bill || null,
      itemNumber: l.itemNumber || null,
      description: l.description,
      unit: l.unit || null,
      quantity: l.quantity != null ? l.quantity : null,
    }));

  await prisma.$transaction([
    prisma.tenderBoqItem.deleteMany({ where: { projectId } }),
    prisma.tenderBoqItem.createMany({
      data: parsed.data.lines.map((l, i) => ({
        projectId,
        order: i,
        bill: l.bill || null,
        isHeading: !!l.isHeading,
        itemNumber: l.itemNumber || null,
        description: l.description,
        unit: l.unit || null,
        quantity: l.quantity != null ? l.quantity : null,
        rate: l.rate != null ? l.rate : null,
      })),
    }),
    prisma.material.deleteMany({ where: { projectId } }),
    prisma.material.createMany({ data: materialRows }),
  ]);

  await recordAudit({
    userId: req.user.id,
    action: "TENDER_BOQ_IMPORTED",
    entityType: "Project",
    entityId: projectId,
    metadata: { count: parsed.data.lines.length, materials: materialRows.length },
  });

  res.json({ ok: true, count: parsed.data.lines.length, materials: materialRows.length });
});

// Save the prices (rates) the QS filled in. QS only.
router.put("/:projectId/tender-boq/rates", requireAuth, requireRole("QS"), async (req, res) => {
  const parsed = z.object({
    rates: z.array(z.object({ id: z.string().uuid(), rate: z.number().nonnegative().max(1e12).nullable() })).max(5000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const projectId = req.params.projectId;

  await prisma.$transaction(
    parsed.data.rates.map((r) =>
      prisma.tenderBoqItem.updateMany({ where: { id: r.id, projectId }, data: { rate: r.rate } })
    )
  );
  res.json({ ok: true });
});

// ---------- Materials (extracted from the tender BOQ) ----------

// A BOQ line is a "material" (something to buy) if it supplies goods, as
// opposed to pure labour, testing, preliminaries, provisional sums or headings.
function isBoqMaterial(it) {
  if (it.isHeading) return false;
  if (it.quantity == null) return false;
  const d = (it.description || "").toLowerCase();
  if (/installation only|install only|^installation of/.test(d)) return false;
  if (/provisional sum|preliminar|contingenc|^allow\b|day ?work|^labour|test and commission|testing and commission/.test(d)) return false;
  if (/supply|deliver|^do\b|^do but/.test(d)) return true;
  return false;
}

// Build / rebuild the materials table from the project's tender BOQ. QS only.
router.post("/:projectId/materials/extract", requireAuth, requireRole("QS"), async (req, res) => {
  const projectId = req.params.projectId;
  const boq = await prisma.tenderBoqItem.findMany({ where: { projectId }, orderBy: { order: "asc" } });
  const materials = boq.filter(isBoqMaterial).map((it) => ({
    projectId,
    bill: it.bill,
    itemNumber: it.itemNumber,
    description: it.description,
    unit: it.unit,
    quantity: it.quantity,
  }));

  await prisma.$transaction([
    prisma.material.deleteMany({ where: { projectId } }),
    prisma.material.createMany({ data: materials }),
  ]);

  await recordAudit({
    userId: req.user.id,
    action: "MATERIALS_EXTRACTED",
    entityType: "Project",
    entityId: projectId,
    metadata: { count: materials.length },
  });

  res.json({ ok: true, count: materials.length });
});

router.get("/:projectId/materials", requireAuth, async (req, res) => {
  const projectId = req.params.projectId;
  let materials = await prisma.material.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });

  // Lazy auto-fill: if there are no materials yet but a BOQ exists (e.g. a BOQ
  // uploaded before auto-extract existed), build them now so it's automatic.
  if (materials.length === 0) {
    const boq = await prisma.tenderBoqItem.findMany({ where: { projectId } });
    const rows = boq.filter(isBoqMaterial).map((it) => ({
      projectId, bill: it.bill, itemNumber: it.itemNumber, description: it.description, unit: it.unit, quantity: it.quantity,
    }));
    if (rows.length > 0) {
      await prisma.material.createMany({ data: rows });
      materials = await prisma.material.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    }
  }

  res.json(materials.map((m) => ({
    id: m.id,
    bill: m.bill,
    itemNumber: m.itemNumber,
    description: m.description,
    unit: m.unit,
    quantity: m.quantity != null ? Number(m.quantity) : null,
  })));
});

// ---------- Structured Programme of Works (activities as data) ----------
const programmeActivitySchema = z.object({
  name: z.string().max(300),
  durationWeeks: z.number().int().min(0).max(520).nullable().optional(),
  startWeek: z.number().int().min(0).max(520).nullable().optional(),
  finishWeek: z.number().int().min(0).max(520).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  actualStartWeek: z.number().int().min(0).max(520).nullable().optional(),
  actualFinishWeek: z.number().int().min(0).max(520).nullable().optional(),
  percentComplete: z.number().int().min(0).max(100).nullable().optional(),
  status: z.string().max(40).nullable().optional(),
});

router.get("/:projectId/programme-activities", requireAuth, requireProjectAccess, async (req, res) => {
  const type = req.query.type === "WORKING" ? "WORKING" : "CONTRACT";
  const acts = await prisma.programmeActivity.findMany({
    where: { projectId: req.params.projectId, type },
    orderBy: { order: "asc" },
  });
  res.json(acts);
});

// Save the whole list for a type (replace). QS only.
router.put("/:projectId/programme-activities", requireAuth, requireRole("QS"), async (req, res) => {
  const parsed = z.object({
    type: z.enum(["CONTRACT", "WORKING"]),
    activities: z.array(programmeActivitySchema).max(500),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, activities } = parsed.data;
  const projectId = req.params.projectId;

  await prisma.$transaction([
    prisma.programmeActivity.deleteMany({ where: { projectId, type } }),
    prisma.programmeActivity.createMany({
      data: activities.map((a, i) => ({
        projectId, type, order: i, name: a.name,
        durationWeeks: a.durationWeeks ?? null, startWeek: a.startWeek ?? null, finishWeek: a.finishWeek ?? null,
        notes: a.notes ?? null, actualStartWeek: a.actualStartWeek ?? null, actualFinishWeek: a.actualFinishWeek ?? null,
        percentComplete: a.percentComplete ?? 0, status: a.status ?? null,
      })),
    }),
  ]);
  res.json({ ok: true, count: activities.length });
});

// Generate the Working programme from the Contract programme. QS only.
router.post("/:projectId/programme-activities/generate-working", requireAuth, requireRole("QS"), async (req, res) => {
  const projectId = req.params.projectId;
  const contract = await prisma.programmeActivity.findMany({ where: { projectId, type: "CONTRACT" }, orderBy: { order: "asc" } });
  if (contract.length === 0) return res.status(400).json({ error: "Add some Contract programme activities first." });

  await prisma.$transaction([
    prisma.programmeActivity.deleteMany({ where: { projectId, type: "WORKING" } }),
    prisma.programmeActivity.createMany({
      data: contract.map((a, i) => ({
        projectId, type: "WORKING", order: i, name: a.name,
        durationWeeks: a.durationWeeks, startWeek: a.startWeek, finishWeek: a.finishWeek, notes: a.notes,
        percentComplete: 0, status: "NOT_STARTED",
      })),
    }),
  ]);

  await recordAudit({ userId: req.user.id, action: "WORKING_PROGRAMME_GENERATED", entityType: "Project", entityId: projectId, metadata: { count: contract.length } });
  res.json({ ok: true, count: contract.length });
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

router.get("/:projectId/stores-analytics", requireAuth, requireRole("MANAGEMENT", "TECHNICAL_MANAGER", "ENGINEER", "FOREMAN", "STORESMAN"), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(await computeStoresAnalytics(project));
});

// Live stock balance direct from transaction lines — no report approval needed.
router.get("/:projectId/stock-balance", requireAuth, requireProjectAccess, async (req, res) => {
  const lines = await prisma.stockTransactionLine.findMany({
    where: {
      storesReportDetail: {
        report: { projectId: req.params.projectId },
      },
    },
    select: { itemName: true, direction: true, quantity: true, unit: true, storesReportDetail: { select: { report: { select: { reportDate: true } } } } },
    orderBy: { storesReportDetail: { report: { reportDate: "asc" } } },
  });

  const byItem = new Map();
  for (const l of lines) {
    if (!byItem.has(l.itemName)) {
      byItem.set(l.itemName, { itemName: l.itemName, unit: l.unit, received: 0, issued: 0, returned: 0, damagedLost: 0, lastDate: null });
    }
    const item = byItem.get(l.itemName);
    const qty = Number(l.quantity);
    if (l.direction === "RECEIVED")     item.received    += qty;
    else if (l.direction === "ISSUED")  item.issued      += qty;
    else if (l.direction === "RETURNED") item.returned   += qty;
    else if (l.direction === "DAMAGED_LOST") item.damagedLost += qty;
    const d = l.storesReportDetail?.report?.reportDate;
    if (d && (!item.lastDate || new Date(d) > new Date(item.lastDate))) item.lastDate = d;
  }

  const items = Array.from(byItem.values()).map((i) => ({
    ...i,
    balance: i.received - i.issued + i.returned - i.damagedLost,
  }));

  res.json({ items });
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

// ── Project BOQ template ──────────────────────────────────────────────────────
router.get("/:id/boq", requireAuth, async (req, res) => {
  const items = await prisma.projectBoqItem.findMany({
    where: { projectId: req.params.id },
    orderBy: { order: "asc" },
  });
  res.json(items.map((i) => ({
    id: i.id,
    order: i.order,
    boqItemNumber: i.boqItemNumber,
    description: i.description,
    unit: i.unit,
    contractQuantity: Number(i.contractQuantity),
    contractRate: Number(i.contractRate),
    contractAmount: Number(i.contractQuantity) * Number(i.contractRate),
  })));
});

const boqItemSchema = z.object({
  boqItemNumber: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  unit: z.string().max(20).default(""),
  contractQuantity: z.number().nonnegative().max(9999999),
  contractRate: z.number().nonnegative().max(9999999),
});

router.put("/:id/boq", requireAuth, requireRole("QS"), async (req, res) => {
  const projectId = req.params.id;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = z.array(boqItemSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.$transaction([
    prisma.projectBoqItem.deleteMany({ where: { projectId } }),
    prisma.projectBoqItem.createMany({
      data: parsed.data.map((item, i) => ({
        projectId,
        order: i,
        boqItemNumber: item.boqItemNumber,
        description: item.description,
        unit: item.unit,
        contractQuantity: item.contractQuantity,
        contractRate: item.contractRate,
      })),
    }),
  ]);

  res.json({ ok: true });
});

// Archive a project (soft-delete) — Technical Manager only.
router.patch("/:projectId/archive", requireAuth, requireRole(), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const updated = await prisma.project.update({
    where: { id: req.params.projectId },
    data: { isArchived: true, status: "CLOSED" },
    include: PROJECT_MANAGER_INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PROJECT_ARCHIVED",
    entityType: "Project",
    entityId: project.id,
  });

  res.json(updated);
});

// Restore an archived project — Technical Manager only.
router.patch("/:projectId/restore", requireAuth, requireRole(), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const updated = await prisma.project.update({
    where: { id: req.params.projectId },
    data: { isArchived: false },
    include: PROJECT_MANAGER_INCLUDE,
  });

  await recordAudit({
    userId: req.user.id,
    action: "PROJECT_RESTORED",
    entityType: "Project",
    entityId: project.id,
  });

  res.json(updated);
});

module.exports = router;
