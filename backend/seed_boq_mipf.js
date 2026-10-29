// One-time seed: loads MIPF_Solar_BOQ (2).xlsx into Demo Project as Demo QS
// Run with: node backend/seed_boq_mipf.js
const path = require("path");
const XLSX = require(path.join(__dirname, "../frontend/node_modules/xlsx"));
const { PrismaClient } = require(path.join(__dirname, "node_modules/@prisma/client"));

const FILE = path.join(require("os").homedir(), "Desktop/MIPF_Solar_BOQ (2).xlsx");
const PROJECT_ID = "3cfe49cc-c92a-456d-a759-ee736be83f6b"; // Demo Project
const QS_USER_ID = "f0bebc31-961a-4365-bf50-f204ffc124ff"; // Demo QS

const BILL_SHEETS = [
  "Bill1 - Prelims", "Bill2 - Car Park", "Bill3 - Block 1",
  "Bill4 - Block 2", "Bill5 - Block 3", "Bill6 - Container", "Bill7 - Armoured Cables",
];

function mapBoqHeader(h) {
  const s = String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  if (s.match(/^(item|itemno|no|itemnumber|ref|boqitem|boqno)$/) || s.startsWith("item")) return "boqItemNumber";
  if (s.includes("desc") || s.includes("work") || s.includes("activity") || s.includes("scope") || s.includes("detail") || s.includes("name")) return "description";
  if (s.match(/^(unit|uom|measure|units)$/) || s.includes("unit")) return "unit";
  if (s.includes("qty") || s.includes("quantity") || s === "q") return "contractQuantity";
  if (s.includes("rate") || s.includes("price") || s.includes("cost")) return "contractRate";
  return null;
}

function parseSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  let headerRowIdx = -1, headers = [], fieldMap = [];
  for (let r = 0; r < Math.min(15, raw.length); r++) {
    const fm = raw[r].map(mapBoqHeader);
    if (fm.includes("description")) { headerRowIdx = r; headers = raw[r]; fieldMap = fm; break; }
  }
  if (headerRowIdx === -1) return [];
  const parsed = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (row.every(c => String(c).trim() === "")) continue;
    const obj = { boqItemNumber: "", description: "", unit: "", contractQuantity: 0, contractRate: 0 };
    headers.forEach((_, hi) => { if (fieldMap[hi]) obj[fieldMap[hi]] = String(row[hi] ?? ""); });
    if (!obj.description.trim()) continue;
    obj.boqItemNumber = obj.boqItemNumber.trim() || String(parsed.length + 1);
    obj.contractQuantity = parseFloat(obj.contractQuantity) || 0;
    obj.contractRate = parseFloat(obj.contractRate) || 0;
    parsed.push(obj);
  }
  return parsed;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Reading:", FILE);
    const wb = XLSX.readFile(FILE);
    let allRows = [];
    for (const sheet of BILL_SHEETS) {
      if (wb.SheetNames.includes(sheet)) {
        const rows = parseSheet(wb, sheet);
        console.log(`  ${sheet}: ${rows.length} items`);
        allRows = allRows.concat(rows);
      }
    }
    console.log(`\nTotal: ${allRows.length} BOQ items across all bills\n`);

    // Clear and re-seed BOQ template
    await prisma.projectBoqItem.deleteMany({ where: { projectId: PROJECT_ID } });
    for (const row of allRows) {
      await prisma.projectBoqItem.create({
        data: {
          projectId: PROJECT_ID,
          boqItemNumber: row.boqItemNumber,
          description: row.description.trim(),
          unit: row.unit.trim(),
          contractQuantity: row.contractQuantity,
          contractRate: row.contractRate,
        },
      });
    }
    console.log(`Inserted ${allRows.length} BOQ items into project`);

    // Clear and re-seed BOM items (tracked to Demo QS)
    await prisma.bomItem.deleteMany({ where: { projectId: PROJECT_ID } });
    let bomCreated = 0;
    for (const row of allRows) {
      if (!row.description.trim()) continue;
      const count = await prisma.bomItem.count({ where: { projectId: PROJECT_ID } });
      const bom = await prisma.bomItem.create({
        data: {
          projectId: PROJECT_ID,
          name: row.description.trim(),
          unit: row.unit.trim(),
          qtyNeeded: row.contractQuantity,
          qtyOrdered: 0,
          unitPrice: 0,
          budgetUnitPrice: row.contractRate,
          reorderLevel: 0,
          order: count,
          createdById: QS_USER_ID,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: QS_USER_ID,
          action: "BOM_ITEM_ADDED",
          entityType: "BomItem",
          entityId: bom.id,
          metadata: { name: bom.name, unit: bom.unit, projectId: PROJECT_ID, source: "boq_sync" },
        },
      });
      bomCreated++;
    }

    console.log(`Created ${bomCreated} BOM items — all credited to Demo QS`);
    console.log("\nDone! Log in as TM and check the Audit Log.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
