const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { recordAudit } = require("../audit");

const router = express.Router();
const fmtN = (v) => (v != null ? Number(v) : 0);

function enrichItem(item) {
  const qtyNeeded    = fmtN(item.qtyNeeded);
  const qtyOrdered   = fmtN(item.qtyOrdered);
  const unitPrice       = fmtN(item.unitPrice);
  const budgetUnitPrice = fmtN(item.budgetUnitPrice);
  const reorderLevel    = fmtN(item.reorderLevel);
  // Delivered and Used come from linked Stores transactions (read-only from Stores dept)
  const stockLines   = item.stockTransactions ?? [];
  const qtyDelivered = stockLines.filter((l) => l.direction === "RECEIVED").reduce((s, l) => s + fmtN(l.quantity), 0);
  const qtyUsed      = stockLines.filter((l) => l.direction === "ISSUED").reduce((s, l) => s + fmtN(l.quantity), 0);
  const balance      = qtyDelivered - qtyUsed;
  const isLow        = reorderLevel > 0 && balance > 0 && balance <= reorderLevel;
  const totalCost    = qtyOrdered * unitPrice;
  const budgetCost   = qtyNeeded * budgetUnitPrice;
  const variance     = totalCost - budgetCost;
  return {
    id: item.id, projectId: item.projectId, name: item.name, unit: item.unit,
    qtyNeeded, qtyOrdered, qtyDelivered, qtyUsed, balance,
    unitPrice, budgetUnitPrice, reorderLevel,
    isLow, totalCost, budgetCost, variance,
    order: item.order,
    createdBy: item.createdBy ? { id: item.createdBy.id, name: item.createdBy.name, role: item.createdBy.role } : null,
    createdAt: item.createdAt,
    usageLogs: (item.usageLogs ?? []).map((l) => ({
      id: l.id, qty: fmtN(l.qty), date: l.date, notes: l.notes,
      recordedBy: l.recordedBy?.name ?? "—",
    })),
  };
}

// GET /procurement?projectId=X
router.get("/", requireAuth, requireRole("QS", "FINANCE", "TECHNICAL_MANAGER", "MANAGEMENT", "STORESMAN"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const items = await prisma.bomItem.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      createdBy: { select: { id: true, name: true, role: true } },
      usageLogs: { include: { recordedBy: { select: { name: true } } }, orderBy: { date: "desc" } },
      stockTransactions: { select: { direction: true, quantity: true } },
    },
  });
  res.json(items.map(enrichItem));
});

// POST /procurement/sync-from-boq — auto-create BOM items from BOQ template
router.post("/sync-from-boq", requireAuth, requireRole("QS"), async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const boqItems = await prisma.projectBoqItem.findMany({ where: { projectId } });
  let created = 0, updated = 0;
  for (const boq of boqItems) {
    if (!boq.description?.trim()) continue;
    const existing = await prisma.bomItem.findFirst({
      where: { projectId, name: { equals: boq.description.trim(), mode: "insensitive" } },
    });
    if (existing) {
      await prisma.bomItem.update({
        where: { id: existing.id },
        data: { qtyNeeded: boq.contractQuantity || 0, budgetUnitPrice: boq.contractRate || 0, unit: boq.unit || existing.unit },
      });
      updated++;
    } else {
      const count = await prisma.bomItem.count({ where: { projectId } });
      const newItem = await prisma.bomItem.create({
        data: {
          projectId, name: boq.description.trim(), unit: boq.unit || "",
          qtyNeeded: boq.contractQuantity || 0, qtyOrdered: 0,
          unitPrice: 0, budgetUnitPrice: boq.contractRate || 0,
          reorderLevel: 0, order: count, createdById: req.user.id,
        },
      });
      await recordAudit({
        userId: req.user.id,
        action: "BOM_ITEM_ADDED",
        entityType: "BomItem",
        entityId: newItem.id,
        metadata: { name: newItem.name, unit: newItem.unit, projectId, source: "boq_sync" },
      });
      created++;
    }
  }
  res.json({ created, updated });
});

// POST /procurement — add material
router.post("/", requireAuth, requireRole("QS"), async (req, res) => {
  const { projectId, name, unit, qtyNeeded, qtyOrdered, unitPrice, budgetUnitPrice, reorderLevel } = req.body;
  if (!projectId || !name?.trim()) return res.status(400).json({ error: "projectId and name required" });
  const count = await prisma.bomItem.count({ where: { projectId } });
  const item = await prisma.bomItem.create({
    data: {
      projectId, name: name.trim(), unit: unit ?? "",
      qtyNeeded: qtyNeeded ?? 0, qtyOrdered: qtyOrdered ?? 0,
      unitPrice: unitPrice ?? 0, budgetUnitPrice: budgetUnitPrice ?? 0,
      reorderLevel: reorderLevel ?? 0, order: count,
      createdById: req.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, role: true } },
      usageLogs: true,
      stockTransactions: { select: { direction: true, quantity: true } },
    },
  });
  await recordAudit({
    userId: req.user.id,
    action: "BOM_ITEM_ADDED",
    entityType: "BomItem",
    entityId: item.id,
    metadata: { name: item.name, unit: item.unit, projectId },
  });
  res.json(enrichItem(item));
});

// PATCH /procurement/:id — update quantities / prices
router.patch("/:id", requireAuth, requireRole("QS"), async (req, res) => {
  const allowed = ["name","unit","qtyNeeded","qtyOrdered","unitPrice","budgetUnitPrice","reorderLevel"];
  const data = {};
  for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
  const item = await prisma.bomItem.update({
    where: { id: req.params.id }, data,
    include: {
      usageLogs: { include: { recordedBy: { select: { name: true } } }, orderBy: { date: "desc" } },
      stockTransactions: { select: { direction: true, quantity: true } },
    },
  });
  res.json(enrichItem(item));
});

// POST /procurement/:id/usage — record usage (subtracts from stock)
router.post("/:id/usage", requireAuth, requireRole("QS"), async (req, res) => {
  const { qty, notes, date } = req.body;
  if (!qty || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) return res.status(400).json({ error: "qty must be a positive number" });
  const [log, item] = await prisma.$transaction([
    prisma.bomUsageLog.create({
      data: { bomItemId: req.params.id, qty: parseFloat(qty), notes: notes ?? null, date: date ? new Date(date) : new Date(), recordedById: req.user.id },
      include: { recordedBy: { select: { name: true } } },
    }),
    prisma.bomItem.update({
      where: { id: req.params.id },
      data: { qtyUsed: { increment: parseFloat(qty) } },
      include: { usageLogs: { include: { recordedBy: { select: { name: true } } }, orderBy: { date: "desc" } } },
    }),
  ]);
  res.json(enrichItem(item));
});

// DELETE /procurement/:id
router.delete("/:id", requireAuth, requireRole("QS"), async (req, res) => {
  await prisma.bomItem.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// GET /procurement/timeline — monthly expenditure from usage logs for this QS
router.get("/timeline", requireAuth, requireRole("QS", "TECHNICAL_MANAGER", "MANAGEMENT"), async (req, res) => {
  let projectIds;
  if (["TECHNICAL_MANAGER", "MANAGEMENT", "ENGINEER"].includes(req.user.role)) {
    const all = await prisma.project.findMany({ select: { id: true } });
    projectIds = all.map((p) => p.id);
  } else {
    const assignments = await prisma.projectAssignment.findMany({
      where: { userId: req.user.id },
      select: { projectId: true },
    });
    projectIds = assignments.map((a) => a.projectId);
  }
  if (projectIds.length === 0) return res.json([]);

  const usageLogs = await prisma.bomUsageLog.findMany({
    where: { bomItem: { projectId: { in: projectIds } } },
    include: { bomItem: { select: { unitPrice: true } } },
    orderBy: { date: "asc" },
  });

  const monthMap = new Map();
  for (const log of usageLogs) {
    const month = new Date(log.date).toISOString().slice(0, 7);
    const cost = fmtN(log.qty) * fmtN(log.bomItem.unitPrice);
    monthMap.set(month, (monthMap.get(month) ?? 0) + cost);
  }

  const timeline = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  res.json(timeline);
});

module.exports = router;
