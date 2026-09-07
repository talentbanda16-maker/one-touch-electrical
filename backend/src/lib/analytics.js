const prisma = require("../prisma");
// departmentAnalytics.js only depends on ../prisma, not this file, so
// pulling its QS aggregation in here to blend into "actual progress"
// doesn't create a circular require.
const { computeQsAnalytics } = require("./departmentAnalytics");

// Variance thresholds (5%/15%) and the linear planned-progress line are
// simple defaults, not the BOQ-weighted/baseline-driven method the
// original design doc flagged as "pending client confirmation" — good
// enough to surface real signal now, easy to swap for a proper
// programme baseline later without changing the response shape.
const MINOR_DELAY_THRESHOLD = 5;
const CRITICAL_DELAY_THRESHOLD = 15;
const BUDGET_VS_PROGRESS_GAP_THRESHOLD = 15;

// Planned progress "as of today": interpolated between the two approved
// programme entries either side of today, if the Technical Manager has
// entered any (spec: "store planned progress by reporting period from
// the approved programme"). Falls back to the old straight-line
// start/end-date estimate when a project has no programme entries yet,
// so existing projects don't lose their planned-progress figure.
async function getPlannedProgress(project) {
  const entries = await prisma.programmeEntry.findMany({
    where: { projectId: project.id },
    orderBy: { periodDate: "asc" },
  });

  if (entries.length > 0) {
    const now = Date.now();
    if (now <= entries[0].periodDate.getTime()) return entries[0].plannedProgress;
    const last = entries[entries.length - 1];
    if (now >= last.periodDate.getTime()) return last.plannedProgress;

    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i];
      const b = entries[i + 1];
      if (now >= a.periodDate.getTime() && now <= b.periodDate.getTime()) {
        const span = b.periodDate.getTime() - a.periodDate.getTime();
        const frac = span > 0 ? (now - a.periodDate.getTime()) / span : 0;
        return Math.round(a.plannedProgress + frac * (b.plannedProgress - a.plannedProgress));
      }
    }
  }

  if (project.startDate && project.plannedEndDate) {
    const start = new Date(project.startDate).getTime();
    const end = new Date(project.plannedEndDate).getTime();
    if (end > start) {
      return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)));
    }
  }
  return null;
}

async function computeProjectAnalytics(project) {
  const latestForeman = await prisma.report.findFirst({
    where: { projectId: project.id, type: "FOREMAN", status: "APPROVED" },
    orderBy: { reportDate: "desc" },
    include: { foremanDetail: true },
  });
  const foremanProgress = latestForeman?.foremanDetail?.percentProgress ?? null;

  // QS's overall % completion (average across its latest-reported BOQ
  // items) is the other approved-report source of "actual progress" —
  // blended 50/50 with Foreman when both exist, since neither alone is
  // the full physical-progress picture.
  const qsAnalytics = await computeQsAnalytics(project);
  const qsProgress = qsAnalytics.totals.overallPercentCompletion;

  let actualProgress;
  if (foremanProgress != null && qsProgress != null) {
    actualProgress = Math.round((foremanProgress + qsProgress) / 2);
  } else {
    actualProgress = foremanProgress ?? qsProgress ?? 0;
  }

  const plannedProgress = await getPlannedProgress(project);

  const variance = plannedProgress != null ? actualProgress - plannedProgress : null;
  let programmeStatus = "UNKNOWN";
  if (variance != null) {
    if (variance < -CRITICAL_DELAY_THRESHOLD) programmeStatus = "CRITICAL_DELAY";
    else if (variance < -MINOR_DELAY_THRESHOLD) programmeStatus = "MINOR_DELAY";
    else programmeStatus = "ON_PROGRAMME";
  }

  const lines = await prisma.financeTransactionLine.findMany({
    where: { financeReportDetail: { report: { projectId: project.id, status: "APPROVED" } } },
  });
  let totalFundsReceived = 0;
  let totalExpenditure = 0;
  let totalCommitments = 0;
  // By category (Materials/Labour/Plant-Equipment/... per spec's finance
  // line list) — the totals above answer "how much," this answers
  // "on what," which management needs to see without opening the
  // Combined Report export.
  const fundsReceivedByCategory = {};
  const expenditureByCategory = {};
  for (const l of lines) {
    const amount = Number(l.amount);
    if (l.type === "FUNDS_RECEIVED") {
      totalFundsReceived += amount;
      fundsReceivedByCategory[l.category] = (fundsReceivedByCategory[l.category] ?? 0) + amount;
    } else if (l.type === "EXPENDITURE") {
      totalExpenditure += amount;
      expenditureByCategory[l.category] = (expenditureByCategory[l.category] ?? 0) + amount;
    } else if (l.type === "COMMITMENT") {
      totalCommitments += amount;
    }
  }

  const approvedBudget = project.approvedBudget != null ? Number(project.approvedBudget) : null;
  const fundUtilisationPercent =
    approvedBudget && approvedBudget > 0 ? Math.round((totalExpenditure / approvedBudget) * 100) : null;
  const balanceAvailable = totalFundsReceived - totalExpenditure;

  // Cross-domain checks (spec Section 21: "link physical, commercial,
  // financial, safety, stores and operational information to the same
  // project") — these two queries are the "stores" and "safety" sides;
  // finance and progress are already computed above.
  const [pendingRequisitions, overdueSheActions] = await Promise.all([
    prisma.materialRequisition.count({ where: { projectId: project.id, status: "PENDING" } }),
    prisma.action.count({
      where: {
        projectId: project.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        sourceReport: { type: "SHE" },
        dueDate: { lt: new Date() },
      },
    }),
  ]);

  const exceptions = [];
  if (fundUtilisationPercent != null) {
    const gap = fundUtilisationPercent - actualProgress;
    if (gap > BUDGET_VS_PROGRESS_GAP_THRESHOLD) {
      exceptions.push(
        `Project is ${actualProgress}% physically complete but ${fundUtilisationPercent}% of the budget has been utilised.`
      );
    } else if (-gap > BUDGET_VS_PROGRESS_GAP_THRESHOLD) {
      // The inverse is just as worth flagging — physical progress running
      // well ahead of spend can mean the contractor isn't being paid for
      // completed work, a valuation lag, or a cash-flow risk, not
      // necessarily good news.
      exceptions.push(
        `Project is ${actualProgress}% physically complete but only ${fundUtilisationPercent}% of the budget has been utilised.`
      );
    }
  }
  if (programmeStatus === "CRITICAL_DELAY") {
    exceptions.push(`Project is critically behind programme (${Math.abs(variance)} percentage points behind plan).`);
  } else if (programmeStatus === "MINOR_DELAY") {
    exceptions.push(`Project is behind programme (${Math.abs(variance)} percentage points behind plan).`);
  }
  if ((programmeStatus === "CRITICAL_DELAY" || programmeStatus === "MINOR_DELAY") && pendingRequisitions > 0) {
    exceptions.push(
      `Project is behind programme while ${pendingRequisitions} material shortage/requisition${pendingRequisitions > 1 ? "s" : ""} remain open.`
    );
  }
  if (overdueSheActions > 0 && project.status === "ACTIVE") {
    exceptions.push(
      `${overdueSheActions} safety action${overdueSheActions > 1 ? "s are" : " is"} overdue while work continues on this project.`
    );
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      approvedBudget,
      contractValue: project.contractValue != null ? Number(project.contractValue) : null,
    },
    progress: {
      actual: actualProgress,
      actualSources: { foreman: foremanProgress, qs: qsProgress },
      planned: plannedProgress,
      variance,
      status: programmeStatus,
      asOf: latestForeman?.reportDate ?? null,
    },
    finance: {
      totalFundsReceived,
      totalExpenditure,
      totalCommitments,
      balanceAvailable,
      fundUtilisationPercent,
      fundsReceivedByCategory,
      expenditureByCategory,
    },
    exceptions,
  };
}

// UTC-anchored, not local-midnight — Report.reportDate values are stored
// as UTC midnight (new Date("2026-08-25") parses that way), so comparing
// against local midnight would shift by a day whenever the server's
// timezone isn't UTC.
function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Called opportunistically (not on a real cron yet — see spec Section 22's
// BullMQ note for the eventual scheduled version) whenever the Technical
// Manager's dashboard loads. Upserts so calling it more than once per day
// is harmless — the day's snapshot just gets overwritten with fresher numbers.
async function ensureTodaySnapshots() {
  const projects = await prisma.project.findMany({ where: { status: "ACTIVE" } });
  const today = startOfToday();

  for (const project of projects) {
    const { progress, finance } = await computeProjectAnalytics(project);
    await prisma.projectSnapshot.upsert({
      where: { projectId_snapshotDate: { projectId: project.id, snapshotDate: today } },
      create: {
        projectId: project.id,
        snapshotDate: today,
        actualProgress: progress.actual,
        plannedProgress: progress.planned,
        fundUtilisationPercent: finance.fundUtilisationPercent,
        totalFundsReceived: finance.totalFundsReceived,
        totalExpenditure: finance.totalExpenditure,
      },
      update: {
        actualProgress: progress.actual,
        plannedProgress: progress.planned,
        fundUtilisationPercent: finance.fundUtilisationPercent,
        totalFundsReceived: finance.totalFundsReceived,
        totalExpenditure: finance.totalExpenditure,
      },
    });
  }
}

module.exports = { computeProjectAnalytics, ensureTodaySnapshots };
