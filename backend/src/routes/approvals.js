const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { notify, notifyManagers } = require("../lib/notifications");

const router = express.Router();

// Every detail relation a report might have, keyed the same way as the
// Prisma model — used so one generic route can fetch/snapshot any type
// without a switch statement per report type.
const DETAIL_INCLUDE = {
  foremanDetail: true,
  qsDetail: { include: { lines: true } },
  sheDetail: true,
  storesDetail: { include: { lines: true } },
  financeDetail: { include: { lines: true } },
};

// Powers the "returned for correction" alert on the reporting roles'
// dashboard — spec Section 18 lists this as a required notification.
// Not scoped to one project, since a returned report can happen on
// any project the user is assigned to.
router.get("/reports/mine/returned", requireAuth, async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { submittedById: req.user.id, status: "RETURNED" },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { reviewedAt: "desc" },
  });
  res.json(reports);
});

router.get("/reports/pending", requireAuth, requireRole(), async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { status: "SUBMITTED" },
    include: {
      project: { select: { id: true, name: true, code: true } },
      submittedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
  res.json(reports);
});

// Full detail for any report type — the Technical Manager's review
// screen doesn't need to know which type-specific route to call.
router.get("/reports/:id/full", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      ...DETAIL_INCLUDE,
      project: { select: { id: true, name: true, code: true } },
      submittedBy: { select: { id: true, name: true, role: true } },
      reviewedBy: { select: { id: true, name: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, createdAt: true } },
      revisions: {
        orderBy: { returnedAt: "desc" },
        include: { returnedBy: { select: { id: true, name: true } } },
      },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.post("/reports/:id/approve", requireAuth, requireRole(), async (req, res) => {
  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "SUBMITTED") {
    return res.status(409).json({ error: `Cannot approve a report with status ${report.status}` });
  }

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: { status: "APPROVED", reviewedById: req.user.id, reviewedAt: new Date(), returnReason: null },
  });

  await recordAudit({
    userId: req.user.id,
    action: "REPORT_APPROVED",
    entityType: "Report",
    entityId: report.id,
    metadata: { type: report.type, projectId: report.projectId },
  });

  res.json(updated);
});

const returnSchema = z.object({ reason: z.string().min(1, "A reason is required to return a report") });

router.post("/reports/:id/return", requireAuth, requireRole(), async (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const report = await prisma.report.findUnique({ where: { id: req.params.id }, include: DETAIL_INCLUDE });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "SUBMITTED") {
    return res.status(409).json({ error: `Cannot return a report with status ${report.status}` });
  }

  const [, updated] = await prisma.$transaction([
    prisma.reportRevision.create({
      data: {
        reportId: report.id,
        snapshot: report,
        reason: parsed.data.reason,
        returnedById: req.user.id,
      },
    }),
    prisma.report.update({
      where: { id: report.id },
      data: {
        status: "RETURNED",
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        returnReason: parsed.data.reason,
      },
    }),
  ]);

  await recordAudit({
    userId: req.user.id,
    action: "REPORT_RETURNED",
    entityType: "Report",
    entityId: report.id,
    metadata: { type: report.type, projectId: report.projectId, reason: parsed.data.reason },
  });

  await notify({
    userId: report.submittedById,
    type: "REPORT_RETURNED",
    title: "Report returned for correction",
    message: `Your ${report.type} report was returned: ${parsed.data.reason}`,
    projectId: report.projectId,
    link: "/dashboard",
    dedupeKey: `REPORT_RETURNED:${report.id}:${updated.updatedAt.toISOString()}`,
  });

  res.json(updated);
});

module.exports = router;
