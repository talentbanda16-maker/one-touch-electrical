const bcrypt = require("bcrypt");
const prisma = require("../src/prisma");

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@onetouchelectrical.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Technical Manager account already exists: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: "Technical Manager",
        passwordHash,
        role: "TECHNICAL_MANAGER",
      },
    });

    console.log(`Created Technical Manager account:`);
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${password}`);
    console.log(`Change this password after first login.`);
  }

  await seedDemoProjectAndForeman();
}

async function seedDemoProjectAndForeman() {
  const projectCode = "DEMO-001";
  let project = await prisma.project.findUnique({ where: { code: projectCode } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: "Demo Project",
        code: projectCode,
        client: "Demo Client",
        location: "Demo Site",
        status: "ACTIVE",
        startDate: new Date(),
      },
    });
    console.log(`Created demo project: ${project.name} (${project.code})`);
  }

  const foremanEmail = "foreman@onetouchelectrical.com";
  const foremanPassword = "ChangeMe123!";
  let foreman = await prisma.user.findUnique({ where: { email: foremanEmail } });
  if (!foreman) {
    const passwordHash = await bcrypt.hash(foremanPassword, 12);
    foreman = await prisma.user.create({
      data: { email: foremanEmail, name: "Demo Foreman", passwordHash, role: "FOREMAN" },
    });
    console.log(`Created demo Foreman account:`);
    console.log(`  email:    ${foreman.email}`);
    console.log(`  password: ${foremanPassword}`);
  }

  const existingAssignment = await prisma.projectAssignment.findFirst({
    where: { userId: foreman.id, projectId: project.id, role: "FOREMAN" },
  });
  if (!existingAssignment) {
    await prisma.projectAssignment.create({
      data: { userId: foreman.id, projectId: project.id, role: "FOREMAN" },
    });
    console.log(`Assigned demo Foreman to ${project.name}`);
  }

  await seedDemoRoleUser(project, "QS", "qs@onetouchelectrical.com", "Demo QS");
  await seedDemoRoleUser(project, "SHE_OFFICER", "she@onetouchelectrical.com", "Demo SHE Officer");
  await seedDemoRoleUser(project, "STORESMAN", "stores@onetouchelectrical.com", "Demo Storesman");
  await seedDemoRoleUser(project, "FINANCE", "finance@onetouchelectrical.com", "Demo Finance");
  await seedDemoRoleUser(project, "GENERAL_WORKER", "worker@onetouchelectrical.com", "Demo General Worker");

  // Management gets no ProjectAssignment — like Technical Manager, it
  // bypasses requireProjectAccess and sees every project (projects.js:52).
  await seedDemoManagementUser();

  await seedSnapshotHistory(project);
}

async function seedDemoManagementUser() {
  const email = "management@onetouchelectrical.com";
  const password = "ChangeMe123!";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name: "Demo Management", passwordHash, role: "MANAGEMENT" },
  });
  console.log(`Created demo Management account:`);
  console.log(`  email:    ${user.email}`);
  console.log(`  password: ${password}`);
}

// Backfills two weeks of ProjectSnapshot rows so the trend-line charts
// in ProjectAnalytics/ProjectsComparison have history to plot instead of
// falling back to the single-point progress bars. A gentle upward ramp
// on progress/spend so the lines are visibly moving, not flat.
async function seedSnapshotHistory(project) {
  const days = 14;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  for (let i = days; i >= 1; i--) {
    const snapshotDate = new Date(todayUtc);
    snapshotDate.setUTCDate(snapshotDate.getUTCDate() - i);

    const ageFraction = (days - i) / days;
    const actualProgress = Math.round(20 + ageFraction * 25);
    const plannedProgress = Math.round(30 + ageFraction * 32);
    const totalFundsReceived = 500000;
    const totalExpenditure = Math.round(60000 + ageFraction * 60000);
    const fundUtilisationPercent = Math.round((totalExpenditure / 1000000) * 100);

    await prisma.projectSnapshot.upsert({
      where: { projectId_snapshotDate: { projectId: project.id, snapshotDate } },
      create: {
        projectId: project.id,
        snapshotDate,
        actualProgress,
        plannedProgress,
        fundUtilisationPercent,
        totalFundsReceived,
        totalExpenditure,
      },
      update: {},
    });
  }
  console.log(`Backfilled ${days} days of snapshot history for ${project.name}`);
}

async function seedDemoRoleUser(project, role, email, name) {
  const password = "ChangeMe123!";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({ data: { email, name, passwordHash, role } });
    console.log(`Created demo ${role} account:`);
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${password}`);
  }

  const existingAssignment = await prisma.projectAssignment.findFirst({
    where: { userId: user.id, projectId: project.id, role },
  });
  if (!existingAssignment) {
    await prisma.projectAssignment.create({ data: { userId: user.id, projectId: project.id, role } });
    console.log(`Assigned demo ${role} to ${project.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
