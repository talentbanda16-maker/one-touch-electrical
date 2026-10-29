const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.bomItem.findMany({
    where: { projectId: '3cfe49cc-c92a-456d-a759-ee736be83f6b' },
    select: { name: true, qtyOrdered: true, unitPrice: true }
  });
  console.log('Procurement items:', JSON.stringify(items, null, 2));
  const total = items.reduce((s, i) => s + (Number(i.qtyOrdered) * Number(i.unitPrice)), 0);
  console.log('Total procurement cost:', total);
  await prisma.$disconnect();
}
main().catch(console.error);
