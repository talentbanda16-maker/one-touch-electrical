const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get("/summary", requireAuth, requireRole(), async (_req, res) => {
  const today = startOfToday();
  const now = new Date();

  const [
    activeProjects,
    reportsToday,
    pendingApprovals,
    openActions,
    overdueActions,
    openInstructions,
    overdueInstructions,
  ] = await Promise.all([
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.report.count({ where: { reportDate: { gte: today } } }),
    prisma.report.count({ where: { status: "SUBMITTED" } }),
    prisma.action.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.action.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } } }),
    prisma.instruction.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.instruction.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } } }),
  ]);

  res.json({
    activeProjects,
    reportsToday,
    pendingApprovals,
    openActions,
    overdueActions,
    openInstructions,
    overdueInstructions,
  });
});

module.exports = router;
