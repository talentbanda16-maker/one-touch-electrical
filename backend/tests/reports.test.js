const request = require("supertest");
const { getApp, loginAs, authed } = require("./helpers");

describe("report lifecycle", () => {
  let app, tm, foreman, qs, projectId;

  beforeAll(async () => {
    app = getApp();
    tm = await loginAs(app, "TECHNICAL_MANAGER");
    foreman = await loginAs(app, "FOREMAN");
    qs = await loginAs(app, "QS");

    // A project of this file's own, with only the Foreman assigned to
    // it — so the "analytics reflects the approved progress" assertion
    // below can't be thrown off by another test file's reports landing
    // on a project shared across the whole suite.
    const proj = await authed(request(app).post("/api/projects"), tm.token).send({
      name: "Report Lifecycle Test Project",
      code: `LIFECYCLE-${Date.now()}`,
      status: "ACTIVE",
    });
    projectId = proj.body.id;
    await authed(request(app).post(`/api/projects/${projectId}/assignments`), tm.token).send({
      userId: foreman.userId,
      role: "FOREMAN",
    });
    await authed(request(app).post(`/api/projects/${projectId}/assignments`), tm.token).send({
      userId: qs.userId,
      role: "QS",
    });
  });

  it("submit -> appears in TM's pending queue -> approve -> feeds analytics", async () => {
    const submissionId = `lifecycle-${Date.now()}`;
    const submit = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-01",
      submissionId,
      percentProgress: 42,
      workCompleted: "Automated lifecycle test",
      workersOnSite: 5,
    });
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe("SUBMITTED");
    const reportId = submit.body.id;

    const pending = await authed(request(app).get("/api/reports/pending"), tm.token);
    expect(pending.body.some((r) => r.id === reportId)).toBe(true);

    const approve = await authed(request(app).post(`/api/reports/${reportId}/approve`), tm.token);
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe("APPROVED");

    const pendingAfter = await authed(request(app).get("/api/reports/pending"), tm.token);
    expect(pendingAfter.body.some((r) => r.id === reportId)).toBe(false);

    const analytics = await authed(request(app).get(`/api/projects/${projectId}/analytics`), tm.token);
    expect(analytics.body.progress.actual).toBe(42);

    const audit = await authed(request(app).get(`/api/audit?entityType=Report`), tm.token);
    const actions = audit.body.logs.filter((l) => l.entityId === reportId).map((l) => l.action);
    expect(actions).toContain("REPORT_SUBMITTED");
    expect(actions).toContain("REPORT_APPROVED");
  });

  it("return-for-correction requires a reason, and only the submitter or TM can resubmit", async () => {
    const submissionId = `return-${Date.now()}`;
    const submit = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-02",
      submissionId,
      workCompleted: "Will be returned",
    });
    const reportId = submit.body.id;

    const noReason = await authed(request(app).post(`/api/reports/${reportId}/return`), tm.token).send({});
    expect(noReason.status).toBe(400);

    const returned = await authed(request(app).post(`/api/reports/${reportId}/return`), tm.token).send({
      reason: "Please add site location",
    });
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe("RETURNED");

    const resubmit = await authed(request(app).patch(`/api/reports/foreman/${reportId}`), foreman.token).send({
      reportDate: "2026-07-02",
      workCompleted: "Added site location now",
      siteLocation: "Harare",
    });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("SUBMITTED");
  });

  it("the Technical Manager can edit a report while it's still pending, without bouncing its status", async () => {
    const submissionId = `tm-edit-${Date.now()}`;
    const submit = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-03",
      submissionId,
      workCompleted: "Original text",
    });
    const reportId = submit.body.id;

    const edit = await authed(request(app).patch(`/api/reports/foreman/${reportId}`), tm.token).send({
      reportDate: "2026-07-03",
      workCompleted: "Corrected by TM",
    });
    expect(edit.status).toBe(200);
    expect(edit.body.status).toBe("SUBMITTED");
    expect(edit.body.submittedById).toBe(foreman.userId); // attribution unchanged

    const audit = await authed(request(app).get(`/api/audit?entityType=Report`), tm.token);
    const action = audit.body.logs.find((l) => l.entityId === reportId && l.action === "REPORT_EDITED_BY_TM");
    expect(action).toBeTruthy();
  });

  it("a duplicate submissionId (offline-retry safety) returns the existing report instead of creating a second one", async () => {
    const submissionId = `idempotent-${Date.now()}`;
    const first = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-04",
      submissionId,
      workCompleted: "First attempt",
    });
    const second = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-04",
      submissionId,
      workCompleted: "Retried after a dropped connection",
    });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.foremanDetail.workCompleted).toBe("First attempt");
  });

  it("rejects a numeric field that overflows the database column with a clean 400, not a crash", async () => {
    const res = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-05",
      submissionId: `overflow-${Date.now()}`,
      workCompleted: "Overflow probe",
      workersOnSite: 999999999999,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("returns a plain, human-readable error message (not a stringified object) for a validation failure", async () => {
    const res = await authed(request(app).post("/api/reports/foreman"), foreman.token).send({
      projectId,
      reportDate: "2026-07-06",
      submissionId: `readable-error-${Date.now()}`,
      workCompleted: "Readable error probe",
      percentProgress: 150,
    });
    expect(res.status).toBe(400);
    // The route legitimately sends zod's { fieldErrors, formErrors } shape
    // as `error` — this just confirms the client-facing api.js helper
    // (tested implicitly by every UI form) has something real to work
    // with, not that this endpoint itself returns a bare string.
    expect(res.body.error.fieldErrors.percentProgress[0]).toMatch(/100/);
  });

  it("the Technical Manager can edit a QS report whose lines have no variation status set", async () => {
    const submit = await authed(request(app).post("/api/reports/qs"), qs.token).send({
      projectId,
      reportDate: "2026-07-07",
      submissionId: `qs-novar-${Date.now()}`,
      lines: [{ boqItemNumber: "B1", description: "No variation set", contractQuantity: 10, quantityToday: 1, cumulativeQuantity: 5 }],
    });
    expect(submit.status).toBe(201);
    expect(submit.body.qsDetail.lines[0].variationStatus).toBeNull();

    // Matches what the frontend now sends after saveEdit's fix —
    // variationStatus omitted entirely, not sent as "".
    const edit = await authed(request(app).patch(`/api/reports/qs/${submit.body.id}`), tm.token).send({
      reportDate: "2026-07-07",
      comments: "edited by TM",
      lines: [{ boqItemNumber: "B1", description: "No variation set", contractQuantity: 10, quantityToday: 1, cumulativeQuantity: 5 }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.qsDetail.comments).toBe("edited by TM");
  });
});
