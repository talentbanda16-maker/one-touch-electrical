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
  // ENGINEER sees the same full-scope data as TECHNICAL_MANAGER

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

// QS user dashboard summary — per-project financials + claim timeline
router.get("/qs-summary", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const fmtN = (v) => (v != null ? Number(v) : 0);

  // All projects this QS is assigned to (shows even with zero claims)
  const [assignments, reports] = await Promise.all([
    prisma.projectAssignment.findMany({
      where: { userId: req.user.id, role: "QS" },
      include: { project: { select: { id: true, name: true, code: true, status: true, contractValue: true, claimedAmount: true, paidAmount: true, receivedToDate: true, projectExpenses: true } } },
    }),
    prisma.report.findMany({
      where: { submittedById: req.user.id, type: "QS" },
      include: {
        project: { select: { id: true, name: true, code: true } },
        qsDetail: { include: { lines: true } },
      },
      orderBy: { reportDate: "asc" },
    }),
  ]);

  // Build a set of all project IDs from assignments (active projects only)
  const assignedProjects = new Map();
  for (const a of assignments) {
    if (a.project.status === "ACTIVE") {
      assignedProjects.set(a.project.id, a.project);
    }
  }

  // Group reports by project
  const reportsByProject = new Map();
  for (const report of reports) {
    const pid = report.projectId;
    if (!reportsByProject.has(pid)) reportsByProject.set(pid, []);
    reportsByProject.get(pid).push(report);
    // also include projects found via reports but not in assignment list
    if (!assignedProjects.has(pid)) assignedProjects.set(pid, report.project);
  }

  // Fetch all payments and procurement items for these projects in one query
  const projectIds = [...assignedProjects.keys()];
  const [allPayments, allBomItems, allClaimItems, allProgressLogs, allIncomeItems, allExpenseItems] = projectIds.length > 0
    ? await Promise.all([
        prisma.qsPayment.findMany({ where: { projectId: { in: projectIds } } }),
        prisma.bomItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, qtyOrdered: true, unitPrice: true } }),
        prisma.claimItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, amount: true } }),
        prisma.progressLog.findMany({ where: { projectId: { in: projectIds }, percentage: { not: null } }, select: { projectId: true, rowId: true, percentage: true, date: true }, orderBy: { date: 'asc' } }),
        prisma.incomeItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, amount: true } }),
        prisma.expenseItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, amount: true } }),
      ])
    : [[], [], [], [], [], []];
  const paymentsByProject = new Map();
  for (const p of allPayments) {
    paymentsByProject.set(p.projectId, (paymentsByProject.get(p.projectId) ?? 0) + fmtN(p.amountPaid));
  }
  const procurementByProject = new Map();
  for (const item of allBomItems) {
    const cost = fmtN(item.qtyOrdered) * fmtN(item.unitPrice);
    procurementByProject.set(item.projectId, (procurementByProject.get(item.projectId) ?? 0) + cost);
  }
  const claimItemsByProject = new Map();
  for (const item of allClaimItems) {
    claimItemsByProject.set(item.projectId, (claimItemsByProject.get(item.projectId) ?? 0) + fmtN(item.amount));
  }
  const incomeItemsByProject = new Map();
  for (const item of allIncomeItems) {
    incomeItemsByProject.set(item.projectId, (incomeItemsByProject.get(item.projectId) ?? 0) + fmtN(item.amount));
  }
  const expenseItemsByProject = new Map();
  for (const item of allExpenseItems) {
    expenseItemsByProject.set(item.projectId, (expenseItemsByProject.get(item.projectId) ?? 0) + fmtN(item.amount));
  }
  // Site progress: latest actual % per row per project, then average across rows
  const siteProgressByProject = new Map();
  for (const log of allProgressLogs) {
    if (!siteProgressByProject.has(log.projectId)) siteProgressByProject.set(log.projectId, new Map());
    siteProgressByProject.get(log.projectId).set(log.rowId, log.percentage); // logs ordered by date asc so last write = latest
  }
  const siteAvgByProject = new Map();
  for (const [pid, rowMap] of siteProgressByProject.entries()) {
    const vals = [...rowMap.values()];
    siteAvgByProject.set(pid, vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
  }

  const projects = [];
  for (const [pid, project] of assignedProjects.entries()) {
    const pReports = reportsByProject.get(pid) ?? [];
    const latest = pReports.length > 0 ? pReports[pReports.length - 1] : null;
    const lines = latest?.qsDetail?.lines ?? [];
    // Use project-level contract value set by TM; fall back to summing BOQ lines
    const contractValue = fmtN(project.contractValue) || lines.reduce((s, l) => s + fmtN(l.contractAmount), 0);
    // Priority: direct-entry amount → QS report lines → Claims tab items
    const claimedFromReports = lines.reduce((s, l) => s + fmtN(l.cumulativeAmount), 0);
    const claimedToDate = project.claimedAmount != null
      ? fmtN(project.claimedAmount)
      : claimedFromReports || (claimItemsByProject.get(pid) ?? 0);
    const totalPaid = project.paidAmount != null ? fmtN(project.paidAmount) : (paymentsByProject.get(pid) ?? 0);
    projects.push({
      id: project.id,
      name: project.name,
      code: project.code,
      contractValue,
      claimedToDate,
      totalPaid,
      balance: contractValue - claimedToDate,
      percentComplete: contractValue > 0 ? Math.round((claimedToDate / contractValue) * 100) : 0,
      procurementCost: procurementByProject.get(pid) ?? 0,
      siteProgress: siteAvgByProject.get(pid) ?? null,
      incomeTotal: incomeItemsByProject.get(pid) ?? 0,
      expenseTotal: expenseItemsByProject.get(pid) ?? 0,
      lastReportDate: latest?.reportDate ?? null,
      status: latest?.status ?? null,
      reportCount: pReports.length,
      approvedCount: pReports.filter((r) => r.status === "APPROVED").length,
      pendingCount:  pReports.filter((r) => r.status === "PENDING").length,
      returnedCount: pReports.filter((r) => r.status === "RETURNED").length,
    });
  }

  // Claim timeline — period amounts summed per month across all reports (aggregate)
  const timelineMap = new Map();
  // Per-project timelines for multi-line chart
  const projectTimelineMap = new Map(); // pid -> Map<month, periodAmt>
  for (const report of reports) {
    const month = new Date(report.reportDate).toISOString().slice(0, 7);
    const lines = report.qsDetail?.lines ?? [];
    const periodAmt = lines.reduce((s, l) => s + fmtN(l.periodAmount), 0);
    timelineMap.set(month, (timelineMap.get(month) ?? 0) + periodAmt);
    if (!projectTimelineMap.has(report.projectId)) projectTimelineMap.set(report.projectId, new Map());
    const ptm = projectTimelineMap.get(report.projectId);
    ptm.set(month, (ptm.get(month) ?? 0) + periodAmt);
  }
  const timeline = [...timelineMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  // Build per-project cumulative timelines aligned to all months
  const allMonths = [...timelineMap.keys()].sort();
  const projectTimelines = {};
  for (const p of projects) {
    const ptm = projectTimelineMap.get(p.id) ?? new Map();
    let cumulative = 0;
    projectTimelines[p.id] = allMonths.map((month) => {
      cumulative += ptm.get(month) ?? 0;
      return { month, cumulative };
    });
  }

  res.json({ projects, timeline, allMonths, projectTimelines });
});

// Outstanding claims — approved but not fully paid, with aging
router.get("/qs-outstanding", requireAuth, requireRole("QS"), async (req, res) => {
  const fmtN = (v) => (v != null ? Number(v) : 0);

  const assignments = await prisma.projectAssignment.findMany({
    where: { userId: req.user.id, role: "QS" },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  const projectIds = assignments.map((a) => a.projectId);
  if (projectIds.length === 0) return res.json([]);

  const reports = await prisma.report.findMany({
    where: { submittedById: req.user.id, type: "QS", projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, name: true, code: true } },
      qsDetail: { include: { lines: true } },
      qsPayments: true,
    },
    orderBy: { reportDate: "asc" },
  });

  // Number claims per project
  const claimCountByProject = new Map();
  const today = new Date();

  const rows = reports.map((r) => {
    const pid = r.project.id;
    claimCountByProject.set(pid, (claimCountByProject.get(pid) ?? 0) + 1);
    const claimNumber = claimCountByProject.get(pid);
    const lines = r.qsDetail?.lines ?? [];
    const periodAmount = lines.reduce((s, l) => s + fmtN(l.periodAmount), 0);
    const paidAmount   = r.qsPayments.reduce((s, p) => s + fmtN(p.amountPaid), 0);
    const outstanding  = Math.max(0, periodAmount - paidAmount);
    const daysSince    = Math.floor((today - new Date(r.reportDate)) / (1000 * 60 * 60 * 24));
    return {
      claimId: r.id,
      claimNumber,
      project: r.project,
      reportDate: r.reportDate,
      status: r.status,
      periodAmount,
      paidAmount,
      outstanding,
      daysSince,
    };
  }).filter((r) => r.outstanding > 0);

  res.json(rows);
});

// ── Finance project summary (per-project financials for Finance role) ─────────
router.get("/finance-project", requireAuth, requireRole("FINANCE"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const fmtN = (v) => (v != null ? Number(v) : 0);

  const [project, allReports, payments, bomItems, claimItems] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, code: true, contractValue: true, claimedAmount: true, paidAmount: true } }),
    prisma.report.findMany({ where: { projectId, type: "QS", status: "APPROVED" }, include: { qsDetail: { include: { lines: true } } }, orderBy: { reportDate: "asc" } }),
    prisma.qsPayment.findMany({ where: { projectId } }),
    prisma.bomItem.findMany({ where: { projectId }, select: { qtyOrdered: true, unitPrice: true } }),
    prisma.claimItem.findMany({ where: { projectId }, select: { amount: true } }),
  ]);

  if (!project) return res.status(404).json({ error: "Project not found" });

  const latest = allReports.length > 0 ? allReports[allReports.length - 1] : null;
  const lines = latest?.qsDetail?.lines ?? [];
  const contractValue = fmtN(project.contractValue) || lines.reduce((s, l) => s + fmtN(l.contractAmount), 0);
  const claimedFromReports = lines.reduce((s, l) => s + fmtN(l.cumulativeAmount), 0);
  const claimedToDate = project.claimedAmount != null
    ? fmtN(project.claimedAmount)
    : claimedFromReports || claimItems.reduce((s, i) => s + fmtN(i.amount), 0);
  const totalPaid = project.paidAmount != null
    ? fmtN(project.paidAmount)
    : payments.reduce((s, p) => s + fmtN(p.amountPaid), 0);

  res.json({
    id: project.id, name: project.name, code: project.code,
    contractValue, claimedToDate, totalPaid,
    outstanding: Math.max(0, claimedToDate - totalPaid),
    balance: contractValue - claimedToDate,
  });
});

// ── Income Items ─────────────────────────────────────────────────────────────
router.get("/income-items", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const items = await prisma.incomeItem.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  res.json(items);
});
router.post("/income-items", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId, description, amount } = req.body;
  if (!projectId || !description) return res.status(400).json({ error: "projectId and description required" });
  const item = await prisma.incomeItem.create({ data: { projectId, description, amount: parseFloat(amount) || 0 } });
  res.json(item);
});
router.delete("/income-items/:id", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  await prisma.incomeItem.delete({ where: { id: req.params.id } }).catch(() => {});
  res.status(204).end();
});

// ── Expense Items ─────────────────────────────────────────────────────────────
router.get("/expense-items", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const items = await prisma.expenseItem.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  res.json(items);
});
router.post("/expense-items", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId, description, amount } = req.body;
  if (!projectId || !description) return res.status(400).json({ error: "projectId and description required" });
  const item = await prisma.expenseItem.create({ data: { projectId, description, amount: parseFloat(amount) || 0 } });
  res.json(item);
});
router.delete("/expense-items/:id", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  await prisma.expenseItem.delete({ where: { id: req.params.id } }).catch(() => {});
  res.status(204).end();
});

// ── Claim Items (simple editable list per project) ──────────────────────────
router.get("/claim-items", requireAuth, requireRole("QS", "FINANCE", "MANAGEMENT"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const items = await prisma.claimItem.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  res.json(items);
});

router.post("/claim-items", requireAuth, requireRole("QS", "MANAGEMENT"), async (req, res) => {
  const { projectId, description, amount } = req.body;
  if (!projectId || !description) return res.status(400).json({ error: "projectId and description required" });
  const item = await prisma.claimItem.create({ data: { projectId, description, amount: parseFloat(amount) || 0 } });
  res.json(item);
});

router.delete("/claim-items/:id", requireAuth, requireRole("QS", "MANAGEMENT"), async (req, res) => {
  await prisma.claimItem.delete({ where: { id: req.params.id } }).catch(() => {});
  res.status(204).end();
});

// Returns paidAmount for a project — accessible to QS and Finance
router.get("/project-paid", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { paidAmount: true } });
  res.json({ paidAmount: project ? Number(project.paidAmount ?? 0) : 0 });
});

// QS can directly set claimed amount and paid amount without going through a full report
router.patch("/project-financials", requireAuth, requireRole("QS", "FINANCE"), async (req, res) => {
  const { projectId, contractValue, claimedAmount, paidAmount, receivedToDate, projectExpenses } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const data = {};
  if (contractValue    != null) data.contractValue    = parseFloat(contractValue);
  if (claimedAmount    != null) data.claimedAmount    = parseFloat(claimedAmount);
  if (paidAmount       != null) data.paidAmount       = parseFloat(paidAmount);
  if (receivedToDate   != null) data.receivedToDate   = parseFloat(receivedToDate);
  if (projectExpenses  != null) data.projectExpenses  = parseFloat(projectExpenses);
  const project = await prisma.project.update({ where: { id: projectId }, data });
  res.json({ id: project.id, contractValue: project.contractValue, claimedAmount: project.claimedAmount, paidAmount: project.paidAmount });
});

// ── Stores summary tiles (for Storesman dashboard) ───────────────────────────
router.get("/stores-summary", requireAuth, requireRole("STORESMAN", "TECHNICAL_MANAGER", "MANAGEMENT"), async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    // Use provided date or default to today
    const dateParam = req.query.date;
    const targetDay = dateParam
      ? new Date(dateParam + "T00:00:00.000Z")
      : startOfToday();
    const nextDay = new Date(targetDay);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    // Fetch all report IDs for this project
    const reports = await prisma.report.findMany({
      where: { projectId, type: "STORES" },
      select: { id: true, reportDate: true, storesDetail: { select: { id: true } } },
    });

    const allDetailIds    = reports.map((r) => r.storesDetail?.id).filter(Boolean);
    const todayDetailIds  = reports
      .filter((r) => {
        const d = new Date(r.reportDate);
        return d >= targetDay && d < nextDay && r.storesDetail?.id;
      })
      .map((r) => r.storesDetail.id);

    const [receivedToday, issuedToday, returnedToday, allLines] = await Promise.all([
      todayDetailIds.length > 0
        ? prisma.stockTransactionLine.count({ where: { storesReportDetailId: { in: todayDetailIds }, direction: "RECEIVED" } })
        : Promise.resolve(0),
      todayDetailIds.length > 0
        ? prisma.stockTransactionLine.count({ where: { storesReportDetailId: { in: todayDetailIds }, direction: "ISSUED" } })
        : Promise.resolve(0),
      todayDetailIds.length > 0
        ? prisma.stockTransactionLine.count({ where: { storesReportDetailId: { in: todayDetailIds }, direction: "RETURNED" } })
        : Promise.resolve(0),
      allDetailIds.length > 0
        ? prisma.stockTransactionLine.findMany({ where: { storesReportDetailId: { in: allDetailIds } }, select: { itemName: true } })
        : Promise.resolve([]),
    ]);

    const totalItems = new Set(allLines.map((l) => l.itemName.trim().toLowerCase())).size;

    // Compute running balances to find out-of-stock items
    const itemMap = {};
    const allLinesWithDir = allDetailIds.length > 0
      ? await prisma.stockTransactionLine.findMany({
          where: { storesReportDetailId: { in: allDetailIds } },
          select: { itemName: true, direction: true, quantity: true },
        })
      : [];
    for (const line of allLinesWithDir) {
      const key = line.itemName.trim().toLowerCase();
      if (!itemMap[key]) itemMap[key] = { name: line.itemName, balance: 0 };
      const qty = Number(line.quantity) || 0;
      if (line.direction === "RECEIVED")     itemMap[key].balance += qty;
      if (line.direction === "RETURNED")     itemMap[key].balance += qty;
      if (line.direction === "ISSUED")       itemMap[key].balance -= qty;
      if (line.direction === "DAMAGED_LOST") itemMap[key].balance -= qty;
    }
    const outOfStock = Object.values(itemMap)
      .filter((i) => i.balance <= 0)
      .map((i) => ({ name: i.name, balance: i.balance }));

    const lowStock = Object.values(itemMap)
      .filter((i) => i.balance > 0 && i.balance <= 10)
      .map((i) => ({ name: i.name, balance: i.balance }));

    res.json({ receivedToday, issuedToday, returnedToday, totalItems, outOfStock, lowStock });
  } catch (err) {
    console.error("stores-summary error:", err);
    res.status(500).json({ error: "Failed to load stores summary" });
  }
});

module.exports = router;
