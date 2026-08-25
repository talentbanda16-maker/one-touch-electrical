const prisma = require("./prisma");

async function recordAudit({ userId = null, action, entityType, entityId = null, metadata = null }) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId, metadata },
  });
}

module.exports = { recordAudit };
