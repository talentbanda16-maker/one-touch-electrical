const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

// GET /progress — all rows + all cells + all active projects
router.get("/", requireAuth, requireRole("QS", "TECHNICAL_MANAGER", "MANAGEMENT"), async (req, res) => {
  const [rows, projects] = await Promise.all([
    prisma.progressRow.findMany({
      orderBy: { order: "asc" },
      include: { cells: true },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  res.json({ rows, projects });
});

// POST /progress/rows — add a new row
router.post("/rows", requireAuth, requireRole("QS"), async (req, res) => {
  const { label } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: "Label required" });
  const count = await prisma.progressRow.count();
  const row = await prisma.progressRow.create({ data: { label: label.trim(), order: count } });
  res.json(row);
});

// PATCH /progress/rows/:id — rename a row or set targetPct
router.patch("/rows/:id", requireAuth, requireRole("QS"), async (req, res) => {
  const { label, targetPct } = req.body;
  const data = {};
  if (label?.trim()) data.label = label.trim();
  if (targetPct !== undefined) data.targetPct = targetPct === null ? null : parseInt(targetPct);
  if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const row = await prisma.progressRow.update({ where: { id: req.params.id }, data });
  res.json(row);
});

// DELETE /progress/rows/:id — remove a row and its cells
router.delete("/rows/:id", requireAuth, requireRole("QS"), async (req, res) => {
  await prisma.progressRow.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// PUT /progress/cell — upsert a single cell value
router.put("/cell", requireAuth, requireRole("QS"), async (req, res) => {
  const { rowId, projectId, value } = req.body;
  if (!rowId || !projectId) return res.status(400).json({ error: "rowId and projectId required" });
  const cell = await prisma.progressCell.upsert({
    where: { rowId_projectId: { rowId, projectId } },
    update: { value: value ?? "" },
    create: { rowId, projectId, value: value ?? "" },
  });
  res.json(cell);
});

// POST /progress/log — upsert a daily progress entry for a row+project
// If an entry already exists for the same rowId+projectId+date, update only the non-null fields
// so logging Actual% never wipes a previously saved Target%, and vice versa.
router.post("/log", requireAuth, requireRole("QS"), async (req, res) => {
  const { rowId, projectId, date, percentage, targetPct, note } = req.body;
  if (!rowId || !projectId) return res.status(400).json({ error: "rowId and projectId required" });
  if (percentage == null && targetPct == null) return res.status(400).json({ error: "At least one of percentage or targetPct required" });

  const parsedDate = date ? new Date(date) : new Date();

  const existing = await prisma.progressLog.findFirst({
    where: { rowId, projectId, date: parsedDate },
  });

  let entry;
  if (existing) {
    entry = await prisma.progressLog.update({
      where: { id: existing.id },
      data: {
        ...(percentage != null && { percentage: parseInt(percentage) }),
        ...(targetPct != null && { targetPct: parseInt(targetPct) }),
        ...(note?.trim() && { note: note.trim() }),
      },
    });
  } else {
    entry = await prisma.progressLog.create({
      data: {
        rowId,
        projectId,
        date: parsedDate,
        percentage: percentage != null ? parseInt(percentage) : null,
        targetPct: targetPct != null ? parseInt(targetPct) : null,
        note: note?.trim() || null,
      },
    });
  }

  res.json(entry);
});

// GET /progress/log?projectId=xxx — all log entries for a project
router.get("/log", requireAuth, requireRole("QS", "TECHNICAL_MANAGER", "MANAGEMENT"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const logs = await prisma.progressLog.findMany({
    where: { projectId },
    orderBy: { date: "desc" },
  });
  res.json(logs);
});

module.exports = router;
