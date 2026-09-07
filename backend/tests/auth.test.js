const request = require("supertest");
const { getApp, loginAs, authed, CREDENTIALS } = require("./helpers");

describe("auth", () => {
  it("logs in with correct credentials", async () => {
    const app = getApp();
    const res = await request(app).post("/api/auth/login").send(CREDENTIALS.FOREMAN);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(CREDENTIALS.FOREMAN.email);
  });

  it("rejects a wrong password", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: CREDENTIALS.FOREMAN.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("gives the same error for a nonexistent email as for a wrong password (no user enumeration)", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "does-not-exist@onetouch.test", password: "whatever123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("rejects requests with no token", async () => {
    const app = getApp();
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage/malformed token", async () => {
    const app = getApp();
    const res = await authed(request(app).get("/api/projects"), "not.a.real.token");
    expect(res.status).toBe(401);
  });

  it("rejects a token with a tampered payload (signature no longer matches)", async () => {
    const app = getApp();
    const { token } = await loginAs(app, "FOREMAN");
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "x", role: "TECHNICAL_MANAGER", email: "x@x.com", exp: 9999999999 })
    )
      .toString("base64")
      .replace(/=/g, "");
    const tampered = `${header}.${tamperedPayload}.${signature}`;
    const res = await authed(request(app).get("/api/projects"), tampered);
    expect(res.status).toBe(401);
  });

  it("rotates the refresh token and rejects replay of the used one", async () => {
    const app = getApp();
    const login = await request(app).post("/api/auth/login").send(CREDENTIALS.FINANCE);
    const cookie = login.headers["set-cookie"];

    const first = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(first.status).toBe(200);

    // The original cookie's refresh token was revoked by the rotation above.
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(replay.status).toBe(401);
  });

  it("lets a user change their own password, and the old password stops working", async () => {
    const app = getApp();
    const { token } = await loginAs(app, "STORESMAN");

    const change = await authed(request(app).post("/api/auth/change-password"), token).send({
      currentPassword: CREDENTIALS.STORESMAN.password,
      newPassword: "NewTestPass456!",
    });
    expect(change.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send(CREDENTIALS.STORESMAN);
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: CREDENTIALS.STORESMAN.email, password: "NewTestPass456!" });
    expect(newLogin.status).toBe(200);
  });

  it("restores the Storesman fixture password for future test runs", async () => {
    const app = getApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: CREDENTIALS.STORESMAN.email, password: "NewTestPass456!" });
    const change = await authed(request(app).post("/api/auth/change-password"), login.body.accessToken).send({
      currentPassword: "NewTestPass456!",
      newPassword: CREDENTIALS.STORESMAN.password,
    });
    expect(change.status).toBe(200);
  });
});
