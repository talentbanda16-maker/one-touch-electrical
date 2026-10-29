const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectMember } = require("../middleware/rbac");
const { generateRefNumber } = require("../lib/refNumbers");

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

// Any user assigned to the project can raise an action — spec Section
// 14: "Create an action from any department report." Management is
// deliberately excluded (requireProjectMember, not requireProjectAccess)
// — full visibility doesn't mean write access.
//
// Deliberately one-directional: a worker raises an action, and it can
// only ever be addressed to the Technical Manager — they flag it, the
// TM decides what actually happens with it. The Technical Manager
// themselves never creates an Action — that's what Instructions are
// for (TM -> someone). Keeping the two flows strictly separate (Actions
// always flow toward the TM, Instructions always flow away from them)
// is deliberate, not an oversight.
router.post("/", requireAuth, requireProjectMember, async (req, res) => {
  if (req.user.role === "TECHNICAL_MANAGER") {
    return res.status(403).json({ error: "The Technical Manager can't raise an Action — use Instructions instead" });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { projectId, description, assignedToId, dueDate, priority, sourceReportId } = parsed.data;

  const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!assignee || assignee.role !== "TECHNICAL_MANAGER") {
    return res.status(400).json({ error: "Actions you raise can only be assigned to the Technical Manager" });
  }

  const refNumber = await generateRefNumber("action");

  const action = await prisma.action.create({
    data: {
      projectId,
      description,
      assignedToId,
      dueDate: new Date(dueDate),
      priority,
      sourceReportId,
      createdById: req.user.id,
      refNumber,
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

// Technical Manager sees everything (optionally filtered by project);
// Management sees actions the Technical Manager personally raised and
// assigned to a worker — a running view of jobs being delegated across
// the team, not actions workers raised (those already go to the TM
// anyway) and not just ones assigned back to the TM; everyone else sees
// only actions assigned to them.
router.get("/", requireAuth, async (req, res) => {
  const { projectId, sourceType } = req.query;
  const where = {};
  if (projectId) where.projectId = projectId;
  if (sourceType) where.sourceReport = { type: sourceType };
  // Management previously only saw actions the TM personally created —
  // that concept no longer exists (the TM can't raise an Action any
  // more, only receive one), so Management's read-only oversight now
  // just means "no extra filter," same scope the TM sees.
  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    // Actions can now only ever be assigned to the TM, so "assigned to
    // me" alone would show a non-TM user nothing at all — including
    // actions they themselves just raised. They need to see what they
    // raised (to track it), even though only the TM can change its
    // status; assignedToId stays in the OR for older rows and as a
    // structural safety net, not because it's expected to match anyone
    // but the TM going forward.
    where.OR = [{ assignedToId: req.user.id }, { createdById: req.user.id }];
  }

  const showArchived = req.query.archived === "true";
  where.isArchived = showArchived;

  const actions = await prisma.action.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      sourceReport: { select: { id: true, type: true, reportDate: true } },
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
  // Absolute, not data-dependent: only the Technical Manager can ever
  // change an Action's status, full stop — not "whoever it happens to
  // be assigned to." Actions can now only be raised to the TM, so this
  // is also just future-proofing against older rows still assigned to
  // someone else from before that rule existed.
  if (req.user.role !== "TECHNICAL_MANAGER") {
    return res.status(403).json({ error: "Only the Technical Manager can update an action's status" });
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

// Archive an action (soft-delete) — Technical Manager only.
router.patch("/:id/archive", requireAuth, async (req, res) => {
  if (req.user.role !== "TECHNICAL_MANAGER") {
    return res.status(403).json({ error: "Only the Technical Manager can archive an action" });
  }

  const action = await prisma.action.findUnique({ where: { id: req.params.id } });
  if (!action) return res.status(404).json({ error: "Action not found" });

  const updated = await prisma.action.update({
    where: { id: action.id },
    data: { isArchived: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ACTION_ARCHIVED",
    entityType: "Action",
    entityId: action.id,
  });

  res.json(updated);
});

module.exports = router;
