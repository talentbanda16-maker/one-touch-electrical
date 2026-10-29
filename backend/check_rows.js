const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.progressRow.findMany({ orderBy: { order: 'asc' } });
  console.log('Total rows:', rows.length);
  rows.forEach(r => console.log(r.id, '|', r.label));

  const projects = await prisma.project.findMany({ select: { id: true, name: true, code: true } });
  console.log('\nProjects:');
  projects.forEach(p => console.log(p.id, '|', p.name, '|', p.code));

  const logCount = await prisma.progressLog.count();
  console.log('\nTotal progress logs:', logCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
