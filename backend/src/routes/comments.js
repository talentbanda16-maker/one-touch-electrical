const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireProjectMember } = require("../middleware/rbac");
const { recordAudit } = require("../audit");
const { notify } = require("../lib/notifications");

const router = express.Router();

const ALLOWED_ENTITY_TYPES = ["MaterialRequisition", "Action", "Instruction"];

// Resolve projectId + direct participants for an entity.
// Comments are private to these participants — only they, the TM, and
// Management can read or post. No other project members can see them.
async function resolveEntity(entityType, entityId) {
  if (entityType === "MaterialRequisition") {
    const r = await prisma.materialRequisition.findUnique({
      where: { id: entityId },
      select: { projectId: true, requestedById: true, approvedById: true, fulfilledById: true },
    });
    if (!r) return null;
    return { projectId: r.projectId, participantIds: [r.requestedById, r.approvedById, r.fulfilledById].filter(Boolean) };
  }
  if (entityType === "Action") {
    const a = await prisma.action.findUnique({
      where: { id: entityId },
      select: { projectId: true, assignedToId: true, createdById: true },
    });
    if (!a) return null;
    return { projectId: a.projectId, participantIds: [a.assignedToId, a.createdById].filter(Boolean) };
  }
  if (entityType === "Instruction") {
    const i = await prisma.instruction.findUnique({
      where: { id: entityId },
      select: { projectId: true, personResponsibleId: true, issuedById: true, sourceActionId: true },
    });
    if (!i) return null;
    return {
      projectId: i.projectId,
      participantIds: [i.personResponsibleId, i.issuedById].filter(Boolean),
      sourceActionId: i.sourceActionId,
    };
  }
  return null;
}

// An instruction that was auto-created from an Action reply shares that
// action's chat thread, so the whole conversation (original request + reply)
// shows up on the instruction — one continuous WhatsApp-style thread.
async function resolveCommentTarget(entityType, entityId) {
  const entity = await resolveEntity(entityType, entityId);
  if (!entity) return null;
  if (entityType === "Instruction" && entity.sourceActionId) {
    const action = await resolveEntity("Action", entity.sourceActionId);
    if (action) {
      // Access is granted to the instruction's participants OR the action's.
      return {
        entityType: "Action",
        entityId: entity.sourceActionId,
        projectId: action.projectId,
        participantIds: [...new Set([...entity.participantIds, ...action.participantIds])],
      };
    }
  }
  return { entityType, entityId, projectId: entity.projectId, participantIds: entity.participantIds };
}

function canAccessComments(user, entity) {
  if (["TECHNICAL_MANAGER", "MANAGEMENT"].includes(user.role)) return true;
  return entity.participantIds.includes(user.id);
}

const bodySchema = z.object({ body: z.string().min(1).max(2000) });

// GET /comments/:entityType/:entityId — list comments for a record
router.get("/:entityType/:entityId", requireAuth, async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: "Invalid entityType" });
  }
  const target = await resolveCommentTarget(entityType, entityId);
  if (!target) return res.status(404).json({ error: "Entity not found" });
  if (!canAccessComments(req.user, target)) return res.status(403).json({ error: "Access denied" });

  const comments = await prisma.comment.findMany({
    where: { entityType: target.entityType, entityId: target.entityId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  // For an Action thread, show the original request (the action's description)
  // as the first chat bubble from whoever raised it — so the conversation reads
  // as: their request, then the replies.
  if (target.entityType === "Action") {
    const action = await prisma.action.findUnique({
      where: { id: target.entityId },
      select: {
        description: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
    if (action?.description && action.createdBy) {
      comments.unshift({
        id: `origin:${target.entityId}`,
        body: action.description,
        createdAt: action.createdAt,
        author: action.createdBy,
        synthetic: true,
      });
    }
  }

  res.json(comments);
});

// POST /comments/:entityType/:entityId — add a comment
router.post("/:entityType/:entityId", requireAuth, async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: "Invalid entityType" });
  }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const target = await resolveCommentTarget(entityType, entityId);
  if (!target) return res.status(404).json({ error: "Entity not found" });
  if (!canAccessComments(req.user, target)) return res.status(403).json({ error: "Access denied" });
  const { projectId } = target;

  // The reply is stored on the shared thread (the action, if this started
  // from one) so the whole conversation stays in one place.
  const comment = await prisma.comment.create({
    data: { entityType: target.entityType, entityId: target.entityId, projectId, authorId: req.user.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "COMMENT_ADDED",
    entityType: target.entityType,
    entityId: target.entityId,
    metadata: { projectId },
  });

  // When the TM (the person the action is assigned to) replies on an Action,
  // auto-create a formal Instruction to the person who raised the action —
  // but only the first time, so follow-up chat doesn't spawn new instructions.
  if (target.entityType === "Action") {
    const action = await prisma.action.findUnique({
      where: { id: target.entityId },
      select: { createdById: true, projectId: true, assignedToId: true },
    });
    const existing = action
      ? await prisma.instruction.findFirst({ where: { sourceActionId: target.entityId } })
      : null;
    if (action && req.user.id === action.assignedToId && !existing) {
      const count = await prisma.instruction.count({ where: { projectId: action.projectId } });
      const instructionNumber = `INS-${String(count + 1).padStart(3, "0")}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      const instruction = await prisma.instruction.create({
        data: {
          projectId: action.projectId,
          instructionNumber,
          description: parsed.data.body,
          personResponsibleId: action.createdById,
          issuedById: req.user.id,
          dueDate,
          priority: "MEDIUM",
          sourceActionId: target.entityId,
        },
      });
      await notify({
        userId: action.createdById,
        type: "INSTRUCTION_ISSUED",
        title: "New instruction from Technical Manager",
        message: `${comment.author.name}: "${parsed.data.body.slice(0, 100)}${parsed.data.body.length > 100 ? "…" : ""}"`,
        projectId: action.projectId,
        link: "/instructions",
        dedupeKey: `INSTRUCTION_ISSUED:${instruction.id}`,
      });
    }
  }

  // Notify all participants except the commenter that a reply was posted
  const otherParticipants = target.participantIds.filter((id) => id !== req.user.id);
  await Promise.all(otherParticipants.map((userId) =>
    notify({
      userId,
      type: "COMMENT_ADDED",
      title: `New reply from ${comment.author.name}`,
      message: `${comment.author.name} replied: "${parsed.data.body.slice(0, 80)}${parsed.data.body.length > 80 ? "…" : ""}"`,
      projectId,
      link: entityType === "Action" ? "/actions" : entityType === "Instruction" ? "/instructions" : "/analytics/stores",
      dedupeKey: `COMMENT_ADDED:${comment.id}:${userId}`,
    })
  ));

  res.status(201).json(comment);
});

// DELETE /comments/:id — author or TM can delete
router.delete("/:id", requireAuth, async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  const canDelete = comment.authorId === req.user.id || req.user.role === "TECHNICAL_MANAGER";
  if (!canDelete) return res.status(403).json({ error: "Cannot delete this comment" });

  await prisma.comment.delete({ where: { id: req.params.id } });
  res.json({ deleted: true });
});

module.exports = router;
