const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess } = require("../middleware/rbac");
const { getApprovedStockBalances } = require("../lib/departmentAnalytics");
const { notifyManagers } = require("../lib/notifications");

const ExcelJS = require("exceljs");

const router = express.Router();

// Upper bounds on numeric fields — without these, a value that overflows
// the underlying Postgres column (int4 tops out around 2.1 billion;
// these Decimal(14,2) columns top out at 999,999,999,999.99) reaches
// Prisma un-validated and throws, surfacing as a bare unhandled 500
// instead of a clean 400. The caps below are generous for any real
// headcount/quantity/amount while staying safely inside both the
// column's real range and zod/JS's own safe-integer range.
const MAX_HEADCOUNT = 100000;
const MAX_QUANTITY = 999999999;

// Shared guard for every PATCH (correction/resubmit/edit) route below.
// Two cases:
//  - the original submitter correcting a RETURNED report (the existing
//    resubmit flow, spec Section 2.4/20 — "returned reports retain their
//    history and correction trail")
//  - the Technical Manager editing a report directly, either while it's
//    still SUBMITTED (in place, from the Approvals screen) or after
//    returning it. Content stays attributed to the original submitter
//    (submittedById is never changed here) — the audit log is what
//    records that the TM, not the submitter, made this particular edit.
async function assertReturnedAndOwned(req, res, reportId, expectedType) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return null;
  }
  if (report.type !== expectedType) {
    res.status(400).json({ error: "Report type mismatch" });
    return null;
  }

  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "ENGINEER") {
    if (report.status !== "SUBMITTED" && report.status !== "RETURNED") {
      res.status(409).json({ error: `Cannot edit a report with status ${report.status}` });
      return null;
    }
    return report;
  }

  if (report.status !== "RETURNED") {
    res.status(409).json({ error: `Cannot correct a report with status ${report.status}` });
    return null;
  }
  if (report.submittedById !== req.user.id) {
    res.status(403).json({ error: "Only the original submitter can correct this report" });
    return null;
  }
  return report;
}

// Distinguishes an audit entry for "the Technical Manager edited this
// report while it was pending review" from the pre-existing "submitter
// corrected and resubmitted a returned report" — same PATCH route,
// different actor/situation, worth telling apart in the audit log.
function editAuditAction(req, reportBeforeUpdate) {
  return (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "ENGINEER") && reportBeforeUpdate.status === "SUBMITTED"
    ? "REPORT_EDITED_BY_TM"
    : "REPORT_RESUBMITTED";
}

const foremanSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  // Client-generated (e.g. crypto.randomUUID() at draft time) so a
  // retried offline-sync submit is safely idempotent — see Report.submissionId.
  submissionId: z.string().min(1),
  siteLocation: z.string().optional(),
  // Manpower on site — fixed categories (paper form section 4); the
  // Total Workforce figure is computed server-side from these, not
  // trusted from the client.
  electricalSupervisors: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  electricians: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  electricalAssistants: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  generalHands: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  sheOfficersOnSite: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  workCompleted: z.string().min(1, "Work completed today is required"),
  workInProgress: z.string().optional(),
  percentProgress: z.number().int().min(0).max(100).default(0),
  equipmentUsed: z.string().optional(),
  materialsUsed: z.string().optional(),
  materialsRequired: z.string().optional(),
  constraints: z.string().optional(),
  instructionsReceived: z.string().optional(),
  nextDayPlan: z.string().optional(),
});

function workforceTotal(detail) {
  return (
    detail.electricalSupervisors +
    detail.electricians +
    detail.electricalAssistants +
    detail.generalHands +
    detail.sheOfficersOnSite
  );
}

// Foreman submits for their assigned project; Technical Manager can submit for any.
router.post(
  "/foreman",
  requireAuth,
  requireRole("FOREMAN"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = foremanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, ...detail } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { foremanDetail: true },
    });
    if (existing) {
      // Already recorded from a prior attempt (e.g. offline retry) — return it as-is, don't duplicate.
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "FOREMAN",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        foremanDetail: { create: { ...detail, workersOnSite: workforceTotal(detail) } },
      },
      include: { foremanDetail: true },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "FOREMAN", projectId },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Foreman report awaiting approval",
      message: `A Foreman report was submitted and is awaiting your review.`,
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

// Foreman sees only their own submissions; Technical Manager/Management see all for the project.
router.get("/foreman", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "FOREMAN" };
  if (req.user.role === "FOREMAN") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: { foremanDetail: true, submittedBy: { select: { id: true, name: true } } },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/foreman/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: { foremanDetail: true, submittedBy: { select: { id: true, name: true } } },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "ENGINEER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/foreman/:id", requireAuth, requireRole("FOREMAN"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "FOREMAN");
  if (!report) return;

  const parsed = foremanSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, ...detail } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      foremanDetail: { update: { ...detail, workersOnSite: workforceTotal(detail) } },
    },
    include: { foremanDetail: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "FOREMAN" },
  });

  res.json(updated);
});

const VARIATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const qsLineSchema = z.object({
  boqItemNumber: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().optional(),
  contractQuantity: z.number().nonnegative().max(MAX_QUANTITY),
  contractRate: z.number().nonnegative().max(MAX_QUANTITY).optional(),
  quantityToday: z.number().nonnegative().max(MAX_QUANTITY),
  cumulativeQuantity: z.number().nonnegative().max(MAX_QUANTITY),
  measurements: z.string().optional(),
  valuationAmount: z.number().nonnegative().max(MAX_QUANTITY).optional(),
  variationReference: z.string().optional(),
  // Only meaningful once variationReference is set, but not enforced as
  // a hard requirement — a QS may flag a variation before it's formally
  // referenced.
  variationStatus: z.enum(VARIATION_STATUSES).optional(),
  comments: z.string().optional(),
});

const qsSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  comments: z.string().optional(),
  commercialIssues: z.string().optional(),
  // A QS report with no line items says nothing — same principle as
  // the Finance/Stores header+line pattern in spec Section 9.3.
  lines: z.array(qsLineSchema).min(1, "At least one BOQ line item is required"),
});

// balanceQuantity, percentCompletion, and all amount columns are derived
// here, not trusted from the client — they feed the progress-vs-budget
// cross-checks and the Excel export (spec 9.3).
function deriveQsLine(line) {
  const balanceQuantity = line.contractQuantity - line.cumulativeQuantity;
  const percentCompletion =
    line.contractQuantity > 0
      ? Math.max(0, Math.min(100, Math.round((line.cumulativeQuantity / line.contractQuantity) * 100)))
      : 0;
  const rate = line.contractRate ?? null;
  const contractAmount  = rate != null ? line.contractQuantity  * rate : null;
  const periodAmount    = rate != null ? line.quantityToday     * rate : null;
  const cumulativeAmount = rate != null ? line.cumulativeQuantity * rate : null;
  return { ...line, balanceQuantity, percentCompletion, contractAmount, periodAmount, cumulativeAmount };
}

router.post(
  "/qs",
  requireAuth,
  requireRole("QS"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = qsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, comments, commercialIssues, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { qsDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "QS",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        qsDetail: {
          create: {
            comments,
            commercialIssues,
            lines: { create: lines.map(deriveQsLine) },
          },
        },
      },
      include: { qsDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "QS", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "QS report awaiting approval",
      message: "A QS report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

router.get("/qs", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "QS" };
  if (req.user.role === "QS") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      qsDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

// ── New-claim pre-fill from BOQ template ──────────────────────────────────
router.get("/qs/claim-prefill", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  const boqItems = await prisma.projectBoqItem.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  if (boqItems.length === 0) return res.json([]);

  // Sum quantityToday per boqItemNumber across all non-draft reports
  const prevReports = await prisma.report.findMany({
    where: { projectId, type: "QS", status: { in: ["SUBMITTED", "APPROVED", "RETURNED"] } },
    include: { qsDetail: { include: { lines: true } } },
    orderBy: { reportDate: "asc" },
  });

  const cumMap = new Map();
  for (const r of prevReports) {
    for (const l of r.qsDetail?.lines ?? []) {
      const qty = Number(l.quantityToday ?? 0);
      cumMap.set(l.boqItemNumber, (cumMap.get(l.boqItemNumber) ?? 0) + qty);
    }
  }

  const fmtN = (v) => (v != null ? Number(v) : 0);
  res.json(boqItems.map((item) => {
    const cQty  = fmtN(item.contractQuantity);
    const cRate = fmtN(item.contractRate);
    const cumQty = cumMap.get(item.boqItemNumber) ?? 0;
    return {
      boqItemNumber: item.boqItemNumber,
      description: item.description,
      unit: item.unit,
      contractQuantity: cQty,
      contractRate: cRate,
      contractAmount: cQty * cRate,
      previousCumulativeQuantity: cumQty,
      previousCumulativeAmount: cumQty * cRate,
    };
  }));
});

// ── QS Claim history ───────────────────────────────────────────────────────
router.get("/qs/history", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const reports = await prisma.report.findMany({
    where: { projectId, type: "QS" },
    include: {
      submittedBy: { select: { name: true } },
      qsDetail: { include: { lines: true } },
      qsPayments: true,
    },
    orderBy: { reportDate: "asc" },
  });
  const fmtN = (v) => (v != null ? Number(v) : 0);
  res.json(
    reports.map((r, i) => {
      const lines = r.qsDetail?.lines ?? [];
      const periodAmt = lines.reduce((s, l) => s + fmtN(l.periodAmount), 0);
      const cumulativeAmt = lines.reduce((s, l) => s + fmtN(l.cumulativeAmount), 0);
      const paidAmt = r.qsPayments.reduce((s, p) => s + fmtN(p.amountPaid), 0);
      return {
        id: r.id,
        claimNumber: i + 1,
        reportDate: r.reportDate,
        status: r.status,
        submittedBy: r.submittedBy.name,
        periodAmount: periodAmt,
        cumulativeAmount: cumulativeAmt,
        paidAmount: paidAmt,
        outstanding: periodAmt - paidAmt,
        lines: lines.map((l) => ({
          description: l.description,
          periodAmount: fmtN(l.periodAmount),
        })).filter((l) => l.description),
      };
    })
  );
});

// ── BOQ item-level progress ────────────────────────────────────────────────
router.get("/qs/boq-progress", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const latest = await prisma.report.findFirst({
    where: { projectId, type: "QS" },
    include: { qsDetail: { include: { lines: true } } },
    orderBy: { reportDate: "desc" },
  });
  if (!latest) return res.json([]);
  const fmtN = (v) => (v != null ? Number(v) : 0);
  res.json(
    (latest.qsDetail?.lines ?? []).map((l) => ({
      id: l.id,
      boqItemNumber: l.boqItemNumber,
      description: l.description,
      unit: l.unit,
      contractQuantity: fmtN(l.contractQuantity),
      contractRate: fmtN(l.contractRate),
      contractAmount: fmtN(l.contractAmount),
      cumulativeQuantity: fmtN(l.cumulativeQuantity),
      cumulativeAmount: fmtN(l.cumulativeAmount),
      balanceQuantity: fmtN(l.balanceQuantity),
      percentCompletion: l.percentCompletion,
    }))
  );
});

// ── Variation register ─────────────────────────────────────────────────────
router.get("/qs/variations", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const reports = await prisma.report.findMany({
    where: { projectId, type: "QS" },
    include: { qsDetail: { include: { lines: { where: { variationReference: { not: null } } } } } },
    orderBy: { reportDate: "asc" },
  });
  const fmtN = (v) => (v != null ? Number(v) : 0);
  const seen = new Map();
  for (const r of reports) {
    for (const l of r.qsDetail?.lines ?? []) {
      const ref = l.variationReference;
      if (!seen.has(ref)) {
        seen.set(ref, { reference: ref, description: l.description, status: l.variationStatus ?? "PENDING", amount: fmtN(l.contractAmount), reportDate: r.reportDate });
      } else {
        const existing = seen.get(ref);
        if (l.variationStatus) existing.status = l.variationStatus;
        existing.amount = fmtN(l.contractAmount);
        existing.reportDate = r.reportDate;
      }
    }
  }
  res.json([...seen.values()]);
});

// ── Retention summary ──────────────────────────────────────────────────────
router.get("/qs/retention", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const RETENTION_RATE = 0.05;
  const reports = await prisma.report.findMany({
    where: { projectId, type: "QS", status: "APPROVED" },
    include: { qsDetail: { include: { lines: true } }, qsPayments: true },
    orderBy: { reportDate: "asc" },
  });
  const fmtN = (v) => (v != null ? Number(v) : 0);
  let gross = 0;
  for (const r of reports) gross += (r.qsDetail?.lines ?? []).reduce((s, l) => s + fmtN(l.periodAmount), 0);
  const retentionHeld = gross * RETENTION_RATE;
  const totalPaid = reports.flatMap((r) => r.qsPayments).reduce((s, p) => s + fmtN(p.amountPaid), 0);
  res.json({ grossApproved: gross, retentionRate: RETENTION_RATE, retentionHeld, netDue: gross - retentionHeld, totalPaid, outstanding: gross - retentionHeld - totalPaid });
});

// ── QS Payments ────────────────────────────────────────────────────────────
router.get("/qs/payments", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const payments = await prisma.qsPayment.findMany({
    where: { projectId },
    include: { report: { select: { reportDate: true } } },
    orderBy: { datePaid: "desc" },
  });
  res.json(payments.map((p) => ({ id: p.id, reportId: p.reportId, amountPaid: Number(p.amountPaid), datePaid: p.datePaid, reference: p.reference, notes: p.notes, reportDate: p.report?.reportDate ?? null })));
});

const paymentSchema = z.object({
  projectId: z.string().uuid(),
  reportId: z.string().uuid().optional(),
  amountPaid: z.number().positive().max(MAX_QUANTITY),
  datePaid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

router.post("/qs/payments", requireAuth, requireRole("FINANCE", "TECHNICAL_MANAGER"), async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { projectId, reportId, amountPaid, datePaid, reference, notes } = parsed.data;
  const payment = await prisma.qsPayment.create({
    data: { projectId, reportId: reportId ?? null, amountPaid, datePaid: new Date(datePaid), reference: reference ?? null, notes: notes ?? null },
  });
  res.status(201).json({ id: payment.id });
});

router.delete("/qs/payments/:paymentId", requireAuth, requireRole("FINANCE", "TECHNICAL_MANAGER"), async (req, res) => {
  const payment = await prisma.qsPayment.findUnique({ where: { id: req.params.paymentId } });
  if (!payment) return res.status(404).json({ error: "Not found" });
  await prisma.qsPayment.delete({ where: { id: req.params.paymentId } });
  res.json({ ok: true });
});

router.get("/qs/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      qsDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "ENGINEER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/qs/:id", requireAuth, requireRole("QS"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "QS");
  if (!report) return;

  const parsed = qsSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, comments, commercialIssues, lines } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      qsDetail: {
        update: {
          comments,
          commercialIssues,
          lines: { deleteMany: {}, create: lines.map(deriveQsLine) },
        },
      },
    },
    include: { qsDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "QS", lineCount: lines.length },
  });

  res.json(updated);
});

const SHE_PERIOD_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];

const sheSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  periodType: z.enum(SHE_PERIOD_TYPES).default("DAILY"),
  periodEnd: z.string().date().optional(),
  periodReportData: z.record(z.unknown()).optional(),
  workersOnSite: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  toolboxTalksConducted: z.string().min(1, "Toolbox talks conducted is required"),
  safetyInspections: z.string().optional(),
  ppeCompliance: z.string().optional(),
  hazardsIdentified: z.string().optional(),
  correctiveActions: z.string().optional(),
  environmentalIssues: z.string().optional(),
  safetyObservations: z.string().optional(),
  incidentCount: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  nearMissCount: z.number().int().nonnegative().max(MAX_HEADCOUNT).default(0),
  incidentsDescription: z.string().optional(),
});

router.post(
  "/she",
  requireAuth,
  requireRole("SHE_OFFICER"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = sheSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, periodEnd, periodReportData, ...detail } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { sheDetail: true },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "SHE",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        sheDetail: {
          create: {
            ...detail,
            ...(periodEnd ? { periodEnd: new Date(periodEnd) } : {}),
            ...(periodReportData ? { periodReportData } : {}),
          },
        },
      },
      include: { sheDetail: true },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "SHE", projectId, incidentCount: detail.incidentCount },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "SHE report awaiting approval",
      message: "A SHE report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    if (detail.incidentCount > 0) {
      await notifyManagers({
        type: "SAFETY_INCIDENT",
        title: "Safety incident recorded",
        message: `${detail.incidentCount} incident(s) recorded in today's SHE report.${detail.incidentsDescription ? " " + detail.incidentsDescription : ""}`,
        projectId,
        link: "/analytics/she",
        dedupeKey: `SAFETY_INCIDENT:${report.id}`,
      });
    }

    res.status(201).json(report);
  }
);

router.get("/she", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "SHE" };
  if (req.user.role === "SHE_OFFICER") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: { sheDetail: true, submittedBy: { select: { id: true, name: true } } },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/she/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: { sheDetail: true, submittedBy: { select: { id: true, name: true } } },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "ENGINEER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/she/:id", requireAuth, requireRole("SHE_OFFICER"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "SHE");
  if (!report) return;

  const parsed = sheSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, periodEnd, periodReportData, ...detail } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      sheDetail: {
        update: {
          ...detail,
          periodEnd: periodEnd ? new Date(periodEnd) : null,
          ...(periodReportData !== undefined ? { periodReportData } : {}),
        },
      },
    },
    include: { sheDetail: true },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "SHE" },
  });

  res.json(updated);
});

const STOCK_DIRECTIONS = ["RECEIVED", "ISSUED", "RETURNED", "DAMAGED_LOST"];

const stockLineSchema = z.object({
  itemName: z.string().min(1),
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: z.number().nonnegative().max(MAX_QUANTITY),
  unit: z.string().optional(),
  unitCost: z.number().nonnegative().max(MAX_QUANTITY).optional(),
  supplier: z.string().optional(),
  deliveryReference: z.string().optional(),
  notes: z.string().optional(),
  bomItemId: z.string().uuid().optional().nullable(),
});

const storesSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  shortagesAndRequirements: z.string().optional(),
  comments: z.string().optional(),
  // Same rule as QS — a stores report with no movements says nothing (spec 9.3).
  lines: z.array(stockLineSchema).min(1, "At least one stock transaction line is required"),
});

// Stamps each line with opening/closing balance — computed here, not
// trusted from the client, same principle as deriveQsLine. Lines for the
// same item within one submission carry the balance forward between
// each other, not just from prior approved history.
async function deriveStockLines(projectId, lines) {
  const itemNames = [...new Set(lines.map((l) => l.itemName))];
  const balances = await getApprovedStockBalances(projectId, itemNames);

  return lines.map((line) => {
    const opening = balances.get(line.itemName) ?? 0;
    const delta = line.direction === "RECEIVED" || line.direction === "RETURNED" ? line.quantity : -line.quantity;
    const closing = opening + delta;
    balances.set(line.itemName, closing);
    return { ...line, openingBalance: opening, closingBalance: closing };
  });
}

router.post(
  "/stores",
  requireAuth,
  requireRole("STORESMAN"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = storesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, shortagesAndRequirements, comments, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { storesDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const derivedLines = await deriveStockLines(projectId, lines);

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "STORES",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        storesDetail: {
          create: {
            shortagesAndRequirements,
            comments,
            lines: { create: derivedLines },
          },
        },
      },
      include: { storesDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "STORES", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Stores report awaiting approval",
      message: "A Stores report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    if (shortagesAndRequirements) {
      await notifyManagers({
        type: "MATERIAL_SHORTAGE",
        title: "Material shortage reported",
        message: shortagesAndRequirements,
        projectId,
        link: "/analytics/stores",
        dedupeKey: `MATERIAL_SHORTAGE:${report.id}`,
      });
    }

    res.status(201).json(report);
  }
);

router.get("/stores", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "STORES" };
  if (req.user.role === "STORESMAN") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      storesDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/stores/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      storesDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "ENGINEER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/stores/:id", requireAuth, requireRole("STORESMAN"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "STORES");
  if (!report) return;

  const parsed = storesSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, shortagesAndRequirements, comments, lines } = parsed.data;
  const derivedLines = await deriveStockLines(report.projectId, lines);

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      storesDetail: {
        update: {
          shortagesAndRequirements,
          comments,
          lines: { deleteMany: {}, create: derivedLines },
        },
      },
    },
    include: { storesDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "STORES", lineCount: lines.length },
  });

  res.json(updated);
});

const FINANCE_LINE_TYPES = ["FUNDS_RECEIVED", "EXPENDITURE", "COMMITMENT"];
const FINANCE_CATEGORIES = [
  "ADVANCE_PAYMENT",
  "OTHER_FUNDS",
  "MATERIALS",
  "LABOUR",
  "PLANT_EQUIPMENT",
  "TRANSPORT_LOGISTICS",
  "SUBCONTRACTOR",
  "SUPPLIER",
  "PETTY_CASH",
  "OTHER",
];

const financeLineSchema = z.object({
  type: z.enum(FINANCE_LINE_TYPES),
  category: z.enum(FINANCE_CATEGORIES),
  amount: z.number().nonnegative().max(MAX_QUANTITY),
  description: z.string().optional(),
  paymentReference: z.string().optional(),
});

const financeSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  submissionId: z.string().min(1),
  comments: z.string().optional(),
  lines: z.array(financeLineSchema).min(1, "At least one transaction line is required"),
});

router.post(
  "/finance",
  requireAuth,
  requireRole("FINANCE"),
  requireProjectAccess,
  async (req, res) => {
    const parsed = financeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { projectId, reportDate, submissionId, comments, lines } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { submissionId },
      include: { financeDetail: { include: { lines: true } } },
    });
    if (existing) {
      return res.status(200).json(existing);
    }

    const report = await prisma.report.create({
      data: {
        projectId,
        type: "FINANCE",
        reportDate: new Date(reportDate),
        submittedById: req.user.id,
        submissionId,
        financeDetail: {
          create: {
            comments,
            lines: { create: lines },
          },
        },
      },
      include: { financeDetail: { include: { lines: true } } },
    });

    await recordAudit({
      userId: req.user.id,
      action: "REPORT_SUBMITTED",
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "FINANCE", projectId, lineCount: lines.length },
    });

    await notifyManagers({
      type: "REPORT_AWAITING_APPROVAL",
      title: "Finance report awaiting approval",
      message: "A Finance report was submitted and is awaiting your review.",
      projectId,
      link: "/approvals",
      dedupeKey: `REPORT_AWAITING_APPROVAL:${report.id}`,
    });

    res.status(201).json(report);
  }
);

router.get("/finance", requireAuth, requireProjectAccess, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const where = { projectId, type: "FINANCE" };
  if (req.user.role === "FINANCE") {
    where.submittedById = req.user.id;
  }

  const reports = await prisma.report.findMany({
    where,
    include: {
      financeDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: { reportDate: "desc" },
  });
  res.json(reports);
});

router.get("/finance/:id", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      financeDetail: { include: { lines: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "ENGINEER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to view this report" });
    }
  }

  res.json(report);
});

router.patch("/finance/:id", requireAuth, requireRole("FINANCE"), async (req, res) => {
  const report = await assertReturnedAndOwned(req, res, req.params.id, "FINANCE");
  if (!report) return;

  const parsed = financeSchema.omit({ submissionId: true, projectId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { reportDate, comments, lines } = parsed.data;

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      reportDate: new Date(reportDate),
      status: "SUBMITTED",
      returnReason: null,
      submittedAt: new Date(),
      financeDetail: {
        update: {
          comments,
          lines: { deleteMany: {}, create: lines },
        },
      },
    },
    include: { financeDetail: { include: { lines: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: editAuditAction(req, report),
    entityType: "Report",
    entityId: report.id,
    metadata: { type: "FINANCE", lineCount: lines.length },
  });

  res.json(updated);
});

// ── Excel export ────────────────────────────────────────────────────────────
router.get("/qs/:id/export", requireAuth, async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: {
      qsDetail: { include: { lines: true } },
      submittedBy: { select: { name: true } },
      project: { select: { name: true, code: true, client: true } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.user.role !== "TECHNICAL_MANAGER" && req.user.role !== "MANAGEMENT") {
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: report.projectId },
    });
    if (!assignment && report.submittedById !== req.user.id) {
      return res.status(403).json({ error: "Not permitted to export this report" });
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("QS Valuation");

  const GREEN  = "FF217346";
  const DKGRN  = "FF1A5C38";
  const WHITE  = "FFFFFFFF";
  const NAVY   = "FF1F4E79";
  const LTGRN  = "FFE2EFDA";
  const YELLOW = "FFFFF2CC";
  const TOTBG  = "FFC6EFCE";
  const RETBG  = "FFDCE6F1";
  const GREY   = "FFD9D9D9";

  function hdr(bold = true, bg = GREEN, fg = WHITE, sz = 11) {
    return { font: { bold, color: { argb: fg }, size: sz, name: "Calibri" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  }
  function cell(bold = false, bg = "FFFFFFFF", fg = "FF000000", align = "left") {
    return { font: { bold, color: { argb: fg }, size: 11, name: "Calibri" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } }, alignment: { horizontal: align, vertical: "middle" }, border: { top: { style: "thin", color: { argb: "FFD0D0D0" } }, bottom: { style: "thin", color: { argb: "FFD0D0D0" } }, left: { style: "thin", color: { argb: "FFD0D0D0" } }, right: { style: "thin", color: { argb: "FFD0D0D0" } } } };
  }
  function num(bold = false, bg = "FFFFFFFF") {
    const s = cell(bold, bg, bold ? "FF276221" : "FF000000", "right");
    s.numFmt = '"$"#,##0.00';
    return s;
  }

  ws.columns = [
    { width: 10 }, { width: 40 }, { width: 8 }, { width: 14 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
  ];

  // Title rows
  const t1 = ws.addRow([`ONE TOUCH ELECTRICAL SERVICE — QS CLAIM`]);
  ws.mergeCells(`A${t1.number}:J${t1.number}`);
  t1.height = 24;
  t1.getCell(1).style = { font: { bold: true, color: { argb: WHITE }, size: 14, name: "Calibri" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }, alignment: { horizontal: "center", vertical: "middle" } };

  const proj = report.project;
  const t2 = ws.addRow([`Project: ${proj.name} (${proj.code})  |  Date: ${new Date(report.reportDate).toLocaleDateString()}  |  Submitted by: ${report.submittedBy.name}  |  Status: ${report.status}`]);
  ws.mergeCells(`A${t2.number}:J${t2.number}`);
  t2.height = 16;
  t2.getCell(1).style = { font: { color: { argb: WHITE }, size: 10, name: "Calibri" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } }, alignment: { horizontal: "left", vertical: "middle" } };

  ws.addRow([]);

  // Column header row
  const colLabels = ["Item", "Description", "Unit", "Qnty", "Tendered Rate", "Amount 1", "Used Rate", "Qtny", "Amount 2", "Variance"];
  const h = ws.addRow(colLabels);
  h.height = 36;
  h.eachCell((c) => { c.style = hdr(); });

  // Data rows
  const lines = report.qsDetail?.lines ?? [];
  const fmt = (v) => v != null ? Number(v) : null;

  for (const line of lines) {
    const isVar = !!line.variationReference;
    const bg = isVar ? YELLOW : "FFFFFFFF";
    const rate = fmt(line.contractRate);
    const cqty = fmt(line.contractQuantity);
    const tqty = fmt(line.quantityToday);
    const cumqty = fmt(line.cumulativeQuantity);
    const balqty = fmt(line.balanceQuantity);
    const contractAmt = fmt(line.contractAmount) ?? (rate != null && cqty != null ? cqty * rate : fmt(line.valuationAmount));
    const periodAmt   = fmt(line.periodAmount)   ?? (rate != null && tqty != null ? tqty * rate : null);
    const cumulAmt    = fmt(line.cumulativeAmount) ?? (rate != null && cumqty != null ? cumqty * rate : null);

    const r = ws.addRow([
      line.boqItemNumber,
      line.description,
      line.unit ?? "",
      cqty,
      rate,
      contractAmt,
      rate,       // Used Rate (same as tendered rate unless varied)
      tqty,
      periodAmt,
      balqty,
    ]);
    r.height = 18;

    const numCols = [4, 5, 6, 7, 8, 9, 10];
    r.eachCell((c, col) => {
      if (numCols.includes(col)) {
        c.style = num(col === 9, bg);
      } else {
        c.style = cell(false, bg);
      }
    });
  }

  // Totals row
  const totals = lines.reduce((acc, l) => {
    const rate = Number(l.contractRate ?? 0);
    acc.contractAmt  += Number(l.contractAmount  ?? (rate * Number(l.contractQuantity)));
    acc.periodAmt    += Number(l.periodAmount    ?? (rate * Number(l.quantityToday)));
    acc.cumulAmt     += Number(l.cumulativeAmount ?? (rate * Number(l.cumulativeQuantity)));
    return acc;
  }, { contractAmt: 0, periodAmt: 0, cumulAmt: 0 });

  const tot = ws.addRow(["TOTALS", "", "", "", "", totals.contractAmt || null, "", "", totals.periodAmt || null, ""]);
  tot.height = 20;
  tot.eachCell((c, col) => {
    c.style = num(true, TOTBG);
    if ([1].includes(col)) c.style = { ...cell(true, TOTBG, "FF276221"), border: { top: { style: "medium" } } };
  });

  ws.addRow([]);

  // Gross claim row
  const grossRow = ws.addRow(["Gross amount claimed this period", "", "", "", "", "", "", "", totals.periodAmt || null, ""]);
  grossRow.height = 20;
  grossRow.eachCell((c, col) => {
    if (col === 9) {
      c.style = { ...num(true, NAVY), font: { bold: true, color: { argb: WHITE }, size: 12, name: "Calibri" } };
    } else {
      c.style = cell(true, NAVY, WHITE);
    }
  });
  ws.mergeCells(`A${grossRow.number}:H${grossRow.number}`);

  const buf = await wb.xlsx.writeBuffer();
  const dateStr = new Date(report.reportDate).toISOString().slice(0, 10);
  const filename = `QS_Valuation_${proj.code}_${dateStr}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

module.exports = router;
