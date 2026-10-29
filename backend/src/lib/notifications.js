const prisma = require("../prisma");
const { computeProjectAnalytics } = require("./analytics");

const REPORT_SUBMITTING_ROLES = ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"];
const ROLE_TO_REPORT_TYPE = { FOREMAN: "FOREMAN", QS: "QS", SHE_OFFICER: "SHE", STORESMAN: "STORES", FINANCE: "FINANCE" };
const ROLE_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE_OFFICER: "SHE", STORESMAN: "Stores", FINANCE: "Finance" };

const DUE_SOON_DAYS = 2;
const FUND_UTILISATION_THRESHOLD = 90;
const PENDING_REQUISITION_REMINDER_DAYS = 2;

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Upserts on (userId, dedupeKey) — safe to call repeatedly for the same
// underlying event/condition without creating duplicates or resetting a
// notification the user already marked read.
async function notify({ userId, type, title, message, projectId, link, dedupeKey }) {
  await prisma.notification.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    create: { userId, type, title, message, projectId, link, dedupeKey },
    update: {},
  });
}

async function notifyManagers({ type, title, message, projectId, link, dedupeKey }) {
  const managers = await prisma.user.findMany({
    where: { role: { in: ["TECHNICAL_MANAGER", "MANAGEMENT"] }, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    managers.map((m) => notify({ userId: m.id, type, title, message, projectId, link, dedupeKey: `${dedupeKey}:${m.id}` }))
  );
}

// The time-based checks with no single triggering request — called
// opportunistically off the Management/TM dashboard load, same pattern
// as ensureTodaySnapshots.
async function generateSystemNotifications() {
  const today = startOfToday();
  const todayKey = today.toISOString().slice(0, 10);
  const now = new Date();
  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_DAYS);

  const projects = await prisma.project.findMany({ where: { status: "ACTIVE" } });

  for (const project of projects) {
    // Not submitted today — per (project, report-submitting role) that
    // has at least one assignment, but no report of that type today.
    const assignments = await prisma.projectAssignment.findMany({
      where: { projectId: project.id, role: { in: REPORT_SUBMITTING_ROLES } },
      distinct: ["role"],
    });
    for (const a of assignments) {
      const reportType = ROLE_TO_REPORT_TYPE[a.role];
      const submittedToday = await prisma.report.count({
        where: { projectId: project.id, type: reportType, reportDate: { gte: today } },
      });
      if (submittedToday === 0) {
        await notifyManagers({
          type: "REPORT_NOT_SUBMITTED",
          title: `${ROLE_LABELS[a.role]} report not submitted today`,
          message: `No ${ROLE_LABELS[a.role]} report has been submitted for ${project.name} today.`,
          projectId: project.id,
          link: "/dashboard/management",
          dedupeKey: `REPORT_NOT_SUBMITTED:${project.id}:${a.role}:${todayKey}`,
        });
      }
    }

    // One notification per cross-domain exception computeProjectAnalytics
    // flags (spec Section 21) — behind-programme, budget-vs-progress gap
    // in either direction, behind-programme-with-open-shortages,
    // overdue-safety-while-work-continues. Generic on purpose: any new
    // exception added to that function's list becomes a proactive alert
    // here for free, no matching change needed in this file.
    const analytics = await computeProjectAnalytics(project);
    for (let i = 0; i < analytics.exceptions.length; i++) {
      await notifyManagers({
        type: "PROJECT_EXCEPTION",
        title: `${project.name}: exception flagged`,
        message: analytics.exceptions[i],
        projectId: project.id,
        link: "/analytics",
        dedupeKey: `PROJECT_EXCEPTION:${project.id}:${todayKey}:${i}`,
      });
    }
    if (analytics.finance.fundUtilisationPercent != null && analytics.finance.fundUtilisationPercent >= FUND_UTILISATION_THRESHOLD) {
      await notifyManagers({
        type: "FUND_UTILISATION_THRESHOLD",
        title: `${project.name} fund utilisation at ${analytics.finance.fundUtilisationPercent}%`,
        message: `Fund utilisation has reached ${analytics.finance.fundUtilisationPercent}% of the approved budget (threshold: ${FUND_UTILISATION_THRESHOLD}%).`,
        projectId: project.id,
        link: "/analytics",
        dedupeKey: `FUND_UTILISATION_THRESHOLD:${project.id}:${todayKey}`,
      });
    }

    // Pending requisitions older than X days — remind TM to action them.
    const staleDate = new Date(now);
    staleDate.setDate(staleDate.getDate() - PENDING_REQUISITION_REMINDER_DAYS);
    const staleReqs = await prisma.materialRequisition.findMany({
      where: { projectId: project.id, status: "PENDING", requestedAt: { lte: staleDate }, isArchived: false },
      select: { id: true, itemName: true, requestedAt: true },
    });
    if (staleReqs.length > 0) {
      await notifyManagers({
        type: "REQUISITION_SUBMITTED",
        title: `${staleReqs.length} requisition(s) awaiting approval on ${project.name}`,
        message: `${staleReqs.length} material request(s) have been pending for ${PENDING_REQUISITION_REMINDER_DAYS}+ days: ${staleReqs.slice(0, 3).map((r) => r.itemName).join(", ")}${staleReqs.length > 3 ? "…" : ""}.`,
        projectId: project.id,
        link: "/analytics/stores",
        dedupeKey: `PENDING_REQS_REMINDER:${project.id}:${todayKey}`,
      });
    }

    // Actions: due soon (not yet overdue) and overdue, to the assignee.
    const openActions = await prisma.action.findMany({
      where: { projectId: project.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, description: true, dueDate: true, assignedToId: true },
    });
    for (const a of openActions) {
      const due = new Date(a.dueDate);
      if (due < now) {
        await notify({
          userId: a.assignedToId,
          type: "ACTION_OVERDUE",
          title: "Action overdue",
          message: `"${a.description}" was due ${due.toLocaleDateString()} and is now overdue.`,
          projectId: project.id,
          link: "/actions",
          dedupeKey: `ACTION_OVERDUE:${a.id}:${todayKey}`,
        });
      } else if (due <= dueSoonCutoff) {
        await notify({
          userId: a.assignedToId,
          type: "ACTION_DUE_SOON",
          title: "Action due soon",
          message: `"${a.description}" is due ${due.toLocaleDateString()}.`,
          projectId: project.id,
          link: "/actions",
          dedupeKey: `ACTION_DUE_SOON:${a.id}:${todayKey}`,
        });
      }
    }
  }
}

module.exports = { notify, notifyManagers, generateSystemNotifications };
