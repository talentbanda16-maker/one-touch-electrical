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
  // Spreadsheets + MS Project — used for Programme of Works uploads.
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-project",
  "application/x-msproject",
  "application/octet-stream",
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

// ---------- Contract agreements (the signed project contract, Word/PDF) ----------
// Stored like a project document but tagged category:"CONTRACT" so the
// Contract page shows only contracts, not every project document.
router.post(
  "/projects/:projectId/contracts",
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
        category: "CONTRACT",
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: "CONTRACT_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { projectId: project.id },
    });

    res.status(201).json({
      id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType,
      fileSize: attachment.fileSize, createdAt: attachment.createdAt,
    });
  }
);

router.get("/projects/:projectId/contracts", requireAuth, requireProjectAccess, async (req, res) => {
  const attachments = await prisma.attachment.findMany({
    where: { projectId: req.params.projectId, category: "CONTRACT" },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(attachments.map((a) => ({
    id: a.id, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize,
    createdAt: a.createdAt, uploadedBy: a.uploadedBy,
  })));
});

router.delete("/projects/:projectId/contracts/:attachmentId", requireAuth, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || attachment.category !== "CONTRACT") {
    return res.status(404).json({ error: "Contract not found" });
  }
  try { fs.unlinkSync(path.join(UPLOAD_ROOT, attachment.storageKey)); } catch { /* best effort */ }
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await recordAudit({ userId: req.user.id, action: "CONTRACT_DELETED", entityType: "Attachment", entityId: attachment.id });
  res.json({ deleted: true });
});

// ---------- Interim Payment Claims (Word/PDF) — same storage, category tag ----
router.post(
  "/projects/:projectId/interim-claims",
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
        category: "INTERIM_CLAIM",
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: "INTERIM_CLAIM_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { projectId: project.id },
    });

    res.status(201).json({
      id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType,
      fileSize: attachment.fileSize, createdAt: attachment.createdAt,
    });
  }
);

router.get("/projects/:projectId/interim-claims", requireAuth, requireProjectAccess, async (req, res) => {
  const attachments = await prisma.attachment.findMany({
    where: { projectId: req.params.projectId, category: "INTERIM_CLAIM" },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(attachments.map((a) => ({
    id: a.id, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize,
    createdAt: a.createdAt, uploadedBy: a.uploadedBy,
  })));
});

router.delete("/projects/:projectId/interim-claims/:attachmentId", requireAuth, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || attachment.category !== "INTERIM_CLAIM") {
    return res.status(404).json({ error: "Claim not found" });
  }
  try { fs.unlinkSync(path.join(UPLOAD_ROOT, attachment.storageKey)); } catch { /* best effort */ }
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await recordAudit({ userId: req.user.id, action: "INTERIM_CLAIM_DELETED", entityType: "Attachment", entityId: attachment.id });
  res.json({ deleted: true });
});

// ---------- Programme of Works (Word/PDF/Excel/MS Project) ----------
router.post(
  "/projects/:projectId/programmes",
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

    // Two kinds: the Contract programme (baseline) and the Working programme (live).
    const category = req.body.type === "working" ? "PROGRAMME_WORKING" : "PROGRAMME_CONTRACT";

    const attachment = await prisma.attachment.create({
      data: {
        projectId: project.id,
        fileName: req.file.originalname,
        storageKey,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedById: req.user.id,
        category,
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: "PROGRAMME_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { projectId: project.id },
    });

    res.status(201).json({
      id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType,
      fileSize: attachment.fileSize, createdAt: attachment.createdAt,
    });
  }
);

router.get("/projects/:projectId/programmes", requireAuth, requireProjectAccess, async (req, res) => {
  // ?type=working → working programmes; default/contract → contract (incl. legacy "PROGRAMME").
  const categoryFilter = req.query.type === "working"
    ? { category: "PROGRAMME_WORKING" }
    : { category: { in: ["PROGRAMME_CONTRACT", "PROGRAMME"] } };
  const attachments = await prisma.attachment.findMany({
    where: { projectId: req.params.projectId, ...categoryFilter },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(attachments.map((a) => ({
    id: a.id, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize,
    createdAt: a.createdAt, uploadedBy: a.uploadedBy,
  })));
});

router.delete("/projects/:projectId/programmes/:attachmentId", requireAuth, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || !String(attachment.category || "").startsWith("PROGRAMME")) {
    return res.status(404).json({ error: "Programme not found" });
  }
  try { fs.unlinkSync(path.join(UPLOAD_ROOT, attachment.storageKey)); } catch { /* best effort */ }
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await recordAudit({ userId: req.user.id, action: "PROGRAMME_DELETED", entityType: "Attachment", entityId: attachment.id });
  res.json({ deleted: true });
});

// ---------- Drawings (electrical drawings/plans — versioned, QS-managed) -------
// Same category-attachment storage as contracts/programmes, tagged
// category:"DRAWING". Every upload is kept as its own row, newest = current,
// so any claim or BOQ quantity can always be traced back to the exact drawing
// version it was priced from. Upload/replace/delete is QS-only (per the brief —
// the Technical Manager's usual full-access bypass is deliberately NOT applied
// here); any assigned project member can view and download.
function requireQs(req, res, next) {
  if (req.user?.role === "QS") return next();
  return res.status(403).json({ error: "Only the Quantity Surveyor can manage drawings" });
}

// Device counts (AI-suggested, QS-confirmed) are stored as a single sidecar
// JSON map per project, living beside the uploaded files under UPLOAD_ROOT —
// so this needs no new DB column/migration and persists exactly as robustly as
// the drawing files themselves. Shape: { [attachmentId]: {switches, sockets, …} }.
function deviceCountsPath(projectId) {
  return path.join(UPLOAD_ROOT, projectId, "drawing-devices.json");
}
function readDeviceCounts(projectId) {
  try {
    const obj = JSON.parse(fs.readFileSync(deviceCountsPath(projectId), "utf8"));
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
function writeDeviceCounts(projectId, map) {
  const dir = path.join(UPLOAD_ROOT, projectId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(deviceCountsPath(projectId), JSON.stringify(map, null, 2));
}

// Normalises a quantity. A blank/null/non-numeric qty stays null ("not
// known yet" — e.g. an undimensioned cable length) rather than becoming 0,
// which would misread as a real quantity of zero.
function normQty(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n * 100) / 100);
}

// Calls Google Gemini (free-tier friendly) to count switches & sockets on a
// drawing. Returns a suggestion only — the QS reviews and corrects it before
// anything is saved. Reads the key from GEMINI_API_KEY; model overridable via
// GEMINI_MODEL (default gemini-2.0-flash, which the free tier serves).
// Model fallback chain: the configured model first, then other capable
// free-tier flash models to fall back to when one is busy or slow. Lite
// models are excluded on purpose — they return empty on dense drawings.
const CONFIGURED_MODELS = (process.env.GEMINI_MODEL || "gemini-3.6-flash").split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_MODELS = [...new Set([...CONFIGURED_MODELS, "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.7-flash", "gemini-3.8-flash"])].slice(0, 3);
const GEMINI_VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

async function countDevicesWithGemini(buffer, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const e = new Error("AI counting isn't set up yet — add GEMINI_API_KEY to the backend .env");
    e.statusCode = 400; throw e;
  }
  if (!GEMINI_VISION_TYPES.has(mimeType)) {
    const e = new Error("AI counting works on PNG, JPEG, WEBP or PDF drawings only");
    e.statusCode = 400; throw e;
  }
  const prompt = [
    "You are an experienced electrical engineer and quantity surveyor doing a take-off from an electrical drawing.",
    "First say what the drawing is (its type and what it shows). Then identify EVERY electrical component, element and labelled item you can see on it.",
    "Look for anything present — for example: distribution boards (DBs), feeder pillars, sub-mains and final circuits, streetlights / lanterns, light fittings, socket outlets, switches, isolators, circuit breakers / MCBs / MCCBs, contactors, meters, transformers, generators, cable runs with their sizes, conduit/trunking, earth electrodes, and any ratings or labels.",
    "Be specific to THIS drawing — use the actual names/labels shown on it (e.g. 'Feeder Pillar FP1', 'Streetlight DB', '4mm² cable', '63A MCCB'), not generic categories.",
    "For EACH item give four things — name, qty, rating, unit:",
    " - name: the component itself, kept short (e.g. 'MCB', 'Flood Light', 'Feeder Pillar', 'PVC/SWA Cable', 'Smoke Detector').",
    " - qty: how much is needed, IN THE UNIT you give it. For a COUNTED item (unit 'nr') this is the NUMBER of them read off the drawing. For a CABLE or anything measured in metres (unit 'm') this is the LENGTH IN METRES needed — if the drawing is a scaled layout/plan, estimate the total run length from the scale, counting every run and adding a sensible allowance for drops and routing; give your best metre figure, NOT a count of runs. Always give a number.",
    " - rating: the SIZE / RATING / spec of the item exactly as marked on the drawing — the 'how big is it' a buyer needs. Examples: '10A', '63A TP', '500W', '250A busbar', '1.5mm²', '185mm² 4C PVC/SWA'. Read it off the drawing's labels; if an item has no rating marked, use an empty string (do NOT invent one).",
    " - unit: 'nr' for counted equipment (fittings, switches, detectors, DBs, pillars, breakers); 'm' for cables, conduit and wiring; 'm²' for areas.",
    "When you estimate a cable length off a scale, set confidence to 'low' and note in notes that cable lengths are estimates to confirm on site.",
    "Respond with ONLY strict JSON of exactly this shape, no prose, no markdown:",
    '{"summary": <string>, "items": [{"name": <string>, "qty": <number>, "rating": <string>, "unit": <string>}], "confidence": "low"|"medium"|"high", "notes": <string>}',
  ].join("\n");

  const body = {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
    ] }],
    generationConfig: { temperature: 0, response_mime_type: "application/json" },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Fail-fast: one pass through a short model chain. If a model is busy
  // (503/429) move to the next; if all are busy, return quickly so the user
  // can just re-click, rather than grinding through long retries.
  let res = null, lastDetail = "", lastStatus = 0, anyTimeout = false, hardStop = false;
  for (let round = 0; round < 1 && !hardStop && !res; round++) {
    if (round > 0) await sleep(2500);
    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      let r;
      try {
        // A busy model answers fast (503) so we move on quickly; only a
        // genuinely slow read uses the full 75s window.
        r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(75000) });
      } catch {
        anyTimeout = true; continue; // timed out — try the next model
      }
      if (r.ok) { res = r; break; }
      try { lastDetail = (await r.json())?.error?.message || ""; } catch { lastDetail = ""; }
      lastStatus = r.status;
      if (![429, 500, 503].includes(r.status)) { hardStop = true; break; } // bad key / bad request — won't fix itself
      // else busy — fall back to the next model
    }
  }
  if (!res) {
    const busy = [429, 503].includes(lastStatus) || anyTimeout || lastStatus === 0;
    const e = new Error(busy
      ? "The AI service is overloaded on Google's side right now. Give it a minute and press AI read again — it usually clears quickly."
      : `AI service error (${lastStatus})${lastDetail ? ": " + lastDetail : ""}`);
    e.statusCode = busy ? 503 : 502; throw e;
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const e = new Error("The AI reply couldn't be read — try again");
    e.statusCode = 502; throw e;
  }
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "",
    items: Array.isArray(parsed.items)
      ? parsed.items.filter((o) => o && o.name).slice(0, 100).map((o) => ({
          name: String(o.name).slice(0, 120),
          qty: normQty(o.qty),
          rating: typeof o.rating === "string" ? o.rating.slice(0, 60) : "",
          unit: typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().slice(0, 16) : "nr",
        }))
      : [],
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low",
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 500) : "",
  };
}

router.post(
  "/projects/:projectId/drawings",
  requireAuth,
  requireQs,
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
        category: "DRAWING",
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: "DRAWING_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { projectId: project.id },
    });

    res.status(201).json({
      id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType,
      fileSize: attachment.fileSize, createdAt: attachment.createdAt,
    });
  }
);

router.get("/projects/:projectId/drawings", requireAuth, requireProjectAccess, async (req, res) => {
  const attachments = await prisma.attachment.findMany({
    where: { projectId: req.params.projectId, category: "DRAWING" },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const counts = readDeviceCounts(req.params.projectId);
  res.json(attachments.map((a) => ({
    id: a.id, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize,
    createdAt: a.createdAt, uploadedBy: a.uploadedBy,
    devices: counts[a.id] || null,
  })));
});

router.delete("/projects/:projectId/drawings/:attachmentId", requireAuth, requireQs, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || attachment.category !== "DRAWING") {
    return res.status(404).json({ error: "Drawing not found" });
  }
  try { fs.unlinkSync(path.join(UPLOAD_ROOT, attachment.storageKey)); } catch { /* best effort */ }
  await prisma.attachment.delete({ where: { id: attachment.id } });
  const counts = readDeviceCounts(req.params.projectId);
  if (counts[attachment.id]) { delete counts[attachment.id]; writeDeviceCounts(req.params.projectId, counts); }
  await recordAudit({ userId: req.user.id, action: "DRAWING_DELETED", entityType: "Attachment", entityId: attachment.id });
  res.json({ deleted: true });
});

// AI count — runs Gemini vision over the stored drawing and RETURNS a
// suggestion. It never saves on its own: the QS reviews/edits the numbers,
// then PUTs the confirmed figures below.
router.post("/projects/:projectId/drawings/:attachmentId/count-devices", requireAuth, requireQs, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || attachment.category !== "DRAWING") {
    return res.status(404).json({ error: "Drawing not found" });
  }
  const filePath = path.join(UPLOAD_ROOT, attachment.storageKey);
  if (!filePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File missing from storage" });
  }
  try {
    const result = await countDevicesWithGemini(fs.readFileSync(filePath), attachment.mimeType);
    await recordAudit({ userId: req.user.id, action: "DRAWING_AI_COUNTED", entityType: "Attachment", entityId: attachment.id, metadata: { itemTypes: result.items.length } });
    res.json({ ai: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Counting failed" });
  }
});

// Save the QS-confirmed device counts for a drawing (sidecar JSON on disk).
router.put("/projects/:projectId/drawings/:attachmentId/devices", requireAuth, requireQs, requireProjectMember, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.projectId !== req.params.projectId || attachment.category !== "DRAWING") {
    return res.status(404).json({ error: "Drawing not found" });
  }
  const b = req.body || {};
  const devices = {
    summary: typeof b.summary === "string" ? b.summary.slice(0, 1000) : "",
    items: Array.isArray(b.items)
      ? b.items.filter((o) => o && o.name).slice(0, 100).map((o) => ({
          name: String(o.name).slice(0, 120),
          qty: normQty(o.qty ?? o.count),
          rating: typeof o.rating === "string" ? o.rating.slice(0, 60) : "",
          unit: typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().slice(0, 16) : "nr",
        }))
      : [],
    notes: typeof b.notes === "string" ? b.notes.slice(0, 500) : "",
    confidence: ["low", "medium", "high"].includes(b.confidence) ? b.confidence : null,
    source: b.source === "ai" ? "ai" : "manual",
    savedAt: new Date().toISOString(),
    savedBy: req.user.name || null,
  };
  const counts = readDeviceCounts(req.params.projectId);
  counts[attachment.id] = devices;
  writeDeviceCounts(req.params.projectId, counts);
  await recordAudit({ userId: req.user.id, action: "DRAWING_DEVICES_SAVED", entityType: "Attachment", entityId: attachment.id, metadata: { itemTypes: devices.items.length } });
  res.json({ devices });
});

// Send a drawing's saved take-off into the project's Tender BOQ. APPENDS —
// it never wipes the existing BOQ. Each drawing's items go in under a heading
// row naming the drawing, so you can see where they came from, with the
// quantity + unit filled and the rate left blank for the QS to price.
router.post("/projects/:projectId/drawings/:attachmentId/send-to-boq", requireAuth, requireQs, requireProjectMember, async (req, res) => {
  const { projectId, attachmentId } = req.params;
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.projectId !== projectId || attachment.category !== "DRAWING") {
    return res.status(404).json({ error: "Drawing not found" });
  }
  const dev = readDeviceCounts(projectId)[attachmentId];
  if (!dev || !Array.isArray(dev.items) || dev.items.length === 0) {
    return res.status(400).json({ error: "No saved take-off for this drawing yet — run AI read and Save first." });
  }

  const last = await prisma.tenderBoqItem.findFirst({ where: { projectId }, orderBy: { order: "desc" }, select: { order: true } });
  let order = (last?.order ?? -1) + 1;
  const billLabel = `Drawing: ${attachment.fileName}`.slice(0, 300);

  const rows = [{
    projectId, order: order++, bill: billLabel, isHeading: true, itemNumber: null,
    description: attachment.fileName.replace(/\.[^.]+$/, ""), unit: null, quantity: null, rate: null,
  }];
  dev.items.forEach((it, idx) => {
    const qv = (it.qty === null || it.qty === undefined || it.qty === "") ? null : Number(it.qty);
    // Fold the rating/size into the BOQ description so the line reads like "10A MCB".
    const desc = (it.rating && String(it.rating).trim()) ? `${it.name} — ${it.rating}` : String(it.name);
    rows.push({
      projectId, order: order++, bill: billLabel, isHeading: false,
      itemNumber: String(idx + 1), description: desc.slice(0, 2000),
      unit: it.unit || null, quantity: Number.isFinite(qv) ? qv : null, rate: null,
    });
  });

  await prisma.tenderBoqItem.createMany({ data: rows });
  await recordAudit({ userId: req.user.id, action: "DRAWING_SENT_TO_BOQ", entityType: "Attachment", entityId: attachmentId, metadata: { items: dev.items.length } });
  res.json({ ok: true, added: dev.items.length });
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
