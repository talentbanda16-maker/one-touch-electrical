const request = require("supertest");
const { getApp, loginAs, authed } = require("./helpers");

describe("RBAC / IDOR boundaries", () => {
  let app;
  let tm, foreman, management;
  let isolatedProjectId;
  let financeReportId;

  beforeAll(async () => {
    app = getApp();
    tm = await loginAs(app, "TECHNICAL_MANAGER");
    foreman = await loginAs(app, "FOREMAN");
    management = await loginAs(app, "MANAGEMENT");

    // A project the fixture Foreman is deliberately NOT assigned to —
    // every check below proves they can't reach into it.
    const proj = await authed(request(app).post("/api/projects"), tm.token).send({
      name: "RBAC Isolated Project",
      code: `RBAC-${Date.now()}`,
      status: "ACTIVE",
    });
    expect(proj.status).toBe(201);
    isolatedProjectId = proj.body.id;

    const report = await authed(request(app).post("/api/reports/finance"), tm.token).send({
      projectId: isolatedProjectId,
      reportDate: "2026-06-01",
      submissionId: `rbac-fin-${Date.now()}`,
      comments: "sensitive",
      lines: [{ type: "EXPENDITURE", category: "MATERIALS", amount: 50000 }],
    });
    expect(report.status).toBe(201);
    financeReportId = report.body.id;
  });

  it("blocks an unprivileged role from a Technical-Manager-only route", async () => {
    const res = await authed(request(app).get("/api/users"), foreman.token);
    expect(res.status).toBe(403);
  });

  it("blocks an unprivileged role from creating an account", async () => {
    const res = await authed(request(app).post("/api/users"), foreman.token).send({
      email: "escalated@onetouch.test",
      name: "x",
      password: "password123",
      role: "TECHNICAL_MANAGER",
    });
    expect(res.status).toBe(403);
  });

  it("blocks reading a report from a project the user isn't assigned to", async () => {
    const res = await authed(request(app).get(`/api/reports/finance/${financeReportId}`), foreman.token);
    expect(res.status).toBe(403);
  });

  it("blocks project analytics for a project the user isn't assigned to", async () => {
    const res = await authed(request(app).get(`/api/projects/${isolatedProjectId}/analytics`), foreman.token);
    expect(res.status).toBe(403);
  });

  it("blocks project detail for a project the user isn't assigned to", async () => {
    const res = await authed(request(app).get(`/api/projects/${isolatedProjectId}`), foreman.token);
    expect(res.status).toBe(403);
  });

  it("blocks submitting a report into a project the user isn't assigned to (write-side IDOR)", async () => {
    const res = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId: isolatedProjectId,
      reportDate: "2026-06-01",
      submissionId: `rbac-write-${Date.now()}`,
      workCompleted: "should not be allowed",
    });
    expect(res.status).toBe(403);
  });

  it("blocks downloading an attachment from a report the user can't access", async () => {
    // Real PNG magic bytes as an explicit byte array — Buffer.from(string)
    // would UTF-8-encode 0x89 into two bytes and fail the app's own
    // content-sniffing check on upload.
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(20).fill(0)]);
    const upload = await authed(request(app).post(`/api/reports/${financeReportId}/attachments`), tm.token).attach(
      "photo",
      pngBytes,
      { filename: "secret.png", contentType: "image/png" }
    );
    expect(upload.status).toBe(201);

    const res = await authed(request(app).get(`/api/attachments/${upload.body.id}/file`), foreman.token);
    expect(res.status).toBe(403);
  });

  it("strips client-supplied status/submittedById instead of trusting them (mass assignment)", async () => {
    const projects = await authed(request(app).get("/api/projects"), foreman.token);
    const res = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId: projects.body[0].id,
      reportDate: "2026-06-02",
      submissionId: `rbac-mass-${Date.now()}`,
      workCompleted: "mass assignment probe",
      status: "APPROVED",
      submittedById: tm.userId,
      reviewedById: tm.userId,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.submittedById).toBe(foreman.userId);
  });

  it("lets Management read across projects without a ProjectAssignment row", async () => {
    const res = await authed(request(app).get(`/api/projects/${isolatedProjectId}/analytics`), management.token);
    expect(res.status).toBe(200);
  });

  it("still blocks Management from raising an action (read-only role)", async () => {
    const res = await authed(request(app).post("/api/actions"), management.token).send({
      projectId: isolatedProjectId,
      description: "Management shouldn't be able to do this",
      assignedToId: tm.userId,
      dueDate: "2026-12-31",
    });
    expect(res.status).toBe(403);
  });

  it("blocks Management from saving a report draft — read-only role, no write access to anything", async () => {
    const res = await authed(request(app).put("/api/drafts/QS"), management.token).send({
      projectId: isolatedProjectId,
      reportDate: "2026-06-01",
      data: { comments: "Management should not be able to persist this" },
    });
    expect(res.status).toBe(403);
  });
});
