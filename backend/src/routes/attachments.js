const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WEBP or HEIC photos are allowed"));
    }
    cb(null, true);
  },
});

// Confirms the user may act on this report: assigned to its project,
// or Technical Manager/Management. Same rule as the report detail routes.
async function assertReportAccess(req, res, reportId) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return null;
  }
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    return report;
  }
  const assignment = await prisma.projectAssignment.findFirst({
    where: { userId: req.user.id, projectId: report.projectId },
  });
  if (!assignment && report.submittedById !== req.user.id) {
    res.status(403).json({ error: "Not permitted to access this report" });
    return null;
  }
  return report;
}

router.post("/reports/:reportId/attachments", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const report = await assertReportAccess(req, res, req.params.reportId);
  if (!report) return;

  // Store under a random directory name, not the report's real id/name, so a
  // guessed or enumerated URL path can't be used to find files by report.
  const dirKey = crypto.randomUUID();
  const ext = path.extname(req.file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
  const storedFileName = `${crypto.randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, report.projectId, dirKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedFileName), req.file.buffer);

  const storageKey = path.join(report.projectId, dirKey, storedFileName);

  const attachment = await prisma.attachment.create({
    data: {
      reportId: report.id,
      projectId: report.projectId,
      fileName: req.file.originalname,
      storageKey,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedById: req.user.id,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ATTACHMENT_UPLOADED",
    entityType: "Attachment",
    entityId: attachment.id,
    metadata: { reportId: report.id },
  });

  res.status(201).json({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt,
  });
});

router.get("/reports/:reportId/attachments", requireAuth, async (req, res) => {
  const report = await assertReportAccess(req, res, req.params.reportId);
  if (!report) return;

  const attachments = await prisma.attachment.findMany({
    where: { reportId: report.id },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// Serves the actual file bytes. Never a public/static path — every
// request re-checks the requester has access to the parent report.
router.get("/attachments/:id/file", requireAuth, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) return res.status(404).json({ error: "Not found" });

  const report = await assertReportAccess(req, res, attachment.reportId);
  if (!report) return;

  const filePath = path.join(UPLOAD_ROOT, attachment.storageKey);
  if (!filePath.startsWith(UPLOAD_ROOT)) {
    return res.status(400).json({ error: "Invalid attachment path" });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File missing from storage" });
  }

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
  fs.createReadStream(filePath).pipe(res);
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message?.includes("allowed")) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Upload failed" });
});

module.exports = router;
