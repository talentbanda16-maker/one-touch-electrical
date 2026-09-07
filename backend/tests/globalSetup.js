const path = require("path");
const { execSync } = require("child_process");

// Vitest's globalSetup runs once, in its own process, before any test
// file — it doesn't share require-cache/module state with the tests
// themselves, so environment loading and Prisma client creation happen
// fresh here rather than reusing anything from setupEnv.js.
require("dotenv").config({ path: path.join(__dirname, "..", ".env.test") });

module.exports = async function setup() {
  // Idempotent and fast when there's nothing pending — safe to run on
  // every suite run rather than requiring a manual migration step.
  execSync("npx prisma migrate deploy", { cwd: path.join(__dirname, ".."), stdio: "inherit" });

  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcrypt");
  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash("TestPass123!", 4); // low cost — speed, not security, in tests

  const roles = [
    { email: "test-tm@onetouch.test", name: "Test TM", role: "TECHNICAL_MANAGER" },
    { email: "test-foreman@onetouch.test", name: "Test Foreman", role: "FOREMAN" },
    { email: "test-qs@onetouch.test", name: "Test QS", role: "QS" },
    { email: "test-she@onetouch.test", name: "Test SHE", role: "SHE_OFFICER" },
    { email: "test-stores@onetouch.test", name: "Test Stores", role: "STORESMAN" },
    { email: "test-finance@onetouch.test", name: "Test Finance", role: "FINANCE" },
    { email: "test-management@onetouch.test", name: "Test Management", role: "MANAGEMENT" },
  ];

  const users = {};
  for (const r of roles) {
    users[r.role] = await prisma.user.upsert({
      where: { email: r.email },
      update: { passwordHash, isActive: true },
      create: { email: r.email, name: r.name, role: r.role, passwordHash },
    });
  }

  const project = await prisma.project.upsert({
    where: { code: "TEST-BASE" },
    update: { status: "ACTIVE" },
    create: {
      name: "Baseline Test Project",
      code: "TEST-BASE",
      status: "ACTIVE",
      approvedBudget: 1000000,
      startDate: new Date("2026-01-01"),
      plannedEndDate: new Date("2026-12-31"),
    },
  });

  for (const role of ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"]) {
    const existing = await prisma.projectAssignment.findFirst({
      where: { userId: users[role].id, projectId: project.id },
    });
    if (!existing) {
      await prisma.projectAssignment.create({ data: { userId: users[role].id, projectId: project.id, role } });
    }
  }

  await prisma.$disconnect();
};
