const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireProjectAccess, requireProjectMember } = require("../middleware/rbac");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
// Project documents (contracts, drawings, site plans) are a superset of
// the report-photo types — PDFs and Word docs on top of the same images.
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  ...ALLOWED_MIME_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Report attachments accept the same types as project documents — QS and
// Finance reports both need to attach an actual document (a measurement
// sheet, a claim, an invoice), not just a site photo, and Finance's own
// success message already called these "supporting documents."
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WEBP, HEIC, PDF or Word documents are allowed"));
    }
    cb(null, true);
  },
});

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WEBP, HEIC, PDF or Word documents are allowed"));
    }
    cb(null, true);
  },
});

// The Content-Type multer/fileFilter checks above comes straight from
// the client's multipart request — fully attacker-controlled, so a
// malicious upload could declare "image/png" while actually containing
// HTML/JS. The X-Content-Type-Options: nosniff response header already
// stops a browser from executing that on download, but this checks the
// real file bytes too, as defense in depth rather than relying on one
// header alone. HEIC's real signature is a variable-offset "ftyp" box,
// not a fixed prefix, so it's exempted rather than half-checked.
const MAGIC_BYTES = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // "RIFF"; bytes 8-11 must be "WEBP", checked separately below
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // "%PDF"
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]], // zip
};

function contentMatchesDeclaredType(buffer, mimetype) {
  if (mimetype === "image/heic") return true;
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return true;
  const matches = signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
  if (!matches) return false;
  if (mimetype === "image/webp") {
    return buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  return true;
}

function rejectIfContentMismatch(req, res) {
  if (!contentMatchesDeclaredType(req.file.buffer, req.file.mimetype)) {
    res.status(400).json({ error: "File content doesn't match its declared type" });
    return true;
  }
  return false;
}

// multer/busboy decode the multipart filename field as latin1 by default
// (an old spec quirk), but every modern browser actually sends it UTF-8
// — so any non-ASCII filename (accents, emoji, CJK, etc.) comes through
// mojibake'd unless it's re-decoded here. Safe to run on a plain-ASCII
// name too: latin1 and UTF-8 agree on that range, so it's a no-op.
function fixFilenameEncoding(name) {
  return Buffer.from(name, "latin1").toString("utf8");
}

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
  if (rejectIfContentMismatch(req, res)) return;
  req.file.originalname = fixFilenameEncoding(req.file.originalname);

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

// Confirms the user may act on this instruction: Technical
// Manager/Management, or the person it's assigned to — same rule
// PATCH /instructions/:id/status already uses.
async function assertInstructionAccess(req, res, instructionId) {
  const instruction = await prisma.instruction.findUnique({ where: { id: instructionId } });
  if (!instruction) {
    res.status(404).json({ error: "Instruction not found" });
    return null;
  }
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    return instruction;
  }
  if (instruction.personResponsibleId !== req.user.id) {
    res.status(403).json({ error: "Not permitted to access this instruction" });
    return null;
  }
  return instruction;
}

// Evidence/photographs for an instruction (spec Section 13) — the person
// responsible proves the work was done, or the Technical Manager attaches
// something directly. Same document types as everywhere else.
router.post(
  "/instructions/:instructionId/attachments",
  requireAuth,
  uploadDocument.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (rejectIfContentMismatch(req, res)) return;
    req.file.originalname = fixFilenameEncoding(req.file.originalname);

    const instruction = await assertInstructionAccess(req, res, req.params.instructionId);
    if (!instruction) return;

    const dirKey = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const dir = path.join(UPLOAD_ROOT, instruction.projectId, dirKey);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedFileName), req.file.buffer);

    const storageKey = path.join(instruction.projectId, dirKey, storedFileName);

    const attachment = await prisma.attachment.create({
      data: {
        instructionId: instruction.id,
        projectId: instruction.projectId,
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
      metadata: { instructionId: instruction.id },
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
    });
  }
);

router.get("/instructions/:instructionId/attachments", requireAuth, async (req, res) => {
  const instruction = await assertInstructionAccess(req, res, req.params.instructionId);
  if (!instruction) return;

  const attachments = await prisma.attachment.findMany({
    where: { instructionId: instruction.id },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// Confirms the user may act on this action: Technical Manager/Management,
// or the assignee — same rule PATCH /actions/:id/status already uses.
async function assertActionAccess(req, res, actionId) {
  const action = await prisma.action.findUnique({ where: { id: actionId } });
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return null;
  }
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    return action;
  }
  if (action.assignedToId !== req.user.id) {
    res.status(403).json({ error: "Not permitted to access this action" });
    return null;
  }
  return action;
}

// Evidence for an action (spec Section 14) — the assignee proves it's
// done, or the Technical Manager attaches something directly.
router.post("/actions/:actionId/attachments", requireAuth, uploadDocument.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (rejectIfContentMismatch(req, res)) return;
  req.file.originalname = fixFilenameEncoding(req.file.originalname);

  const action = await assertActionAccess(req, res, req.params.actionId);
  if (!action) return;

  const dirKey = crypto.randomUUID();
  const ext = path.extname(req.file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
  const storedFileName = `${crypto.randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, action.projectId, dirKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedFileName), req.file.buffer);

  const storageKey = path.join(action.projectId, dirKey, storedFileName);

  const attachment = await prisma.attachment.create({
    data: {
      actionId: action.id,
      projectId: action.projectId,
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
    metadata: { actionId: action.id },
  });

  res.status(201).json({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt,
  });
});

router.get("/actions/:actionId/attachments", requireAuth, async (req, res) => {
  const action = await assertActionAccess(req, res, req.params.actionId);
  if (!action) return;

  const attachments = await prisma.attachment.findMany({
    where: { actionId: action.id },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// General project documents/photographs (site plans, contracts, drawings)
// — distinct from report photos, which stay tied to the report they were
// taken for. Upload is restricted to actual project team members (or
// Technical Manager); Management can view/download but not upload,
// matching its read-only role elsewhere.
router.post(
  "/projects/:projectId/documents",
  requireAuth,
  requireProjectMember,
  uploadDocument.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (rejectIfContentMismatch(req, res)) return;
    req.file.originalname = fixFilenameEncoding(req.file.originalname);

    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const dirKey = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const dir = path.join(UPLOAD_ROOT, project.id, dirKey);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedFileName), req.file.buffer);

    const storageKey = path.join(project.id, dirKey, storedFileName);

    const attachment = await prisma.attachment.create({
      data: {
        projectId: project.id,
        fileName: req.file.originalname,
        storageKey,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedById: req.user.id,
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: "PROJECT_DOCUMENT_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { projectId: project.id },
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
    });
  }
);

router.get("/projects/:projectId/documents", requireAuth, requireProjectAccess, async (req, res) => {
  const attachments = await prisma.attachment.findMany({
    where: { projectId: req.params.projectId, reportId: null, instructionId: null, actionId: null },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      createdAt: a.createdAt,
      uploadedBy: a.uploadedBy,
    }))
  );
});

// Confirms the user may access a project-level document: same rule as
// requireProjectAccess, applied to an already-loaded attachment instead
// of a route param.
async function assertProjectDocumentAccess(req, res, attachment) {
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") return true;
  const assignment = await prisma.projectAssignment.findFirst({
    where: { userId: req.user.id, projectId: attachment.projectId },
  });
  if (!assignment) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return false;
  }
  return true;
}

// Serves the actual file bytes. Never a public/static path — every
// request re-checks the requester has access to the parent report (or,
// for a project-level document, the project itself).
router.get("/attachments/:id/file", requireAuth, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) return res.status(404).json({ error: "Not found" });

  if (attachment.reportId) {
    const report = await assertReportAccess(req, res, attachment.reportId);
    if (!report) return;
  } else if (attachment.instructionId) {
    const instruction = await assertInstructionAccess(req, res, attachment.instructionId);
    if (!instruction) return;
  } else if (attachment.actionId) {
    const action = await assertActionAccess(req, res, attachment.actionId);
    if (!action) return;
  } else {
    const allowed = await assertProjectDocumentAccess(req, res, attachment);
    if (!allowed) return;
  }

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
