const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireProjectMember } = require("../middleware/rbac");

const router = express.Router();

const REPORT_TYPES = ["FOREMAN", "QS", "SHE", "STORES", "FINANCE"];

function validType(req, res, next) {
  if (!REPORT_TYPES.includes(req.params.type?.toUpperCase())) {
    return res.status(400).json({ error: `type must be one of ${REPORT_TYPES.join(", ")}` });
  }
  req.reportType = req.params.type.toUpperCase();
  next();
}

// One draft per (user, project, type) — the employee's own in-progress
// copy of that form. Deliberately unauthenticated against the strict
// per-type schemas; see the ReportDraft model comment for why.
router.get("/:type", requireAuth, validType, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const draft = await prisma.reportDraft.findUnique({
    where: { userId_projectId_type: { userId: req.user.id, projectId, type: req.reportType } },
  });
  res.json(draft);
});

const saveSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().date(),
  data: z.record(z.any()),
});

// requireProjectMember, not requireProjectAccess — a draft save is a
// write, and requireProjectAccess bypasses for Management (by design,
// for its read-only full visibility), which let Management persist a
// draft despite having no project assignment and no business writing
// anything at all. Same class of mistake as the earlier Actions fix.
router.put("/:type", requireAuth, validType, requireProjectMember, async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { projectId, reportDate, data } = parsed.data;

  const draft = await prisma.reportDraft.upsert({
    where: { userId_projectId_type: { userId: req.user.id, projectId, type: req.reportType } },
    create: { userId: req.user.id, projectId, type: req.reportType, reportDate: new Date(reportDate), data },
    update: { reportDate: new Date(reportDate), data },
  });

  res.status(200).json(draft);
});

router.delete("/:type", requireAuth, validType, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  await prisma.reportDraft.deleteMany({ where: { userId: req.user.id, projectId, type: req.reportType } });
  res.status(204).send();
});

module.exports = router;
