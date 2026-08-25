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

// Technical Manager/Management see everything (optionally filtered by
// project); everyone else sees only instructions assigned to them.
router.get("/", requireAuth, async (req, res) => {
  const { projectId } = req.query;
  const where = {};
  if (projectId) where.projectId = projectId;
  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
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

// Person responsible (or Technical Manager) moves it along; closure
// requires the separate /verify step below (spec: "Technical Manager
// verification and closure" — not a status the assignee can self-set).
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
  if (instruction.personResponsibleId !== req.user.id && req.user.role !== "TECHNICAL_MANAGER") {
    return res.status(403).json({ error: "Only the person responsible can update this instruction" });
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

module.exports = router;
