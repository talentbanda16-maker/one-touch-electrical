const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess } = require("../middleware/rbac");

const router = express.Router();

const foremanSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  // Client-generated (e.g. crypto.randomUUID() at draft time) so a
  // retried offline-sync submit is safely idempotent — see Report.submissionId.
  submissionId: z.string().min(1),
  siteLocation: z.string().optional(),
  workersOnSite: z.number().int().nonnegative().default(0),
  labourSkilled: z.number().int().nonnegative().default(0),
  labourUnskilled: z.number().int().nonnegative().default(0),
  labourSubcontractor: z.number().int().nonnegative().default(0),
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
        foremanDetail: { create: detail },
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

const qsLineSchema = z.object({
  boqItemNumber: z.string().min(1),
  description: z.string().min(1),
  contractQuantity: z.number().nonnegative(),
  quantityToday: z.number().nonnegative(),
  cumulativeQuantity: z.number().nonnegative(),
  measurements: z.string().optional(),
  valuationAmount: z.number().nonnegative().optional(),
  variationReference: z.string().optional(),
  comments: z.string().optional(),
});

const qsSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  comments: z.string().optional(),
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
    const { projectId, reportDate, submissionId, comments, lines } = parsed.data;

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

const sheSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  toolboxTalksConducted: z.string().min(1, "Toolbox talks conducted is required"),
  safetyInspections: z.string().optional(),
  ppeCompliance: z.string().optional(),
  correctiveActions: z.string().optional(),
  incidentCount: z.number().int().nonnegative().default(0),
  nearMissCount: z.number().int().nonnegative().default(0),
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

module.exports = router;
