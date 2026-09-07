const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { computeProjectAnalytics, ensureTodaySnapshots } = require("../lib/analytics");
const { generateSystemNotifications } = require("../lib/notifications");

const router = express.Router();

// UTC-anchored — see the matching comment in lib/analytics.js.
function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const REPORT_SUBMITTING_ROLES = ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"];

// Technical Manager always passes (requireRole's rule); Management is
// explicitly allowed here — this endpoint used to be TM-only, which
// meant Management saw none of these numbers despite needing them for
// spec Section 12's Management Dashboard.
router.get("/summary", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const today = startOfToday();
  const now = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Best-effort — a snapshot failure shouldn't break the dashboard.
  ensureTodaySnapshots().catch((err) => console.error("Snapshot job failed:", err));
  generateSystemNotifications().catch((err) => console.error("Notification scan failed:", err));

  // Management's dashboard tracks jobs the Technical Manager is
  // actively delegating — actions the TM raised (regardless of who
  // it's assigned to) and instructions (always TM-issued) — so
  // Management sees it whenever the TM gives someone work to do. The
  // Technical Manager's own dashboard is unaffected — it still sees everything.
  const managementScope = req.user.role === "MANAGEMENT";
  const openActionsWhere = {
    status: { in: ["OPEN", "IN_PROGRESS"] },
    ...(managementScope ? { createdBy: { role: "TECHNICAL_MANAGER" } } : {}),
  };
  const openInstructionsWhere = {
    status: { in: ["OPEN", "IN_PROGRESS"] },
    ...(managementScope ? { issuedBy: { role: "TECHNICAL_MANAGER" } } : {}),
  };

  const [
    activeProjects,
    reportsToday,
    reportsTodayByType,
    // "Expected" = one report per (active project, report-submitting
    // assignment) per day — the simplest reading of "who should have
    // filed something today."
    expectedReportsToday,
    pendingApprovals,
    openActions,
    overdueActions,
    openInstructions,
    overdueInstructions,
    shortageNotes,
    sheIncidentAgg,
    openSheActions,
    overdueSheActions,
  ] = await Promise.all([
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.report.count({ where: { reportDate: { gte: today } } }),
    prisma.report.groupBy({ by: ["type"], where: { reportDate: { gte: today } }, _count: true }),
    prisma.projectAssignment.count({
      where: { role: { in: REPORT_SUBMITTING_ROLES }, project: { status: "ACTIVE" } },
    }),
    prisma.report.count({ where: { status: "SUBMITTED" } }),
    prisma.action.count({ where: openActionsWhere }),
    prisma.action.count({ where: { ...openActionsWhere, dueDate: { lt: now } } }),
    prisma.instruction.count({ where: openInstructionsWhere }),
    prisma.instruction.count({ where: { ...openInstructionsWhere, dueDate: { lt: now } } }),
    // Shortages — recent, not stuck in DRAFT, from any active project.
    prisma.storesReportDetail.findMany({
      where: {
        shortagesAndRequirements: { not: null },
        report: { status: { not: "DRAFT" }, reportDate: { gte: sevenDaysAgo }, project: { status: "ACTIVE" } },
      },
      include: { report: { select: { reportDate: true, project: { select: { id: true, name: true, code: true } } } } },
      orderBy: { report: { reportDate: "desc" } },
      take: 10,
    }),
    prisma.sheReportDetail.aggregate({
      where: { report: { status: "APPROVED", reportDate: { gte: thirtyDaysAgo }, project: { status: "ACTIVE" } } },
      _sum: { incidentCount: true, nearMissCount: true },
    }),
    prisma.action.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, sourceReport: { type: "SHE" }, project: { status: "ACTIVE" } },
    }),
    prisma.action.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        sourceReport: { type: "SHE" },
        project: { status: "ACTIVE" },
        dueDate: { lt: now },
      },
    }),
  ]);

  res.json({
    activeProjects,
    reportsToday,
    expectedReportsToday,
    reportsTodayByType: Object.fromEntries(reportsTodayByType.map((r) => [r.type, r._count])),
    pendingApprovals,
    openActions,
    overdueActions,
    openInstructions,
    overdueInstructions,
    materialShortages: shortageNotes.map((s) => ({
      project: s.report.project,
      date: s.report.reportDate,
      note: s.shortagesAndRequirements,
    })),
    sheIncidents: {
      last30Days: sheIncidentAgg._sum.incidentCount ?? 0,
      nearMisses30Days: sheIncidentAgg._sum.nearMissCount ?? 0,
      openCorrectiveActions: openSheActions,
      overdueCorrectiveActions: overdueSheActions,
    },
  });
});

// "Project progress by project" comparison (spec Section 17) — reuses
// the same per-project calculation as the single-project analytics page.
router.get("/projects-progress", requireAuth, requireRole("MANAGEMENT"), async (_req, res) => {
  const projects = await prisma.project.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  const results = await Promise.all(projects.map((p) => computeProjectAnalytics(p)));
  res.json(results);
});

module.exports = router;
