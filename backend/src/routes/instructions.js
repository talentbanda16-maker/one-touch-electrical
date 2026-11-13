const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { notify } = require("../lib/notifications");

const router = express.Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CLOSED"];

// Kanban board columns (Engineer + TM command board) map onto the existing
// status + verification fields, so dragging a card just writes status here.
const BOARD_COLUMN_LABELS = {
  pending: "Pending On-Site",
  in_progress: "In Progress",
  review: "Under Review",
  done: "Completed",
};
function statusToColumn(status) {
  if (status === "OPEN") return "pending";
  if (status === "IN_PROGRESS") return "in_progress";
  if (status === "COMPLETED") return "review";
  return "done"; // CLOSED
}

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
    include: { personResponsible: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, issuedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_ISSUED",
    entityType: "Instruction",
    entityId: instruction.id,
    metadata: { projectId, personResponsibleId },
  });

  // Notify the person the instruction was assigned to
  await notify({
    userId: personResponsibleId,
    type: "INSTRUCTION_ISSUED",
    title: "New instruction assigned to you",
    message: `${instruction.issuedBy?.name ?? "TM"} issued an instruction on ${instruction.project.name}: "${description}". Due ${new Date(dueDate).toLocaleDateString()}.`,
    projectId,
    link: "/instructions",
    dedupeKey: `INSTRUCTION_ISSUED:${instruction.id}`,
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

// ---------- Kanban board (Engineer + Technical Manager) ----------

// Board view: TM, Engineer and Management see EVERY instruction laid out by
// column. Unlike GET /, this is not scoped to "assigned to me" — the whole
// point is the command overview. Management can view but not move cards.
router.get("/board", requireAuth, requireRole("ENGINEER", "MANAGEMENT"), async (req, res) => {
  const { projectId } = req.query;
  const where = { isArchived: false };
  if (projectId) where.projectId = projectId;

  const instructions = await prisma.instruction.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, code: true } },
      personResponsible: { select: { id: true, name: true } },
      issuedBy: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });

  const now = new Date();
  const result = instructions.map((i) => ({
    ...i,
    isOverdue: ["OPEN", "IN_PROGRESS"].includes(i.status) && new Date(i.dueDate) < now,
    column: statusToColumn(i.status),
  }));

  res.json(result);
});

const boardMoveSchema = z.object({ column: z.enum(["pending", "in_progress", "review", "done"]) });

// Move a card between columns — Technical Manager or Engineer only. Dragging
// to "Completed" also stamps the verifier (the board's final sign-off);
// moving back out of Completed clears that stamp.
router.patch("/:id/board", requireAuth, requireRole("ENGINEER"), async (req, res) => {
  const parsed = boardMoveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const instruction = await prisma.instruction.findUnique({ where: { id: req.params.id } });
  if (!instruction) return res.status(404).json({ error: "Instruction not found" });

  const col = parsed.data.column;
  const data =
    col === "pending" ? { status: "OPEN", verifiedById: null, verifiedAt: null }
    : col === "in_progress" ? { status: "IN_PROGRESS", verifiedById: null, verifiedAt: null }
    : col === "review" ? { status: "COMPLETED", verifiedById: null, verifiedAt: null }
    : { status: "CLOSED", verifiedById: req.user.id, verifiedAt: new Date() };

  const updated = await prisma.instruction.update({
    where: { id: instruction.id },
    data,
    include: {
      project: { select: { id: true, name: true, code: true } },
      personResponsible: { select: { id: true, name: true } },
      issuedBy: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "INSTRUCTION_BOARD_MOVED",
    entityType: "Instruction",
    entityId: instruction.id,
    metadata: { column: col, status: data.status },
  });

  // Let the person responsible know their task moved on the board.
  const mover = req.user.role === "TECHNICAL_MANAGER" ? "Technical Manager" : "Engineer";
  await notify({
    userId: instruction.personResponsibleId,
    type: "INSTRUCTION_UPDATED",
    title: `Task moved to ${BOARD_COLUMN_LABELS[col]}`,
    message: `${mover} moved "${instruction.description}" to ${BOARD_COLUMN_LABELS[col]}.`,
    projectId: instruction.projectId,
    link: "/instructions",
    dedupeKey: `INSTRUCTION_BOARD_MOVED:${instruction.id}:${col}:${Date.now()}`,
  });

  res.json({ ...updated, column: statusToColumn(updated.status) });
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

  // Notify the TM who issued the instruction that status changed
  await notify({
    userId: instruction.issuedById,
    type: "INSTRUCTION_UPDATED",
    title: `Instruction updated to ${parsed.data.status.replace("_", " ")}`,
    message: `${instruction.personResponsible?.name ?? "Someone"} marked "${instruction.description}" as ${parsed.data.status.replace("_", " ").toLowerCase()}.`,
    projectId: instruction.projectId,
    link: "/instructions",
    dedupeKey: `INSTRUCTION_STATUS_UPDATED:${instruction.id}:${parsed.data.status}`,
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
