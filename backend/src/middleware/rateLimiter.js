const { RateLimiterMemory } = require("rate-limiter-flexible");

// In-memory for now (single server instance at Step 1 scope).
// Swap to a Redis-backed limiter (per the spec, Section 1.2) once
// BullMQ/Redis is introduced in a later phase.
// Generous in the test environment — the integration suite logs in
// dozens of times across many test files sharing this one in-memory
// limiter instance (it's a module-level singleton, same as it would be
// in a real running server), and a real 5/min cap would make unrelated
// tests fail with 429s rather than actually testing anything.
const loginLimiter = new RateLimiterMemory({
  points: process.env.NODE_ENV === "test" ? 1000 : 5,
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
