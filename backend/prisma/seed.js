const bcrypt = require("bcrypt");
const prisma = require("../src/prisma");

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@onetouchelectrical.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Technical Manager account already exists: ${email}`);
    return;
  }

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

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
