const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireProjectMember } = require("../middleware/rbac");
const { recordAudit } = require("../audit");

const router = express.Router();

const ALLOWED_ENTITY_TYPES = ["MaterialRequisition", "Action", "Instruction"];

// Resolve projectId from an entity so the caller doesn't have to pass it
// and we can do a project-membership check.
async function resolveProjectId(entityType, entityId) {
  if (entityType === "MaterialRequisition") {
    const r = await prisma.materialRequisition.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return r?.projectId ?? null;
  }
  if (entityType === "Action") {
    const a = await prisma.action.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return a?.projectId ?? null;
  }
  if (entityType === "Instruction") {
    const i = await prisma.instruction.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return i?.projectId ?? null;
  }
  return null;
}

const bodySchema = z.object({ body: z.string().min(1).max(2000) });

// GET /comments/:entityType/:entityId — list comments for a record
router.get("/:entityType/:entityId", requireAuth, async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: "Invalid entityType" });
  }
  const projectId = await resolveProjectId(entityType, entityId);
  if (!projectId) return res.status(404).json({ error: "Entity not found" });

  // Any project member (or TM/Management) can read comments
  const isMember = await prisma.projectAssignment.findFirst({ where: { userId: req.user.id, projectId } });
  const isPrivileged = ["TECHNICAL_MANAGER", "MANAGEMENT"].includes(req.user.role);
  if (!isMember && !isPrivileged) return res.status(403).json({ error: "Not a project member" });

  const comments = await prisma.comment.findMany({
    where: { entityType, entityId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
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

  const projectId = await resolveProjectId(entityType, entityId);
  if (!projectId) return res.status(404).json({ error: "Entity not found" });

  const isMember = await prisma.projectAssignment.findFirst({ where: { userId: req.user.id, projectId } });
  const isPrivileged = ["TECHNICAL_MANAGER", "MANAGEMENT"].includes(req.user.role);
  if (!isMember && !isPrivileged) return res.status(403).json({ error: "Not a project member" });

  const comment = await prisma.comment.create({
    data: { entityType, entityId, projectId, authorId: req.user.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "COMMENT_ADDED",
    entityType,
    entityId,
    metadata: { projectId },
  });

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
