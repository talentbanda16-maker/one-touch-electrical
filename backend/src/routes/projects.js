const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireProjectAccess } = require("../middleware/rbac");

const router = express.Router();

const STATUSES = ["PLANNING", "ACTIVE", "DELAYED", "COMPLETED", "CLOSED"];

const createProjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  client: z.string().optional(),
  mainContractor: z.string().optional(),
  location: z.string().optional(),
  contractValue: z.number().nonnegative().optional(),
  approvedBudget: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  plannedEndDate: z.string().datetime().optional(),
});

router.post("/", requireAuth, requireRole(), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  if (data.startDate && data.plannedEndDate && new Date(data.plannedEndDate) < new Date(data.startDate)) {
    return res.status(400).json({ error: "plannedEndDate cannot be before startDate" });
  }

  const project = await prisma.project.create({
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : undefined,
    },
  });

  await recordAudit({ userId: req.user.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id });

  res.status(201).json(project);
});

// Technical Manager sees every project; everyone else sees only
// what they're assigned to, per the brief's "assigned projects" rule.
router.get("/", requireAuth, async (req, res) => {
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    return res.json(projects);
  }

  const projects = await prisma.project.findMany({
    where: { assignments: { some: { userId: req.user.id } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

router.get("/:projectId", requireAuth, requireProjectAccess, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { assignments: { include: { user: { select: { id: true, name: true, role: true } } } } },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

router.patch("/:projectId", requireAuth, requireRole(), async (req, res) => {
  const parsed = createProjectSchema.partial().extend({
    status: z.enum(STATUSES).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const project = await prisma.project.update({
    where: { id: req.params.projectId },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      plannedEndDate: parsed.data.plannedEndDate ? new Date(parsed.data.plannedEndDate) : undefined,
    },
  });

  await recordAudit({ userId: req.user.id, action: "PROJECT_UPDATED", entityType: "Project", entityId: project.id });

  res.json(project);
});

const assignSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"]),
});

router.post("/:projectId/assignments", requireAuth, requireRole(), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, role } = parsed.data;
  const { projectId } = req.params;

  const assignment = await prisma.projectAssignment.create({
    data: { userId, projectId, role },
  });

  await recordAudit({
    userId: req.user.id,
    action: "USER_ASSIGNED_TO_PROJECT",
    entityType: "ProjectAssignment",
    entityId: assignment.id,
    metadata: { userId, projectId, role },
  });

  res.status(201).json(assignment);
});

router.delete("/:projectId/assignments/:assignmentId", requireAuth, requireRole(), async (req, res) => {
  await prisma.projectAssignment.delete({ where: { id: req.params.assignmentId } });
  await recordAudit({
    userId: req.user.id,
    action: "USER_UNASSIGNED_FROM_PROJECT",
    entityType: "ProjectAssignment",
    entityId: req.params.assignmentId,
  });
  res.status(204).send();
});

module.exports = router;
