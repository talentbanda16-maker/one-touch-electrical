const prisma = require("../prisma");

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// BOQ progress/valuations/variations. Each report only carries that day's
// line items, so "current state" per BOQ item is the most recent report
// that mentioned it — mirrors how the QS report itself tracks cumulative
// quantity (each submission already carries the running total, not a delta).
async function computeQsAnalytics(project) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: "QS", status: "APPROVED" },
    include: { qsDetail: { include: { lines: true } } },
    orderBy: { reportDate: "asc" },
  });

  const latestByItem = new Map();
  const valuationByDate = new Map();

  for (const r of reports) {
    let dayValuation = 0;
    for (const l of r.qsDetail?.lines ?? []) {
      latestByItem.set(l.boqItemNumber, {
        boqItemNumber: l.boqItemNumber,
        description: l.description,
        contractQuantity: Number(l.contractQuantity),
        cumulativeQuantity: Number(l.cumulativeQuantity),
        balanceQuantity: Number(l.balanceQuantity),
        percentCompletion: l.percentCompletion,
        valuationAmount: l.valuationAmount != null ? Number(l.valuationAmount) : null,
        variationReference: l.variationReference,
        asOf: r.reportDate,
      });
      dayValuation += l.valuationAmount != null ? Number(l.valuationAmount) : 0;
    }
    const key = dateKey(r.reportDate);
    valuationByDate.set(key, (valuationByDate.get(key) ?? 0) + dayValuation);
  }

  const items = [...latestByItem.values()].sort((a, b) => a.boqItemNumber.localeCompare(b.boqItemNumber));
  const totalValuation = items.reduce((sum, i) => sum + (i.valuationAmount ?? 0), 0);
  const overallPercentCompletion =
    items.length > 0 ? Math.round(items.reduce((sum, i) => sum + i.percentCompletion, 0) / items.length) : null;
  const variations = items.filter((i) => i.variationReference);

  // Cumulative valuation over time — each date's total is added to the
  // running sum, since valuation only grows (a BOQ item's valuation is a
  // point-in-time cumulative figure, not a daily delta).
  let running = 0;
  const trend = [...valuationByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTotal]) => {
      running = Math.max(running, dayTotal);
      return { date, valuation: running };
    });

  return {
    project: { id: project.id, name: project.name, code: project.code },
    items,
    totals: { totalValuation, overallPercentCompletion, itemCount: items.length },
    variations,
    trend,
  };
}

// Stock movement + running balance per item. Balance is a straight sum
// across every approved Stores report ever filed for the project — there's
// no separate "opening balance" concept yet (spec 9.3 flags this as
// calculated from source records, not stored).
async function computeStoresAnalytics(project) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: "STORES", status: "APPROVED" },
    include: { storesDetail: { include: { lines: true } } },
    orderBy: { reportDate: "asc" },
  });

  const byItem = new Map();
  const movementByDate = new Map();
  const shortages = [];

  for (const r of reports) {
    if (r.storesDetail?.shortagesAndRequirements) {
      shortages.push({ date: r.reportDate, note: r.storesDetail.shortagesAndRequirements });
    }

    const key = dateKey(r.reportDate);
    if (!movementByDate.has(key)) movementByDate.set(key, { received: 0, issued: 0 });
    const dayTotals = movementByDate.get(key);

    for (const l of r.storesDetail?.lines ?? []) {
      if (!byItem.has(l.itemName)) {
        byItem.set(l.itemName, { itemName: l.itemName, unit: l.unit, received: 0, issued: 0, returned: 0, damagedLost: 0 });
      }
      const item = byItem.get(l.itemName);
      const qty = Number(l.quantity);
      if (l.direction === "RECEIVED") {
        item.received += qty;
        dayTotals.received += qty;
      } else if (l.direction === "ISSUED") {
        item.issued += qty;
        dayTotals.issued += qty;
      } else if (l.direction === "RETURNED") {
        item.returned += qty;
      } else if (l.direction === "DAMAGED_LOST") {
        item.damagedLost += qty;
      }
      item.unit = item.unit || l.unit;
    }
  }

  const items = [...byItem.values()]
    .map((i) => ({ ...i, balance: i.received + i.returned - i.issued - i.damagedLost }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const trend = [...movementByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, t]) => ({ date, ...t }));

  return {
    project: { id: project.id, name: project.name, code: project.code },
    items,
    trend,
    shortages: shortages.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10),
  };
}

// Incidents/near-misses trend plus corrective actions actually tracked
// as work items (Action rows sourced from a SHE report), not just the
// free-text "correctiveActions" field on the report itself.
async function computeSheAnalytics(project) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: "SHE", status: "APPROVED" },
    include: { sheDetail: true },
    orderBy: { reportDate: "asc" },
  });

  const trend = reports.map((r) => ({
    date: dateKey(r.reportDate),
    incidents: r.sheDetail?.incidentCount ?? 0,
    nearMisses: r.sheDetail?.nearMissCount ?? 0,
  }));

  const totalIncidents = trend.reduce((sum, t) => sum + t.incidents, 0);
  const totalNearMisses = trend.reduce((sum, t) => sum + t.nearMisses, 0);
  const toolboxTalkDays = reports.filter((r) => r.sheDetail?.toolboxTalksConducted).length;
  const inspectionDays = reports.filter((r) => r.sheDetail?.safetyInspections).length;

  const recentIncidents = reports
    .filter((r) => (r.sheDetail?.incidentCount ?? 0) > 0)
    .map((r) => ({ date: r.reportDate, count: r.sheDetail.incidentCount, description: r.sheDetail.incidentsDescription }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  const [openActions, overdueActions, closedActions] = await Promise.all([
    prisma.action.count({
      where: { projectId: project.id, status: { in: ["OPEN", "IN_PROGRESS"] }, sourceReport: { type: "SHE" } },
    }),
    prisma.action.count({
      where: {
        projectId: project.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        sourceReport: { type: "SHE" },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.action.count({
      where: { projectId: project.id, status: { in: ["COMPLETED", "CLOSED"] }, sourceReport: { type: "SHE" } },
    }),
  ]);

  return {
    project: { id: project.id, name: project.name, code: project.code },
    trend,
    totals: { totalIncidents, totalNearMisses, toolboxTalkDays, inspectionDays, reportCount: reports.length },
    recentIncidents,
    correctiveActions: { open: openActions, overdue: overdueActions, closed: closedActions },
  };
}

// Progress/manpower trend plus the latest manpower breakdown (fixed
// categories — see reports.js's foremanSchema) and any open constraints
// the Foreman has flagged, most recent first.
async function computeForemanAnalytics(project) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: "FOREMAN", status: "APPROVED" },
    include: { foremanDetail: true },
    orderBy: { reportDate: "asc" },
  });

  const trend = reports.map((r) => ({
    date: dateKey(r.reportDate),
    percentProgress: r.foremanDetail?.percentProgress ?? 0,
    workersOnSite: r.foremanDetail?.workersOnSite ?? 0,
  }));

  const latest = reports[reports.length - 1]?.foremanDetail;
  const avgWorkforce =
    reports.length > 0
      ? Math.round(reports.reduce((sum, r) => sum + (r.foremanDetail?.workersOnSite ?? 0), 0) / reports.length)
      : 0;

  const manpowerBreakdown = latest
    ? {
        electricalSupervisors: latest.electricalSupervisors,
        electricians: latest.electricians,
        electricalAssistants: latest.electricalAssistants,
        generalHands: latest.generalHands,
        sheOfficersOnSite: latest.sheOfficersOnSite,
        total: latest.workersOnSite,
      }
    : null;

  const recentConstraints = reports
    .filter((r) => r.foremanDetail?.constraints)
    .map((r) => ({ date: r.reportDate, note: r.foremanDetail.constraints }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  return {
    project: { id: project.id, name: project.name, code: project.code },
    trend,
    totals: {
      reportCount: reports.length,
      latestProgress: latest?.percentProgress ?? null,
      avgWorkforce,
    },
    manpowerBreakdown,
    recentConstraints,
  };
}

// Funds received vs. expenditure vs. outstanding commitments, rolled up
// across every approved Finance report ever filed for the project —
// the project-wide totals spec 9.3 calls for, computed from source
// records rather than stored.
async function computeFinanceAnalytics(project) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: "FINANCE", status: "APPROVED" },
    include: { financeDetail: { include: { lines: true } } },
    orderBy: { reportDate: "asc" },
  });

  let totalFundsReceived = 0;
  let totalExpenditure = 0;
  let totalCommitment = 0;
  const byCategory = new Map();
  const trendByDate = new Map();

  for (const r of reports) {
    const key = dateKey(r.reportDate);
    if (!trendByDate.has(key)) trendByDate.set(key, { received: 0, expenditure: 0 });
    const dayTotals = trendByDate.get(key);

    for (const l of r.financeDetail?.lines ?? []) {
      const amount = Number(l.amount);
      if (l.type === "FUNDS_RECEIVED") {
        totalFundsReceived += amount;
        dayTotals.received += amount;
      } else if (l.type === "EXPENDITURE") {
        totalExpenditure += amount;
        dayTotals.expenditure += amount;
        byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + amount);
      } else if (l.type === "COMMITMENT") {
        totalCommitment += amount;
      }
    }
  }

  // Cumulative, like the QS valuation trend — each date adds to the
  // running total rather than showing a daily delta.
  let runningReceived = 0;
  let runningExpenditure = 0;
  const trend = [...trendByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, t]) => {
      runningReceived += t.received;
      runningExpenditure += t.expenditure;
      return { date, cumulativeReceived: runningReceived, cumulativeExpenditure: runningExpenditure };
    });

  const approvedBudget = project.approvedBudget != null ? Number(project.approvedBudget) : null;
  const utilizationPercent = approvedBudget ? Math.round((totalExpenditure / approvedBudget) * 100) : null;

  const categoryBreakdown = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    project: { id: project.id, name: project.name, code: project.code },
    totals: {
      totalFundsReceived,
      totalExpenditure,
      totalCommitment,
      balance: totalFundsReceived - totalExpenditure,
      approvedBudget,
      utilizationPercent,
      reportCount: reports.length,
    },
    categoryBreakdown,
    trend,
  };
}

// Current balance (received + returned - issued - damagedLost) per item,
// from every APPROVED stores line ever recorded for the project — the
// same formula computeStoresAnalytics uses, but scoped to just the item
// names a new submission touches instead of the whole project's history.
// Used to stamp each new line with an opening/closing balance at
// submission time (reports.js), not just for the analytics dashboard.
async function getApprovedStockBalances(projectId, itemNames) {
  const lines = await prisma.stockTransactionLine.findMany({
    where: {
      itemName: { in: itemNames },
      storesReportDetail: { report: { projectId, status: "APPROVED" } },
    },
    select: { itemName: true, direction: true, quantity: true },
  });

  const balances = new Map(itemNames.map((name) => [name, 0]));
  for (const l of lines) {
    const delta = l.direction === "RECEIVED" || l.direction === "RETURNED" ? Number(l.quantity) : -Number(l.quantity);
    balances.set(l.itemName, (balances.get(l.itemName) ?? 0) + delta);
  }
  return balances;
}

module.exports = {
  computeQsAnalytics,
  computeStoresAnalytics,
  computeSheAnalytics,
  computeForemanAnalytics,
  computeFinanceAnalytics,
  getApprovedStockBalances,
};
