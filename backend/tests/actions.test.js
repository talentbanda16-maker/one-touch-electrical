const request = require("supertest");
const { getApp, loginAs, authed } = require("./helpers");

describe("actions: workers can only raise to the Technical Manager", () => {
  let app, tm, foreman, qs, projectId;

  beforeAll(async () => {
    app = getApp();
    tm = await loginAs(app, "TECHNICAL_MANAGER");
    foreman = await loginAs(app, "FOREMAN");
    qs = await loginAs(app, "QS");
    const projects = await authed(request(app).get("/api/projects"), foreman.token);
    projectId = projects.body.find((p) => p.code === "TEST-BASE").id;
  });

  it("blocks a worker from assigning an action to another worker", async () => {
    const res = await authed(request(app).post("/api/actions"), foreman.token).send({
      projectId,
      description: "Foreman trying to task QS directly",
      assignedToId: qs.userId,
      dueDate: "2026-12-31",
    });
    expect(res.status).toBe(400);
  });

  it("lets a worker raise an action assigned to the Technical Manager", async () => {
    const res = await authed(request(app).post("/api/actions"), foreman.token).send({
      projectId,
      description: "Foreman flagging an issue to the TM",
      assignedToId: tm.userId,
      dueDate: "2026-12-31",
    });
    expect(res.status).toBe(201);
    expect(res.body.assignedTo.id).toBe(tm.userId);
  });

  it("still lets the Technical Manager assign an action to any worker", async () => {
    const res = await authed(request(app).post("/api/actions"), tm.token).send({
      projectId,
      description: "TM delegating to QS",
      assignedToId: qs.userId,
      dueDate: "2026-12-31",
    });
    expect(res.status).toBe(201);
    expect(res.body.assignedTo.id).toBe(qs.userId);
  });

  it("exposes the Technical Manager list to any authenticated user (so the picker can populate)", async () => {
    const res = await authed(request(app).get("/api/users/technical-managers"), foreman.token);
    expect(res.status).toBe(200);
    expect(res.body.some((u) => u.id === tm.userId)).toBe(true);
  });
});
