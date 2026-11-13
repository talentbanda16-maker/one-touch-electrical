const prisma = require("./prisma");

async function recordAudit({ userId = null, action, entityType, entityId = null, metadata = null }) {
  // An audit-log write must never break the user action it is recording.
  // The DB is remote (over Tailscale), so a transient pool/connection
  // timeout here should be logged and swallowed, not bubbled to the user.
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, metadata },
    });
  } catch (err) {
    console.error("recordAudit failed (non-fatal):", err?.message || err);
  }
}

module.exports = { recordAudit };
