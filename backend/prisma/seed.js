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
