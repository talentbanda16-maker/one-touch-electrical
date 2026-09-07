const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { generateSystemNotifications } = require("../lib/notifications");

const router = express.Router();

// Best-effort refresh of the time-based notifications (not-submitted-today,
// due-soon, overdue, behind-plan, fund-threshold) — whoever happens to
// open their notifications first re-runs the scan for everyone, same
// "opportunistic, no real cron yet" pattern as ensureTodaySnapshots.
router.get("/", requireAuth, async (req, res) => {
  generateSystemNotifications().catch((err) => console.error("Notification scan failed:", err));

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });

  res.json({ notifications, unreadCount });
});

router.post("/:id/read", requireAuth, async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user.id) {
    return res.status(404).json({ error: "Notification not found" });
  }
  await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  res.status(204).send();
});

router.post("/mark-all-read", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
  res.status(204).send();
});

module.exports = router;
