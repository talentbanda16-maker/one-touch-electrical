const prisma = require("../prisma");

// Generate sequential reference numbers like REQ/2026/0001.
// Counts existing records for the year to determine the next number.
// For a small concurrent team this is safe; a high-throughput system
// would need a DB sequence, but that's overkill here.
async function generateRefNumber(type) {
  const year = new Date().getFullYear();
  let prefix, count;

  if (type === "requisition") {
    prefix = "REQ";
    count = await prisma.materialRequisition.count({
      where: { refNumber: { startsWith: `REQ/${year}/` } },
    });
  } else if (type === "action") {
    prefix = "ACT";
    count = await prisma.action.count({
      where: { refNumber: { startsWith: `ACT/${year}/` } },
    });
  } else {
    prefix = type.toUpperCase().slice(0, 3);
    count = 0;
  }

  return `${prefix}/${year}/${String(count + 1).padStart(4, "0")}`;
}

module.exports = { generateRefNumber };
