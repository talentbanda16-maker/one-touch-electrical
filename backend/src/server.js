require("dotenv").config();
const express = require("express");
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

const app = express();

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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`One Touch backend listening on port ${port}`);
});
