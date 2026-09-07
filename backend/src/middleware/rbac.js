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
// Technical Manager and Management bypass this check (full access per the
// brief — same rule as the "see every project" branch in GET /projects).
async function requireProjectAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role === "TECHNICAL_MANAGER" || req.user.role === "MANAGEMENT") return next();

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

// Restricts a route to actual project team members: Technical Manager
// bypasses (full access), everyone else — Management included — must
// have a ProjectAssignment. Unlike requireProjectAccess, Management does
// NOT bypass here: Management is read-only (spec table), so this is for
// write actions like "raise an action," where "can see every project"
// must not imply "can act on every project."
async function requireProjectMember(req, res, next) {
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

// Blocks Management specifically, on top of a route that otherwise
// bypasses per-project checks for it (requireProjectAccess) — used on
// the PDF/Excel report-export routes, which Management can view the
// same underlying data for on-screen but must not be able to generate
// or download a file of.
function blockManagement(req, res, next) {
  if (req.user?.role === "MANAGEMENT") {
    return res.status(403).json({ error: "Management cannot export reports" });
  }
  next();
}

module.exports = { requireRole, requireProjectAccess, requireProjectMember, blockManagement };
