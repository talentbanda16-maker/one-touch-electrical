const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.projectBoqItem
  .deleteMany({ where: { projectId: "2f6192e1-65a8-4782-ba2e-97e0ae5fec19" } })
  .then((r) => console.log("Deleted:", r.count, "BOQ items"))
  .catch((e) => console.error(e))
  .finally(() => p.$disconnect());
