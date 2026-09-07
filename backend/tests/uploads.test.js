const request = require("supertest");
const { getApp, loginAs, authed } = require("./helpers");

describe("attachment content validation", () => {
  let app, foreman, reportId;

  beforeAll(async () => {
    app = getApp();
    foreman = await loginAs(app, "FOREMAN");
    const projects = await authed(request(app).get("/api/projects"), foreman.token);
    const projectId = projects.body.find((p) => p.code === "TEST-BASE").id;
    const submit = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-08-01",
      submissionId: `upload-test-${Date.now()}`,
      workCompleted: "For attachment tests",
    });
    reportId = submit.body.id;
  });

  it("rejects a file whose real content doesn't match its declared Content-Type", async () => {
    const htmlDisguisedAsPng = Buffer.from("<html><script>alert(1)</script></html>");
    const res = await authed(request(app).post(`/api/reports/${reportId}/attachments`), foreman.token).attach(
      "photo",
      htmlDisguisedAsPng,
      { filename: "evil.png", contentType: "image/png" }
    );
    expect(res.status).toBe(400);
  });

  it("accepts a real PNG declared as image/png", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(20).fill(0)]);
    const res = await authed(request(app).post(`/api/reports/${reportId}/attachments`), foreman.token).attach(
      "photo",
      pngBytes,
      { filename: "real.png", contentType: "image/png" }
    );
    expect(res.status).toBe(201);
  });

  it("rejects a disallowed file type outright, before content is even checked", async () => {
    const res = await authed(request(app).post(`/api/reports/${reportId}/attachments`), foreman.token).attach(
      "photo",
      Buffer.from("#!/bin/sh\necho hi"),
      { filename: "script.sh", contentType: "application/x-sh" }
    );
    expect(res.status).toBe(400);
  });
});
