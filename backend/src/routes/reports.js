const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess } = require("../middleware/rbac");
const { getApprovedStockBalances } = require("../lib/departmentAnalytics");
const { notifyManagers } = require("../lib/notifications");

const router = express.Router();

// Upper bounds on numeric fields — without these, a value that overflows
// the underlying Postgres column (int4 tops out around 2.1 billion;
// these Decimal(14,2) columns top out at 999,999,999,999.99) reaches
// Prisma un-validated and throws, surfacing as a bare unhandled 500
// instead of a clean 400. The caps below are generous for any real
// headcount/quantity/amount while staying safely inside both the
// column's real range and zod/JS's own safe-integer range.
const MAX_HEADCOUNT = 100000;
const MAX_QUANTITY = 999999999;

// Shared guard for every PATCH (correction/resubmit/edit) route below.
// Two cases:
//  - the original submitter correcting a RETURNED report (the existing
//    resubmit flow, spec Section 2.4/20 — "returned reports retain their
//    history and correction trail")
//  - the Technical Manager editing a report directly, either while it's
//    still SUBMITTED (in place, from the Approvals screen) or after
//    returning it. Content stays attributed to the original submitter
//    (submittedById is never changed here) — the audit log is what
//    records that the TM, not the submitter, made this particular edit.
async function assertReturnedAndOwned(req, res, reportId, expectedType) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return null;
  }
  if (report.type !== expectedType) {
    res.status(400).json({ error: "Report type mismatch" });
    return null;
  }

  if (req.user.role === "TECHNICAL_MANAGER") {
    if (report.status !== "SUBMITTED" && report.status !== "RETURNED") {
      res.status(409).json({ error: `Cannot edit a report with status ${report.status}` });
      return null;
    }
    return report;
  }

  if (report.status !== "RETURNED") {
    res.status(409).json({ error: `Cannot correct a report with status ${report.status}` });
    return null;
  }
  if (report.submittedById !== req.user.id) {
    res.status(403).json({ error: "Only the original submitter can correct this report" });
    return null;
  }
  return report;
}

// Distinguishes an audit entry for "the Technical Manager edited this
// report while it was pending review" from the pre-existing "submitter
// corrected and resubmitted a returned report" — same PATCH route,
// different actor/situation, worth telling apart in the audit log.
function editAuditAction(req, reportBeforeUpdate) {
  return req.user.role === "TECHNICAL_MANAGER" && reportBeforeUpdate.status === "SUBMITTED"
    ? "REPORT_EDITED_BY_TM"
    : "REPORT_RESUBMITTED";
}

const foremanSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  // Client-generated (e.g. crypto.randomUUID() at draft time) so a
  // retried offline-sync submit is safely idempotent — see Report.submissionId.
  submissionId: z.string().min(1),
  siteLocation: z.string().optional(),
  // Manpower on site — fixed categories (paper form section 4); the
  // Total Workforce figure is computed server-side from these, not
  // trusted from the client.
  electricalSupervisors: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  electricians: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  electricalAssistants: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  generalHands: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  sheOfficersOnSite: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  workCompleted: z.string().min(1, "Work completed today is required"),
  workInProgress: z.string().optional(),
  percentProgress: z.number().int().min(0).max(100).default(0),
  equipmentUsed: z.string().optional(),
  materialsUsed: z.string().optional(),
  materialsRequired: z.string().optional(),
  constraints: z.string().optional(),
  instructionsReceived: z.string().optional(),
  nextDayPlan: z.string().optional(),
});

function workforceTotal(detail) {
  return (
    detail.electricalSupervisors +
    detail.electricians +
    detail.electricalAssistants +
    detail.generalHands +
    detail.sheOfficersOnSite
  );
}

// Foreman submits for their assigned project; Technical Manager can submit for any.
router.post(
  "/foreman",
  requireAuth,
  requireRole("FOREMAN"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = foremanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, ...detail } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { foremanDetail: true },
    });
    if (existing) {
      // Already recorded from a prior attempt (e.g. offline retry) — return it as-is, don't duplicate.
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "FOREMAN",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        foremanDetail: { create: { ...detail, workersOnSite: workforceTotal(detail) } },
      },
      include: { foremanDetail: true },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "FOREMAN", projectId },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Foreman report awaiting approval",
      message: `A Foreman report was submitted and is awaiting your review.`,
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

// Foreman sees only their own submissions; Technical Manager/Management see all for the project.
router.get("/foreman", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "FOREMAN" };
  if (req.user.role === "FOREMAN") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: { foremanDetail: true, submittedBy: { select: { id: true, name: true } } },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/foreman/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: { foremanDetail: true, submittedBy: { select: { id: true, name: true } } },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/foreman/:id", requireAuth, requireRole("FOREMAN"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "FOREMAN");
  if (!report) return;

  const parsed = foremanSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, ...detail } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      foremanDetail: { update: { ...detail, workersOnSite: workforceTotal(detail) } },
    },
    include: { foremanDetail: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "FOREMAN" },
  });

  res.json(updated);
});

const VARIATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const qsLineSchema = z.object({
  boqItemNumber: z.string().min(1),
  description: z.string().min(1),
  contractQuantity: z.number().nonnegative().max(MAX_QUANTITY),
  quantityToday: z.number().nonnegative().max(MAX_QUANTITY),
  cumulativeQuantity: z.number().nonnegative().max(MAX_QUANTITY),
  measurements: z.string().optional(),
  valuationAmount: z.number().nonnegative().max(MAX_QUANTITY).optional(),
  variationReference: z.string().optional(),
  // Only meaningful once variationReference is set, but not enforced as
  // a hard requirement — a QS may flag a variation before it's formally
  // referenced.
  variationStatus: z.enum(VARIATION_STATUSES).optional(),
  comments: z.string().optional(),
});

const qsSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  comments: z.string().optional(),
  commercialIssues: z.string().optional(),
  // A QS report with no line items says nothing — same principle as
  // the Finance/Stores header+line pattern in spec Section 9.3.
  lines: z.array(qsLineSchema).min(1, "At least one BOQ line item is required"),
});

// balanceQuantity and percentCompletion are derived here, not trusted
// from the client — they feed the progress-vs-budget cross-checks later.
function deriveQsLine(line) {
  const balanceQuantity = line.contractQuantity - line.cumulativeQuantity;
  const percentCompletion =
    line.contractQuantity > 0
      ? Math.max(0, Math.min(100, Math.round((line.cumulativeQuantity / line.contractQuantity) * 100)))
      : 0;
  return { ...line, balanceQuantity, percentCompletion };
}

router.post(
  "/qs",
  requireAuth,
  requireRole("QS"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = qsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, comments, commercialIssues, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { qsDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "QS",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        qsDetail: {
          create: {
            comments,
            commercialIssues,
            lines: { create: lines.map(deriveQsLine) },
          },
        },
      },
      include: { qsDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "QS", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "QS report awaiting approval",
      message: "A QS report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

router.get("/qs", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "QS" };
  if (req.user.role === "QS") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      qsDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/qs/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      qsDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/qs/:id", requireAuth, requireRole("QS"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "QS");
  if (!report) return;

  const parsed = qsSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, comments, commercialIssues, lines } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      qsDetail: {
        update: {
          comments,
          commercialIssues,
          lines: { deleteMany: {}, create: lines.map(deriveQsLine) },
        },
      },
    },
    include: { qsDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "QS", lineCount: lines.length },
  });

  res.json(updated);
});

const sheSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  workersOnSite: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  toolboxTalksConducted: z.string().min(1, "Toolbox talks conducted is required"),
  safetyInspections: z.string().optional(),
  ppeCompliance: z.string().optional(),
  hazardsIdentified: z.string().optional(),
  correctiveActions: z.string().optional(),
  environmentalIssues: z.string().optional(),
  safetyObservations: z.string().optional(),
  incidentCount: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  nearMissCount: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  incidentsDescription: z.string().optional(),
});

router.post(
  "/she",
  requireAuth,
  requireRole("SHE_OFFICER"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = sheSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, ...detail } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { sheDetail: true },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "SHE",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        sheDetail: { create: detail },
      },
      include: { sheDetail: true },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "SHE", projectId, incidentCount: detail.incidentCount },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "SHE report awaiting approval",
      message: "A SHE report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    if (detail.incidentCount > 0) {
      await notifyManagers({
        type: "SAFETY_INCIDENT",
        title: "Safety incident recorded",
        message: `${detail.incidentCount} incident(s) recorded in today's SHE report.${detail.incidentsDescription ? " " + detail.incidentsDescription : ""}`,
        projectId,
        link: "/analytics/she",
        dedupeKey: `SAFETY_INCIDENT:${report.id}`,
      });
    }

    res.status(201).json(report);
  }
);

router.get("/she", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "SHE" };
  if (req.user.role === "SHE_OFFICER") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: { sheDetail: true, submittedBy: { select: { id: true, name: true } } },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/she/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: { sheDetail: true, submittedBy: { select: { id: true, name: true } } },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/she/:id", requireAuth, requireRole("SHE_OFFICER"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "SHE");
  if (!report) return;

  const parsed = sheSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, ...detail } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      sheDetail: { update: detail },
    },
    include: { sheDetail: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "SHE" },
  });

  res.json(updated);
});

const STOCK_DIRECTIONS = ["RECEIVED", "ISSUED", "RETURNED", "DAMAGED_LOST"];

const stockLineSchema = z.object({
  itemName: z.string().min(1),
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z.number().nonnegative().max(MAX_QUANTITY),
  unit: z.string().optional(),
  unitCost: z.number().nonnegative().max(MAX_QUANTITY).optional(),
  supplier: z.string().optional(),
  deliveryReference: z.string().optional(),
  notes: z.string().optional(),
});

const storesSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  shortagesAndRequirements: z.string().optional(),
  comments: z.string().optional(),
  // Same rule as QS — a stores report with no movements says nothing (spec 9.3).
  lines: z.array(stockLineSchema).min(1, "At least one stock transaction line is required"),
});

// Stamps each line with opening/closing balance — computed here, not
// trusted from the client, same principle as deriveQsLine. Lines for the
// same item within one submission carry the balance forward between
// each other, not just from prior approved history.
async function deriveStockLines(projectId, lines) {
  const itemNames = [...new Set(lines.map((l) => l.itemName))];
  const balances = await getApprovedStockBalances(projectId, itemNames);

  return lines.map((line) => {
    const opening = balances.get(line.itemName) ?? 0;
    const delta = line.direction === "RECEIVED" || line.direction === "RETURNED" ? line.quantity : -line.quantity;
    const closing = opening + delta;
    balances.set(line.itemName, closing);
    return { ...line, openingBalance: opening, closingBalance: closing };
  });
}

router.post(
  "/stores",
  requireAuth,
  requireRole("STORESMAN"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = storesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, shortagesAndRequirements, comments, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { storesDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const derivedLines = await deriveStockLines(projectId, lines);

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "STORES",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        storesDetail: {
          create: {
            shortagesAndRequirements,
            comments,
            lines: { create: derivedLines },
          },
        },
      },
      include: { storesDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "STORES", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Stores report awaiting approval",
      message: "A Stores report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    if (shortagesAndRequirements) {
      await notifyManagers({
        type: "MATERIAL_SHORTAGE",
        title: "Material shortage reported",
        message: shortagesAndRequirements,
        projectId,
        link: "/analytics/stores",
        dedupeKey: `MATERIAL_SHORTAGE:${report.id}`,
      });
    }

    res.status(201).json(report);
  }
);

router.get("/stores", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "STORES" };
  if (req.user.role === "STORESMAN") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      storesDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/stores/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      storesDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/stores/:id", requireAuth, requireRole("STORESMAN"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "STORES");
  if (!report) return;

  const parsed = storesSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, shortagesAndRequirements, comments, lines } = parsed.data;
  const derivedLines = await deriveStockLines(report.projectId, lines);

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      storesDetail: {
        update: {
          shortagesAndRequirements,
          comments,
          lines: { deleteMany: {}, create: derivedLines },
        },
      },
    },
    include: { storesDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "STORES", lineCount: lines.length },
  });

  res.json(updated);
});

const FINANCE_LINE_TYPES = ["FUNDS_RECEIVED", "EXPENDITURE", "COMMITMENT"];
const FINANCE_CATEGORIES = [
  "ADVANCE_PAYMENT",
  "OTHER_FUNDS",
  "MATERIALS",
  "LABOUR",
  "PLANT_EQUIPMENT",
  "TRANSPORT_LOGISTICS",
  "SUBCONTRACTOR",
  "SUPPLIER",
  "PETTY_CASH",
  "OTHER",
];

const financeLineSchema = z.object({
  type: z.enum(FINANCE_LINE_TYPES),
  category: z.enum(FINANCE_CATEGORIES),
  amount: z.number().nonnegative().max(MAX_QUANTITY),
  description: z.string().optional(),
  paymentReference: z.string().optional(),
});

const financeSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  comments: z.string().optional(),
  lines: z.array(financeLineSchema).min(1, "At least one transaction line is required"),
});

router.post(
  "/finance",
  requireAuth,
  requireRole("FINANCE"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = financeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, comments, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { financeDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "FINANCE",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        financeDetail: {
          create: {
            comments,
            lines: { create: lines },
          },
        },
      },
      include: { financeDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "FINANCE", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Finance report awaiting approval",
      message: "A Finance report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

router.get("/finance", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "FINANCE" };
  if (req.user.role === "FINANCE") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      financeDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/finance/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      financeDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/finance/:id", requireAuth, requireRole("FINANCE"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "FINANCE");
  if (!report) return;

  const parsed = financeSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, comments, lines } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      financeDetail: {
        update: {
          comments,
          lines: { deleteMany: {}, create: lines },
        },
      },
    },
    include: { financeDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "FINANCE", lineCount: lines.length },
  });

  res.json(updated);
});

module.exports = router;
