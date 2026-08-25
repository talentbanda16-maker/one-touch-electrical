const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();

const ROLES = ["TECHNICAL_MANAGER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "MANAGEMENT"];

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(ROLES),
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

  await recordAudit({ userId: req.user.id, action: "USER_CREATED", entityType: "User", entityId: user.id });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
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

module.exports = router;
