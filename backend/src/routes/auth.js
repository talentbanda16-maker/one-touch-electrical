const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { loginRateLimit } = require("../middleware/rateLimiter");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

async function issueRefreshToken(user) {
  const raw = crypto.randomBytes(48).toString("hex");
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

function setRefreshCookie(res, rawToken) {
  res.cookie("refreshToken", rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: "/api/auth",
  });
}

router.post("/login", loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    await recordAudit({ action: "LOGIN_FAILED", entityType: "User", entityId: user.id });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = await issueRefreshToken(user);
  setRefreshCookie(res, refreshToken);

  await recordAudit({ userId: user.id, action: "LOGIN_SUCCESS", entityType: "User", entityId: user.id });

  res.json({
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.post("/refresh", async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ error: "No refresh token" });

  const tokenHash = hashToken(raw);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: "Refresh token invalid or expired" });
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "User no longer active" });
  }

  // Rotate: revoke the used token, issue a new one.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const newRawToken = await issueRefreshToken(user);
  setRefreshCookie(res, newRawToken);

  const accessToken = issueAccessToken(user);
  res.json({ accessToken });
});

router.post("/logout", requireAuth, async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw) },
      data: { revoked: true },
    });
  }
  res.clearCookie("refreshToken", { path: "/api/auth" });
  await recordAudit({ userId: req.user.id, action: "LOGOUT", entityType: "User", entityId: req.user.id });
  res.json({ success: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

module.exports = router;
