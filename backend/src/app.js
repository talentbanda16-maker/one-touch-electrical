require("dotenv").config();
// Must load before any route file — it patches express.Router so a
// rejected promise inside an async handler reaches the error middleware
// below instead of becoming an unhandled rejection that crashes the
// whole process (Express 4 doesn't catch async errors on its own).
require("express-async-errors");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const projectRoutes = require("./routes/projects");
const reportRoutes = require("./routes/reports");
const attachmentRoutes = require("./routes/attachments");
const approvalRoutes = require("./routes/approvals");
const instructionRoutes = require("./routes/instructions");
const actionRoutes = require("./routes/actions");
const dashboardRoutes = require("./routes/dashboard");
const requisitionRoutes = require("./routes/requisitions");
const notificationRoutes = require("./routes/notifications");
const draftRoutes = require("./routes/drafts");
const auditRoutes = require("./routes/audit");
const productivityRoutes = require("./routes/productivity");

const app = express();

// In the docker-compose deployment the backend only ever receives
// traffic from the nginx container (its port isn't published to the
// host — see docker-compose.yml), so trusting exactly one proxy hop is
// safe and lets req.ip (used by the login rate limiter) reflect the
// real client IP from X-Forwarded-For instead of nginx's own address.
// Without this, every user behind the proxy shares one rate-limit
// bucket — one person mistyping their password five times would lock
// out everyone else's login attempts too.
app.set("trust proxy", 1);

// contentSecurityPolicy off: this server only ever returns JSON or a
// file download, never HTML, so a CSP tuned for script/style sources is
// meaningless here and would need per-route tuning to avoid false
// positives. crossOriginResourcePolicy off: the frontend (a different
// origin in dev, proxied to look same-origin in prod) loads attachment
// images/PDFs directly via <img>/download links — the default
// same-origin policy would block that in dev.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api", attachmentRoutes);
app.use("/api", approvalRoutes);
app.use("/api/instructions", instructionRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", requisitionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/productivity-reports", productivityRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  // Prisma unique-constraint violation (e.g. a duplicate project code) —
  // a foreseeable client mistake, not a server fault, so it gets a 409
  // with a real message instead of a bare 500.
  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "value";
    return res.status(409).json({ error: `That ${field} is already in use.` });
  }
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
