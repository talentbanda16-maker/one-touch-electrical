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

module.exports = router;
