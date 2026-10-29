const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CLOSED"];

const createSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().min(1),
  personResponsibleId: z.string().uuid(),
  dueDate: z.string().date(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
});

// Only the Technical Manager issues instructions (spec Section 13).
router.post("/", requireAuth, requireRole(), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { projectId, description, personResponsibleId, dueDate, priority } = parsed.data;

  const count = await prisma.instruction.count({ where: { projectId } });
  const instructionNumber = `INS-${String(count + 1).padStart(3, "0")}`;

  const instruction = await prisma.instruction.create({
    data: {
      projectId,
      instructionNumber,
      description,
      personResponsibleId,
      dueDate: new Date(dueDate),
      priority,
      issuedById: req.user.id,
    },
    include: { personResponsible: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_ISSUED",
    entityType: "Instruction",
    entityId: instruction.id,
    metadata: { projectId, personResponsibleId },
  });

  res.status(201).json(instruction);
});

// Technical Manager sees everything (optionally filtered by project);
// Management sees every instruction too — instructions are always
// issued by the Technical Manager (only the TM can create one), so
// this is really just "no extra filter," kept explicit so it reads the
// same way as the Actions equivalent and stays correct if that ever
// changes; everyone else sees only instructions assigned to them.
router.get("/", requireAuth, async (req, res) => {
  const { projectId } = req.query;
  const where = { isArchived: req.query.archived === "true" };
  if (projectId) where.projectId = projectId;
  if (req.user.role === "MANAGEMENT") {
    where.issuedBy = { role: "TECHNICAL_MANAGER" };
  } else if (req.user.role !== "TECHNICAL_MANAGER") {
    where.personResponsibleId = req.user.id;
  }

  const instructions = await prisma.instruction.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, code: true } },
      personResponsible: { select: { id: true, name: true } },
      issuedBy: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const withOverdue = instructions.map((i) => ({
    ...i,
    isOverdue: ["OPEN", "IN_PROGRESS"].includes(i.status) && new Date(i.dueDate) < now,
  }));

  res.json(withOverdue);
});

const statusUpdateSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]) });

// Deliberately one-directional, same principle as Actions: the
// Technical Manager issues an instruction but never moves its status
// themselves — only the person it was actually sent to can, and it's
// reflected immediately since it's the same record either side reads.
// The TM's only lever is the separate /verify step below (spec:
// "Technical Manager verification and closure") — a distinct final
// confirmation, not a way to edit the in-progress status.
router.patch("/:id/status", requireAuth, async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const instruction = await prisma.instruction.findUnique({ where: { id: req.params.id } });
  if (!instruction) return res.status(404).json({ error: "Instruction not found" });
  if (instruction.status === "CLOSED") {
    return res.status(409).json({ error: "Cannot change status of a closed instruction" });
  }
  if (instruction.personResponsibleId !== req.user.id) {
    return res.status(403).json({ error: "Only the person responsible can update this instruction" });
  }
  // Only CLOSED was actually protected before this — the person
  // responsible could silently revert their own instruction from
  // COMPLETED back to OPEN/IN_PROGRESS with no distinct trail.
  if (instruction.status === "COMPLETED" && parsed.data.status !== "COMPLETED") {
    return res.status(409).json({ error: "Cannot revert a completed instruction." });
  }

  const updated = await prisma.instruction.update({
    where: { id: instruction.id },
    data: { status: parsed.data.status },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_STATUS_UPDATED",
    entityType: "Instruction",
    entityId: instruction.id,
    metadata: { status: parsed.data.status },
  });

  res.json(updated);
});

router.post("/:id/verify", requireAuth, requireRole(), async (req, res) => {
  const instruction = await prisma.instruction.findUnique({ where: { id: req.params.id } });
  if (!instruction) return res.status(404).json({ error: "Instruction not found" });
  if (instruction.status !== "COMPLETED") {
    return res.status(409).json({ error: "Only a completed instruction can be verified and closed" });
  }

  const updated = await prisma.instruction.update({
    where: { id: instruction.id },
    data: { status: "CLOSED", verifiedById: req.user.id, verifiedAt: new Date() },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_VERIFIED_CLOSED",
    entityType: "Instruction",
    entityId: instruction.id,
  });

  res.json(updated);
});

// Archive an instruction (soft-delete) — Technical Manager only.
router.patch("/:id/archive", requireAuth, requireRole(), async (req, res) => {
  const instruction = await prisma.instruction.findUnique({ where: { id: req.params.id } });
  if (!instruction) return res.status(404).json({ error: "Instruction not found" });

  const updated = await prisma.instruction.update({
    where: { id: instruction.id },
    data: { isArchived: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_ARCHIVED",
    entityType: "Instruction",
    entityId: instruction.id,
  });

  res.json(updated);
});

module.exports = router;
