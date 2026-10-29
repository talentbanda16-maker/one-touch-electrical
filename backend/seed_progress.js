const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROJECT_ID  = '3cfe49cc-c92a-456d-a759-ee736be83f6b'; // Demo Project
const PROJECT_ID2 = '2f6192e1-65a8-4782-ba2e-97e0ae5fec19'; // TALENT

const R = {
  EARTHING:           'd9cdb0f0-6144-4f65-82ac-ab764851631a',
  EXT_RETIC:          'aac6276b-aea2-4c36-9f48-294132960e59',
  SLAB_TUBING:        'c6259f24-a1b5-45a0-bbf5-b35dbb9cc15a',
  WALL_TUBING_GF:     '86e10eae-319a-475b-8bcc-9ae8bdcdc3a6',
  DECK_TUBING:        '8289c136-1a60-4cdc-99dc-f73be543226f',
  WALL_TUBING_FF:     '46a83ad1-1645-4f8d-91e7-e53de2ef9149',
  WIRING_SOC_GF:      '432121b1-4182-45f2-9c2d-1262fd0ed2c0',
  WIRING_LIT_GF:      '8c541afe-3687-459e-b290-61f15eb680cd',
  WIRING_SOC_FF:      'ef8bbcc5-a3c1-4e51-bc3a-1a29f5908ce1',
  WIRING_LIT_FF:      'a1ce3657-afee-4119-b07b-5612d5fd8535',
  DB_GF:              '9c0280a8-683e-483f-a5a3-aab9fd219a83',
  DB_FF:              '09079d09-d331-4beb-b511-3555648cc67a',
  FITTINGS_GF:        '2e2f927f-ffda-4a85-a541-d660004c709b',
  FITTINGS_FF:        'c70d8519-e0dd-4a69-8f93-29546298e61b',
};

// [rowId, date, targetPct, actualPct]  — 4 days: Oct 10–13
const DATA = [

  // ── EARTHING ───────────────────────────────────────────────────────
  [R.EARTHING,       '2026-10-10', 50,  48],
  [R.EARTHING,       '2026-10-11', 65,  62],
  [R.EARTHING,       '2026-10-12', 80,  78],
  [R.EARTHING,       '2026-10-13', 95,  90],

  // ── External RETICULATING ──────────────────────────────────────────
  [R.EXT_RETIC,      '2026-10-10', 20,  18],
  [R.EXT_RETIC,      '2026-10-11', 35,  30],
  [R.EXT_RETIC,      '2026-10-12', 45,  42],
  [R.EXT_RETIC,      '2026-10-13', 55,  50],

  // ── SLAB TUBING GF ────────────────────────────────────────────────
  [R.SLAB_TUBING,    '2026-10-10', 25,  15],
  [R.SLAB_TUBING,    '2026-10-11', 40,  25],
  [R.SLAB_TUBING,    '2026-10-12', 55,  35],
  [R.SLAB_TUBING,    '2026-10-13', 65,  42],

  // ── Wall Cutting / Tubing GF ──────────────────────────────────────
  [R.WALL_TUBING_GF, '2026-10-10', 15,  12],
  [R.WALL_TUBING_GF, '2026-10-11', 28,  25],
  [R.WALL_TUBING_GF, '2026-10-12', 40,  36],
  [R.WALL_TUBING_GF, '2026-10-13', 52,  48],

  // ── Deck Tubing ───────────────────────────────────────────────────
  [R.DECK_TUBING,    '2026-10-10', 10,  10],
  [R.DECK_TUBING,    '2026-10-11', 20,  18],
  [R.DECK_TUBING,    '2026-10-12', 30,  28],
  [R.DECK_TUBING,    '2026-10-13', 40,  38],

  // ── Wall Cutting / Tubing FF ──────────────────────────────────────
  [R.WALL_TUBING_FF, '2026-10-10',  5,   3],
  [R.WALL_TUBING_FF, '2026-10-11', 12,   8],
  [R.WALL_TUBING_FF, '2026-10-12', 20,  12],
  [R.WALL_TUBING_FF, '2026-10-13', 30,  16],

  // ── Wiring (Sockets) GF ───────────────────────────────────────────
  [R.WIRING_SOC_GF,  '2026-10-11',  5,   3],
  [R.WIRING_SOC_GF,  '2026-10-12', 12,   8],
  [R.WIRING_SOC_GF,  '2026-10-13', 20,  12],

  // ── Wiring (Lighting) GF ──────────────────────────────────────────
  [R.WIRING_LIT_GF,  '2026-10-11',  5,   4],
  [R.WIRING_LIT_GF,  '2026-10-12', 12,  10],
  [R.WIRING_LIT_GF,  '2026-10-13', 20,  17],

  // ── Wiring (Sockets) FF ───────────────────────────────────────────
  [R.WIRING_SOC_FF,  '2026-10-12',  5,   3],
  [R.WIRING_SOC_FF,  '2026-10-13', 10,   8],

  // ── Wiring (Lighting) FF ──────────────────────────────────────────
  [R.WIRING_LIT_FF,  '2026-10-12',  5,   3],
  [R.WIRING_LIT_FF,  '2026-10-13', 10,   8],

  // ── DB Dressing GF ────────────────────────────────────────────────
  [R.DB_GF,          '2026-10-12',  3,   1],
  [R.DB_GF,          '2026-10-13',  8,   3],

  // ── DB Dressing FF ────────────────────────────────────────────────
  [R.DB_FF,          '2026-10-12',  3,   0],
  [R.DB_FF,          '2026-10-13',  8,   2],

  // ── Fittings GF ───────────────────────────────────────────────────
  [R.FITTINGS_GF,    '2026-10-12',  3,   2],
  [R.FITTINGS_GF,    '2026-10-13',  5,   4],

  // ── Fittings FF ───────────────────────────────────────────────────
  [R.FITTINGS_FF,    '2026-10-12',  3,   2],
  [R.FITTINGS_FF,    '2026-10-13',  5,   4],
];

async function seedProject(projectId) {
  await prisma.progressLog.deleteMany({ where: { projectId } });
  for (const [rowId, dateStr, targetPct, percentage] of DATA) {
    await prisma.progressLog.create({
      data: { rowId, projectId, date: new Date(dateStr), targetPct, percentage },
    });
  }
  console.log(`Seeded ${DATA.length} entries for project ${projectId}`);
}

async function main() {
  await seedProject(PROJECT_ID);
  await seedProject(PROJECT_ID2);
  await prisma.$disconnect();
}

main().catch(console.error);
