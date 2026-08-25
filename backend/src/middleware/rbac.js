const prisma = require("../prisma");

// Restricts a route to specific system roles. Technical Manager
// is treated as full-access unless explicitly excluded by the caller.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    if (req.user.role === "TECHNICAL_MANAGER" || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ error: "Not permitted for this role" });
  };
}

// Restricts a route to users assigned to the :projectId in the route params.
// Technical Manager bypasses this check (full access per the brief).
async function requireProjectAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role === "TECHNICAL_MANAGER") return next();

  const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const assignment = await prisma.projectAssignment.findFirst({
    where: { userId: req.user.id, projectId },
  });

  if (!assignment) {
    return res.status(403).json({ error: "You are not assigned to this project" });
  }

  next();
}

module.exports = { requireRole, requireProjectAccess };
