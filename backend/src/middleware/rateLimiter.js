const { RateLimiterMemory } = require("rate-limiter-flexible");

// In-memory for now (single server instance at Step 1 scope).
// Swap to a Redis-backed limiter (per the spec, Section 1.2) once
// BullMQ/Redis is introduced in a later phase.
const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 60,
});

async function loginRateLimit(req, res, next) {
  const key = req.ip;
  try {
    await loginLimiter.consume(key);
    next();
  } catch {
    res.status(429).json({ error: "Too many login attempts. Try again in a minute." });
  }
}

module.exports = { loginRateLimit };
