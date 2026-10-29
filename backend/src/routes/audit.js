const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

const PAGE_SIZE = 50;

// Audit trail viewer (spec Section 22) — the AuditLog table has been
// written to since Step 1, but nothing ever read it back. Technical
// Manager/Management only, same bar as every other oversight screen.
router.get("/", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const { action, entityType, userId, from, to, page } = req.query;

  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  res.json({ logs, total, page: pageNum, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
});

// Full history of a single record — all audit events for that entityId.
router.get("/entity/:entityId", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { entityId: req.params.entityId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(logs);
});

// Per-project timeline — all events for a project, newest-first, capped
// at 200 to keep the response lean. Used by the Activity Timeline page.
router.get("/project/:projectId/timeline", requireAuth, requireRole("TECHNICAL_MANAGER", "MANAGEMENT"), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { metadata: { path: ["projectId"], equals: req.params.projectId } },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

// Distinct action/entityType values actually present, so the frontend
// can offer real filter dropdowns instead of a hardcoded guess.
router.get("/filters", requireAuth, requireRole("MANAGEMENT"), async (_req, res) => {
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  res.json({
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType),
  });
});

module.exports = router;

