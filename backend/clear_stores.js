const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Delete lines first (child), then details, then reports
  const lines = await prisma.stockTransactionLine.deleteMany({});
  console.log(`Deleted ${lines.count} stores lines`);

  const details = await prisma.storesReportDetail.deleteMany({});
  console.log(`Deleted ${details.count} stores report details`);

  const reports = await prisma.report.deleteMany({ where: { type: "STORES" } });
  console.log(`Deleted ${reports.count} stores reports`);

  console.log("Done — all stores data cleared.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
