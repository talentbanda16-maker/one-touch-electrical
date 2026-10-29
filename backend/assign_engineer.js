const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const engineers = await p.user.findMany({ where: { role: 'ENGINEER', isActive: true }, select: { id: true, email: true } });
  const projects = await p.project.findMany({ select: { id: true, name: true } });

  for (const eng of engineers) {
    for (const proj of projects) {
      await p.projectAssignment.upsert({
        where: { userId_projectId_role: { userId: eng.id, projectId: proj.id, role: 'ENGINEER' } },
        update: {},
        create: { userId: eng.id, projectId: proj.id, role: 'ENGINEER' },
      });
      console.log(`Assigned ${eng.email} to ${proj.name}`);
    }
  }
  console.log('Done.');
}

main().finally(() => p.$disconnect());
