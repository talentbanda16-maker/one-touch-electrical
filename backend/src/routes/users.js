const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

const ROLES = ["TECHNICAL_MANAGER", "ENGINEER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "MANAGEMENT", "GENERAL_WORKER"];
// Mirrors projects.js's ASSIGNABLE_ROLES — the same set of roles that
// get auto-enrolled on every project at project-creation time also get
// auto-enrolled on every existing project when the person is created,
// so it doesn't matter which happens first.
const ASSIGNABLE_ROLES = ["ENGINEER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "GENERAL_WORKER"];

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

// Only the Technical Manager creates accounts — this is an internal
// company tool, employees don't self-register.
router.post("/", requireAuth, requireRole(), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, name, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role },
  });

  if (ASSIGNABLE_ROLES.includes(role)) {
    const projects = await prisma.project.findMany({ select: { id: true } });
    if (projects.length > 0) {
      await prisma.projectAssignment.createMany({
        data: projects.map((p) => ({ userId: user.id, projectId: p.id, role })),
        skipDuplicates: true,
      });
    }
  }

  await recordAudit({ userId: req.user.id, action: "USER_CREATED", entityType: "User", entityId: user.id });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// Lets any authenticated user (not just the Technical Manager) find who
// the Technical Manager is — needed so a worker raising an action can
// pick a valid assignee. The Technical Manager has no ProjectAssignment
// row (same as Management — see seed.js), so it never appeared in a
// project's member list to begin with.
router.get("/technical-managers", requireAuth, async (_req, res) => {
  const managers = await prisma.user.findMany({
    where: { role: "TECHNICAL_MANAGER", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(managers);
});

router.get("/", requireAuth, requireRole(), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// Compromised-account response per spec Section 9.2: deactivate +
// revoke all refresh tokens in one step.
router.post("/:id/deactivate", requireAuth, requireRole(), async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.update({ where: { id }, data: { isActive: false } });
  await prisma.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });

  await recordAudit({ userId: req.user.id, action: "USER_DEACTIVATED", entityType: "User", entityId: id });

  res.json({ id: user.id, isActive: user.isActive });
});

router.post("/:id/reactivate", requireAuth, requireRole(), async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.update({ where: { id }, data: { isActive: true } });
  await recordAudit({ userId: req.user.id, action: "USER_REACTIVATED", entityType: "User", entityId: id });
  res.json({ id: user.id, isActive: user.isActive });
});

// Admin-assisted password reset (spec Section 22): this is an internal
// tool with no self-registration and no email/SMTP setup for a
// forgot-password link, so "I forgot my password" resolves the same way
// "I need an account" does — the Technical Manager acts directly.
// Revokes every existing session for the account, same as deactivate.
router.post("/:id/reset-password", requireAuth, requireRole(), async (req, res) => {
  const { id } = req.params;
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });

  await recordAudit({ userId: req.user.id, action: "PASSWORD_RESET_BY_ADMIN", entityType: "User", entityId: id });

  res.json({ success: true });
});

module.exports = router;
