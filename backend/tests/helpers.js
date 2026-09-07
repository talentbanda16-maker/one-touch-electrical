const request = require("supertest");

// Re-required per test file (Vitest isolates module state per file by
// default), which is what we want — a fresh Express app instance per
// file, no shared in-memory state (like the login rate limiter) leaking
// between files and causing order-dependent failures.
function getApp() {
  delete require.cache[require.resolve("../src/app")];
  return require("../src/app");
}

const CREDENTIALS = {
  TECHNICAL_MANAGER: { email: "test-tm@onetouch.test", password: "TestPass123!" },
  FOREMAN: { email: "test-foreman@onetouch.test", password: "TestPass123!" },
  QS: { email: "test-qs@onetouch.test", password: "TestPass123!" },
  SHE_OFFICER: { email: "test-she@onetouch.test", password: "TestPass123!" },
  STORESMAN: { email: "test-stores@onetouch.test", password: "TestPass123!" },
  FINANCE: { email: "test-finance@onetouch.test", password: "TestPass123!" },
  MANAGEMENT: { email: "test-management@onetouch.test", password: "TestPass123!" },
};

async function loginAs(app, role) {
  const creds = CREDENTIALS[role];
  const res = await request(app).post("/api/auth/login").send(creds);
  if (res.status !== 200) {
    throw new Error(`Login as ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.accessToken, userId: res.body.user.id, cookie: res.headers["set-cookie"] };
}

function authed(req, token) {
  return req.set("Authorization", `Bearer ${token}`);
}

module.exports = { getApp, loginAs, authed, CREDENTIALS };
