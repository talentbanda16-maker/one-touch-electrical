const express = require("express");
const { z } = require("zod");
const prisma = require("../prisma");
const { recordAudit } = require("../audit");
const { requireAuth } = require("../middleware/auth");
const { requireProjectAccess, requireProjectMember } = require("../middleware/rbac");
const { notifyManagers } = require("../lib/notifications");

const router = express.Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const createSchema = z.object({
  itemName: z.string().min(1),
  quantityRequested: z.number().positive(),
  unit: z.string().optional(),
  urgency: z.enum(PRIORITIES).default("MEDIUM"),
  notes: z.string().optional(),
});

// A real request/fulfil workflow (spec Section 9's "material requisitions")
// — distinct from the free-text "shortages and urgent requirements" note
// on a Stores report. Any project team member can raise one (or the
// Technical Manager); Management is excluded, same as raising an Action.
router.post("/projects/:projectId/requisitions", requireAuth, requireProjectMember, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requisition = await prisma.materialRequisition.create({
    data: {
      projectId: req.params.projectId,
      requestedById: req.user.id,
      ...parsed.data,
    },
    include: { requestedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    userId: req.user.id,
    action: "REQUISITION_CREATED",
    entityType: "MaterialRequisition",
    entityId: requisition.id,
    metadata: { projectId: req.params.projectId, itemName: requisition.itemName },
  });

  await notifyManagers({
    type: "REQUISITION_SUBMITTED",
    title: "Material requisition submitted",
    message: `${requisition.itemName} — ${requisition.quantityRequested}${requisition.unit ? " " + requisition.unit : ""} requested (${requisition.urgency.toLowerCase()} urgency).`,
    projectId: req.params.projectId,
    link: "/analytics/stores",
    dedupeKey: `REQUISITION_SUBMITTED:${requisition.id}`,
  });

  res.status(201).json(requisition);
});

router.get("/projects/:projectId/requisitions", requireAuth, requireProjectAccess, async (req, res) => {
  const requisitions = await prisma.materialRequisition.findMany({
    where: { projectId: req.params.projectId },
    include: {
      requestedBy: { select: { id: true, name: true } },
      fulfilledBy: { select: { id: true, name: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
  res.json(requisitions);
});

const statusSchema = z.object({
  status: z.enum(["FULFILLED", "CANCELLED"]),
  fulfillmentNotes: z.string().optional(),
});

// Fulfilling/cancelling is restricted to the Storesman (who actually
// handles stock) or the Technical Manager — not just any assigned
// project member, since this is a stock-keeping decision, not a general
// project update.
router.patch("/requisitions/:id/status", requireAuth, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requisition = await prisma.materialRequisition.findUnique({ where: { id: req.params.id } });
  if (!requisition) return res.status(404).json({ error: "Requisition not found" });
  if (requisition.status !== "PENDING") {
    return res.status(409).json({ error: "This requisition has already been resolved" });
  }

  if (req.user.role !== "TECHNICAL_MANAGER") {
    if (req.user.role !== "STORESMAN") {
      return res.status(403).json({ error: "Only the Storesman or Technical Manager can resolve a requisition" });
    }
    const assignment = await prisma.projectAssignment.findFirst({
      where: { userId: req.user.id, projectId: requisition.projectId, role: "STORESMAN" },
    });
    if (!assignment) {
      return res.status(403).json({ error: "You are not the Storesman for this project" });
    }
  }

  const updated = await prisma.materialRequisition.update({
    where: { id: requisition.id },
    data: {
      status: parsed.data.status,
      fulfillmentNotes: parsed.data.fulfillmentNotes,
      fulfilledById: req.user.id,
      fulfilledAt: new Date(),
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      fulfilledBy: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "REQUISITION_RESOLVED",
    entityType: "MaterialRequisition",
    entityId: requisition.id,
    metadata: { status: parsed.data.status },
  });

  res.json(updated);
});

module.exports = router;
