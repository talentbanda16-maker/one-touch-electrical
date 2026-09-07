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

// A fixed, valid bcrypt hash (of an arbitrary string, cost 12 to match
// real password hashing) that a login for a nonexistent/inactive user
// is compared against, purely to burn the same wall-clock time a real
// password check would — see the timing note at its call site.
const DUMMY_PASSWORD_HASH = "$2b$12$RVl3T0PRsuCNKtqeBIY4xea3O29Lk.2q2qQ7NmmKkt9GnvQQNBH6S";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
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
  // "strict" only works when the frontend and backend share a domain.
  // The moment they're split across two hosts (frontend on Vercel,
  // backend on a tunnel/rented server) the browser treats every request
  // between them as cross-site and won't send a "strict" cookie back at
  // all — silently breaking login/refresh with no obvious error. "none"
  // is the one setting that works in both the same-domain and
  // split-domain case, and it's only usable over HTTPS anyway (browsers
  // reject "none" without "secure"), which every real deployment has.
  res.cookie("refreshToken", rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
    // Runs a real bcrypt comparison even though there's no user to check
    // against — skipping straight to the 401 would make a nonexistent
    // email respond measurably faster than a wrong password for a real
    // one (no bcrypt cost paid), letting someone enumerate valid emails
    // by timing alone despite the identical error message.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
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

// Self-service password change (spec Section 22: "secure ... password
// management") — previously only the Technical Manager could set a
// password, at account creation, with no way for a user to change their
// own. Requires the current password, and revokes every other refresh
// token so a compromised session elsewhere is kicked out immediately —
// same response shape as the compromised-account deactivate flow.
router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  const currentRaw = req.cookies?.refreshToken;
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, ...(currentRaw ? { tokenHash: { not: hashToken(currentRaw) } } : {}) },
    data: { revoked: true },
  });

  await recordAudit({ userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id });

  res.json({ success: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

module.exports = router;
