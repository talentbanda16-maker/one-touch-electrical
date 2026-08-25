const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess } = require("../middleware/rbac");

const router = express.Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const createSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().min(1),
  assignedToId: z.string().uuid(),
  dueDate: z.string().date(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  sourceReportId: z.string().uuid().optional(),
});

// Any user assigned to the project (or the Technical Manager) can raise
// an action — spec Section 14: "Create an action from any department report."
router.post("/", requireAuth, requireProjectAccess, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { projectId, description, assignedToId, dueDate, priority, sourceReportId } = parsed.data;

  const action = await prisma.action.create({
    data: {
      projectId,
      description,
      assignedToId,
      dueDate: new Date(dueDate),
      priority,
      sourceReportId,
      createdById: req.user.id,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ACTION_CREATED",
    entityType: "Action",
    entityId: action.id,
    metadata: { projectId, assignedToId, sourceReportId },
  });

  res.status(201).json(action);
});

router.get("/", requireAuth, async (req, res) => {
  const { projectId } = req.query;
  const where = {};
  if (projectId) where.projectId = projectId;
  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    where.assignedToId = req.user.id;
  }

  const actions = await prisma.action.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const withOverdue = actions.map((a) => ({
    ...a,
    isOverdue: ["OPEN", "IN_PROGRESS"].includes(a.status) && new Date(a.dueDate) < now,
  }));

  res.json(withOverdue);
});

const statusUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]),
  comments: z.string().optional(),
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const action = await prisma.action.findUnique({ where: { id: req.params.id } });
  if (!action) return res.status(404).json({ error: "Action not found" });
  if (action.status === "CLOSED") {
    return res.status(409).json({ error: "Cannot change status of a closed action" });
  }
  if (action.assignedToId !== req.user.id && req.user.role !== "TECHNICAL_MANAGER") {
    return res.status(403).json({ error: "Only the assignee can update this action" });
  }

  const updated = await prisma.action.update({
    where: { id: action.id },
    data: {
      status: parsed.data.status,
      comments: parsed.data.comments !== undefined ? parsed.data.comments : action.comments,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ACTION_STATUS_UPDATED",
    entityType: "Action",
    entityId: action.id,
    metadata: { status: parsed.data.status },
  });

  res.json(updated);
});

router.post("/:id/verify", requireAuth, requireRole(), async (req, res) => {
  const action = await prisma.action.findUnique({ where: { id: req.params.id } });
  if (!action) return res.status(404).json({ error: "Action not found" });
  if (action.status !== "COMPLETED") {
    return res.status(409).json({ error: "Only a completed action can be verified and closed" });
  }

  const updated = await prisma.action.update({
    where: { id: action.id },
    data: { status: "CLOSED", verifiedById: req.user.id, verifiedAt: new Date() },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ACTION_VERIFIED_CLOSED",
    entityType: "Action",
    entityId: action.id,
  });

  res.json(updated);
});

module.exports = router;
