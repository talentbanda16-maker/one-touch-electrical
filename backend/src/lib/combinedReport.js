const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const prisma = require("../prisma");
const { computeProjectAnalytics } = require("./analytics");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 8;

const CATEGORY_LABELS = {
  ADVANCE_PAYMENT: "Advance payment",
  OTHER_FUNDS: "Other funds",
  MATERIALS: "Materials",
  LABOUR: "Labour",
  PLANT_EQUIPMENT: "Plant/equipment",
  TRANSPORT_LOGISTICS: "Transport/logistics",
  SUBCONTRACTOR: "Subcontractor",
  SUPPLIER: "Supplier",
  PETTY_CASH: "Petty cash",
  OTHER: "Other",
};

const STATUS_LABELS = {
  ON_PROGRAMME: "On programme",
  MINOR_DELAY: "Minor delay",
  CRITICAL_DELAY: "Critical delay",
  UNKNOWN: "Not enough data",
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(n) {
  if (n == null) return "";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n));
}

// Pulls every APPROVED report of each type for the project within
// [from, to] plus its type-specific detail, the current analytics
// summary, instructions issued in the period, currently outstanding
// actions, and a handful of site photos from the period's reports.
// Only APPROVED reports go in — a combined report built from unreviewed
// submissions isn't something to hand to Management.
async function gatherCombinedReportData(project, from, to, recommendations, preparedByName, mainContractorOverride, reportDate) {
  const where = {
    projectId: project.id,
    status: "APPROVED",
    reportDate: { gte: from, lte: to },
  };

  const [foreman, qs, she, stores, finance, analytics, instructions, outstandingActions, snapshots] = await Promise.all([
    prisma.report.findMany({
      where: { ...where, type: "FOREMAN" },
      include: { foremanDetail: true, submittedBy: { select: { name: true } }, attachments: true },
      orderBy: { reportDate: "asc" },
    }),
    prisma.report.findMany({
      where: { ...where, type: "QS" },
      include: { qsDetail: { include: { lines: true } }, submittedBy: { select: { name: true } }, attachments: true },
      orderBy: { reportDate: "asc" },
    }),
    prisma.report.findMany({
      where: { ...where, type: "SHE" },
      include: { sheDetail: true, submittedBy: { select: { name: true } }, attachments: true },
      orderBy: { reportDate: "asc" },
    }),
    prisma.report.findMany({
      where: { ...where, type: "STORES" },
      include: { storesDetail: { include: { lines: true } }, submittedBy: { select: { name: true } }, attachments: true },
      orderBy: { reportDate: "asc" },
    }),
    prisma.report.findMany({
      where: { ...where, type: "FINANCE" },
      include: { financeDetail: { include: { lines: true } }, submittedBy: { select: { name: true } }, attachments: true },
      orderBy: { reportDate: "asc" },
    }),
    computeProjectAnalytics(project),
    prisma.instruction.findMany({
      where: { projectId: project.id, dateIssued: { gte: from, lte: to } },
      include: { personResponsible: { select: { name: true } }, issuedBy: { select: { name: true } } },
      orderBy: { dateIssued: "asc" },
    }),
    prisma.action.findMany({
      where: { projectId: project.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { assignedTo: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    // Daily snapshots in the period — the same series the on-screen
    // Planned vs Actual chart uses, so the PDF's embedded graph matches
    // the dashboard exactly instead of just repeating today's numbers.
    prisma.projectSnapshot.findMany({
      where: { projectId: project.id, snapshotDate: { gte: from, lte: to } },
      orderBy: { snapshotDate: "asc" },
    }),
  ]);

  const photos = [...foreman, ...qs, ...she, ...stores, ...finance]
    .flatMap((r) => r.attachments.filter((a) => IMAGE_MIME_TYPES.includes(a.mimeType)).map((a) => ({ ...a, reportType: r.type, reportDate: r.reportDate })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_PHOTOS);

  const now = new Date();
  const outstandingWithOverdue = outstandingActions.map((a) => ({ ...a, isOverdue: new Date(a.dueDate) < now }));

  return {
    project,
    from,
    to,
    mainContractor: mainContractorOverride || project.mainContractor || null,
    reportDate: reportDate || new Date(),
    analytics,
    foreman,
    qs,
    she,
    stores,
    finance,
    instructions,
    outstandingActions: outstandingWithOverdue,
    photos,
    progressTrend: snapshots.map((s) => ({
      date: s.snapshotDate,
      actual: s.actualProgress,
      planned: s.plannedProgress,
    })),
    recommendations: recommendations || null,
    preparedByName: preparedByName || null,
  };
}

// ---------- PDF: One Touch letterhead template ----------
// Mirrors the company's actual "Weekly Electrical Progress Report" Word
// template (letterhead banner, project info block, numbered sections,
// bordered tables, final progress table + signature block) — adapted to
// pull from every department's approved data instead of one contractor's
// manual entries, and there's no "Phase 1/Phase 2" split since the data
// model has no notion of construction phases; everything lands in one
// continuous numbered sequence per project.

const NAVY = "#0f1f3d";

// The company's real letterhead image (logo, banner, contact details,
// gold divider, address — all baked into one graphic) — swapped in for
// the earlier hand-drawn approximation of the same banner so the report
// matches it exactly instead of just resembling it.
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "3.jpeg");
const LOGO_ASPECT = 198 / 796; // real pixel dimensions of assets/3.jpeg

function letterheadHeader(doc, data) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const innerWidth = pageWidth - margin * 2;

  let headerBottom = 40;
  if (fs.existsSync(LOGO_PATH)) {
    const logoHeight = innerWidth * LOGO_ASPECT;
    doc.image(LOGO_PATH, margin, 40, { width: innerWidth });
    headerBottom = 40 + logoHeight;
  }

  doc.x = margin;
  doc.y = headerBottom + 12;

  doc.fontSize(14).fillColor(NAVY).font("Helvetica-Bold").text("COMBINED PROJECT PROGRESS REPORT");
  doc.moveDown(0.6);

  const info = [
    ["Project Name:", data.project.name],
    ["Project Location:", data.project.location || "—"],
    ["Main Contractor:", data.mainContractor || "—"],
    ["Electrical Contractor:", "One Touch Electrical Services"],
    ["Reporting Period:", `${fmtDate(data.from)} – ${fmtDate(data.to)}`],
    ["Prepared By:", data.preparedByName || "—"],
    ["Date:", fmtDate(data.reportDate)],
  ];
  doc.fontSize(9);
  info.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").fillColor(NAVY).text(label, margin, doc.y, { continued: true, width: 460 });
    doc.font("Helvetica").fillColor("#0f172a").text(" " + value);
  });

  doc.moveDown(0.8);
}

function numberedHeading(doc, num, title) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.6);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(NAVY).text(`${num}. ${title}`);
  doc.moveDown(0.2);
  doc.fontSize(9).font("Helvetica").fillColor("#334155");
}

// A bordered table matching the letterhead template's style: navy header
// row, zebra-striped body, cell borders, automatic row-height from
// wrapped text, page breaks that re-draw the header on the new page.
function drawTable(doc, x, columns, rows, options = {}) {
  const cellPadding = 4;
  const fontSize = 8;
  const headerHeight = 18;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  const bottomLimit = 780;

  function drawHeaderRow(cy) {
    doc.rect(x, cy, totalWidth, headerHeight).fill(NAVY);
    let cx = x;
    doc.fontSize(fontSize).fillColor("#ffffff").font("Helvetica-Bold");
    columns.forEach((col) => {
      doc.text(col.header, cx + cellPadding, cy + 5, { width: col.width - cellPadding * 2 });
      cx += col.width;
    });
    return cy + headerHeight;
  }

  function rowHeight(row) {
    doc.fontSize(fontSize).font("Helvetica");
    let maxH = 12;
    columns.forEach((col, i) => {
      const h = doc.heightOfString(String(row[i] ?? ""), { width: col.width - cellPadding * 2 });
      if (h > maxH) maxH = h;
    });
    return maxH + cellPadding * 2;
  }

  let cy = doc.y;
  if (cy + headerHeight > bottomLimit) {
    doc.addPage();
    cy = 40;
  }
  cy = drawHeaderRow(cy);

  if (rows.length === 0) {
    const h = 16;
    doc.rect(x, cy, totalWidth, h).stroke("#cbd5e1");
    doc.fontSize(fontSize).fillColor("#94a3b8").font("Helvetica-Oblique").text("None in this period.", x + cellPadding, cy + 4);
    cy += h;
  }

  rows.forEach((row, ri) => {
    const h = rowHeight(row);
    if (cy + h > bottomLimit) {
      doc.addPage();
      cy = 40;
      cy = drawHeaderRow(cy);
    }
    if (ri % 2 === 1) doc.rect(x, cy, totalWidth, h).fill("#f8fafc");
    doc.rect(x, cy, totalWidth, h).stroke("#cbd5e1");
    let cx = x;
    const isBoldRow = options.boldLastRow && ri === rows.length - 1;
    doc.fontSize(fontSize).fillColor("#0f172a").font(isBoldRow ? "Helvetica-Bold" : "Helvetica");
    columns.forEach((col, i) => {
      doc.text(String(row[i] ?? ""), cx + cellPadding, cy + cellPadding, { width: col.width - cellPadding * 2 });
      if (cx > x) doc.moveTo(cx, cy).lineTo(cx, cy + h).stroke("#cbd5e1");
      cx += col.width;
    });
    cy += h;
  });

  doc.x = x;
  doc.y = cy + 10;
  return cy + 10;
}

// A vector-drawn line chart — PDFKit has no chart primitive, so axes,
// gridlines, the lines themselves and the legend are all drawn by hand.
// Mirrors the on-screen "Planned vs Actual progress" chart (0-100% axis,
// solid Actual line, dashed Planned line).
function drawLineChart(doc, x, width, height, points, series) {
  const padding = { top: 6, right: 10, bottom: 16, left: 28 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (doc.y + height + 20 > 780) doc.addPage();
  const oy = doc.y;

  doc.lineWidth(1);
  [0, 25, 50, 75, 100].forEach((v) => {
    const gy = oy + padding.top + plotH - (v / 100) * plotH;
    doc.moveTo(x + padding.left, gy).lineTo(x + padding.left + plotW, gy).strokeColor("#f1f5f9").stroke();
    doc.fontSize(6).fillColor("#94a3b8").font("Helvetica").text(`${v}%`, x, gy - 3, { width: padding.left - 4, align: "right" });
  });
  doc
    .moveTo(x + padding.left, oy + padding.top)
    .lineTo(x + padding.left, oy + padding.top + plotH)
    .lineTo(x + padding.left + plotW, oy + padding.top + plotH)
    .strokeColor("#cbd5e1")
    .stroke();

  const usable = points.filter((p) => series.some((s) => p[s.key] != null));
  if (usable.length < 2) {
    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .font("Helvetica-Oblique")
      .text("Not enough history in this period for a trend line.", x + padding.left, oy + padding.top + plotH / 2 - 4, {
        width: plotW,
        align: "center",
      });
  } else {
    const stepX = plotW / (usable.length - 1);
    series.forEach((s) => {
      doc.strokeColor(s.color).lineWidth(1.5);
      if (s.dashed) doc.dash(3, { space: 2 });
      let started = false;
      usable.forEach((p, i) => {
        if (p[s.key] == null) return;
        const px = x + padding.left + i * stepX;
        const py = oy + padding.top + plotH - (Math.max(0, Math.min(100, p[s.key])) / 100) * plotH;
        if (!started) {
          doc.moveTo(px, py);
          started = true;
        } else {
          doc.lineTo(px, py);
        }
      });
      doc.stroke();
      if (s.dashed) doc.undash();
      usable.forEach((p, i) => {
        if (p[s.key] == null) return;
        const px = x + padding.left + i * stepX;
        const py = oy + padding.top + plotH - (Math.max(0, Math.min(100, p[s.key])) / 100) * plotH;
        doc.circle(px, py, 1.5).fill(s.color);
      });
    });

    const labelIdxs =
      usable.length <= 4 ? usable.map((_, i) => i) : [0, Math.floor((usable.length - 1) / 2), usable.length - 1];
    doc.fontSize(6).fillColor("#94a3b8").font("Helvetica");
    labelIdxs.forEach((i) => {
      const px = x + padding.left + i * stepX;
      doc.text(fmtDate(usable[i].date), px - 20, oy + padding.top + plotH + 3, { width: 40, align: "center" });
    });
  }

  let lx = x + padding.left;
  const ly = oy + height + 2;
  doc.fontSize(7);
  series.forEach((s) => {
    doc.rect(lx, ly, 6, 6).fill(s.color);
    doc.fillColor("#334155").font("Helvetica").text(s.label, lx + 9, ly);
    lx += 9 + doc.widthOfString(s.label) + 14;
  });

  doc.x = x;
  doc.y = ly + 12;
}

// A vector-drawn horizontal bar chart — same rationale as drawLineChart.
// Used for the Budget vs Actual expenditure comparison, which is a
// single side-by-side comparison rather than a trend over time.
function drawBarChart(doc, x, width, bars) {
  const barHeight = 14;
  const gap = 8;
  const labelWidth = 130;
  const plotWidth = width - labelWidth - 70;
  const maxVal = Math.max(1, ...bars.map((b) => b.value));

  if (doc.y + bars.length * (barHeight + gap) + 10 > 780) doc.addPage();
  let y = doc.y;

  bars.forEach((b) => {
    doc.fontSize(8).fillColor("#334155").font("Helvetica").text(b.label, x, y + 3, { width: labelWidth });
    const barW = Math.max(2, (b.value / maxVal) * plotWidth);
    doc.rect(x + labelWidth, y, barW, barHeight).fill(b.color);
    doc.fontSize(8).fillColor("#0f172a").text(fmtMoney(b.value), x + labelWidth + barW + 5, y + 3, { width: 60 });
    y += barHeight + gap;
  });

  doc.x = x;
  doc.y = y + 4;
}

function bulletList(doc, items, emptyText = "N/A") {
  doc.fontSize(9).fillColor("#334155").font("Helvetica");
  if (items.length === 0) {
    doc.text(emptyText);
    return;
  }
  items.forEach((t) => {
    if (doc.y > 770) doc.addPage();
    doc.text(`• ${t}`, { indent: 4 });
  });
}

function variance(actual, target) {
  if (actual == null || target == null) return "—";
  const v = actual - target;
  if (v === 0) return "0%";
  return v > 0 ? `+${v}% (ahead)` : `${v}% (behind)`;
}

function generateCombinedReportPdf(data, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);

  letterheadHeader(doc, data);

  // 1. Overall project status
  numberedHeading(doc, 1, "OVERALL PROJECT STATUS");
  const { progress, finance } = data.analytics;
  const statusParts = [
    `${data.project.name} is ${progress.actual}% physically complete against a planned ${progress.planned ?? "n/a"}%, putting the project ${STATUS_LABELS[progress.status].toLowerCase()}.`,
  ];
  if (finance.fundUtilisationPercent != null) {
    statusParts.push(`${finance.fundUtilisationPercent}% of the approved budget has been utilised to date.`);
  }
  if (data.analytics.exceptions.length > 0) {
    statusParts.push(`${data.analytics.exceptions.length} exception(s) require attention this period.`);
  }
  doc.fontSize(9).fillColor("#334155").text(statusParts.join(" "), { align: "justify" });
  if (data.analytics.exceptions.length > 0) {
    doc.moveDown(0.3);
    doc.fillColor("#b91c1c");
    data.analytics.exceptions.forEach((e) => doc.text(`! ${e}`));
    doc.fillColor("#334155");
  }

  // 2. Work completed this period
  numberedHeading(doc, 2, "WORK COMPLETED THIS PERIOD");
  const completedRows = data.foreman
    .filter((r) => r.foremanDetail?.workCompleted)
    .map((r, i) => [i + 1, `${fmtDate(r.reportDate)} — ${r.foremanDetail.workCompleted}`, "Completed"]);
  drawTable(doc, 40, [{ header: "Item", width: 30 }, { header: "Description", width: 420 }, { header: "Status", width: 65 }], completedRows);

  // 3. Work in progress
  numberedHeading(doc, 3, "WORK IN PROGRESS");
  const inProgressRows = [
    ...data.foreman
      .filter((r) => r.foremanDetail?.workInProgress)
      .map((r) => [`${fmtDate(r.reportDate)} — ${r.foremanDetail.workInProgress}`, `${r.foremanDetail.percentProgress}%`]),
    ...data.qs.flatMap((r) =>
      (r.qsDetail?.lines ?? [])
        .filter((l) => l.percentCompletion < 100)
        .map((l) => [`${l.boqItemNumber} — ${l.description}`, `${l.percentCompletion}%`])
    ),
  ];
  drawTable(doc, 40, [{ header: "Description", width: 435 }, { header: "Progress", width: 80 }], inProgressRows);

  // 4. Manpower on site — fixed categories from the Foreman's latest
  // report in the period; only the Quantity column ever varies.
  numberedHeading(doc, 4, "MANPOWER ON SITE");
  const latestForeman = data.foreman[data.foreman.length - 1]?.foremanDetail;
  const manpowerRows = latestForeman
    ? [
        ["Electrical Supervisors", latestForeman.electricalSupervisors],
        ["Electricians", latestForeman.electricians],
        ["Electrical Assistants", latestForeman.electricalAssistants],
        ["General Hands", latestForeman.generalHands],
        ["SHE officer", latestForeman.sheOfficersOnSite],
        ["Total Workforce", latestForeman.workersOnSite],
      ]
    : [];
  drawTable(doc, 40, [{ header: "Category", width: 300 }, { header: "Quantity", width: 215 }], manpowerRows, { boldLastRow: true });

  // 5. QS / commercial progress
  numberedHeading(doc, 5, "QS / COMMERCIAL PROGRESS");
  const qsRows = data.qs.flatMap((r) =>
    (r.qsDetail?.lines ?? []).map((l) => [
      l.boqItemNumber,
      l.description,
      `${fmtMoney(l.cumulativeQuantity)}`,
      `${l.percentCompletion}%`,
      l.variationReference ? `${l.variationReference}${l.variationStatus ? " (" + l.variationStatus + ")" : ""}` : "—",
    ])
  );
  drawTable(
    doc,
    40,
    [
      { header: "BOQ item", width: 60 },
      { header: "Description", width: 210 },
      { header: "Cumulative qty", width: 90 },
      { header: "% complete", width: 65 },
      { header: "Variation", width: 90 },
    ],
    qsRows
  );

  // 6. Materials & stores
  numberedHeading(doc, 6, "MATERIALS & STORES");
  const storesRows = data.stores.flatMap((r) =>
    (r.storesDetail?.lines ?? []).map((l) => [
      fmtDate(r.reportDate),
      l.itemName,
      l.direction.replace("_", "/"),
      `${fmtMoney(l.quantity)} ${l.unit || ""}`.trim(),
      `${fmtMoney(l.openingBalance)} -> ${fmtMoney(l.closingBalance)}`,
    ])
  );
  drawTable(
    doc,
    40,
    [
      { header: "Date", width: 65 },
      { header: "Item", width: 130 },
      { header: "Direction", width: 70 },
      { header: "Quantity", width: 100 },
      { header: "Opening -> Closing", width: 150 },
    ],
    storesRows
  );
  const shortages = data.stores.map((r) => r.storesDetail?.shortagesAndRequirements).filter(Boolean);
  if (shortages.length > 0) {
    doc.fillColor("#b91c1c").fontSize(9);
    shortages.forEach((s) => doc.text(`Shortage: ${s}`));
    doc.fillColor("#334155");
  }

  // 7. Testing & quality control
  numberedHeading(doc, 7, "TESTING & QUALITY CONTROL");
  const commercialIssues = data.qs.map((r) => r.qsDetail?.commercialIssues).filter(Boolean);
  bulletList(doc, commercialIssues);

  // 8. Health, Safety & Environment (HSE)
  numberedHeading(doc, 8, "HEALTH, SAFETY & ENVIRONMENT (HSE)");
  const totalIncidents = data.she.reduce((s, r) => s + (r.sheDetail?.incidentCount ?? 0), 0);
  const totalNearMiss = data.she.reduce((s, r) => s + (r.sheDetail?.nearMissCount ?? 0), 0);
  const complianceRate = data.she.length > 0 && totalIncidents === 0 ? "100%" : data.she.length > 0 ? "Review required" : "—";
  drawTable(
    doc,
    40,
    [{ header: "Metric", width: 300 }, { header: "Value", width: 215 }],
    [
      ["Lost Time Injuries (incidents)", totalIncidents],
      ["Near misses", totalNearMiss],
      ["Safety compliance rate", complianceRate],
    ]
  );
  const sheNotes = data.she.flatMap((r) => {
    const d = r.sheDetail;
    if (!d) return [];
    const notes = [];
    if (d.toolboxTalksConducted) notes.push(`Toolbox talks: ${d.toolboxTalksConducted}`);
    if (d.hazardsIdentified) notes.push(`Hazards identified: ${d.hazardsIdentified}`);
    if (d.correctiveActions) notes.push(`Corrective actions: ${d.correctiveActions}`);
    if (d.environmentalIssues) notes.push(`Environmental issues: ${d.environmentalIssues}`);
    if (d.incidentsDescription) notes.push(`Incident details: ${d.incidentsDescription}`);
    return notes;
  });
  if (sheNotes.length > 0) {
    doc.moveDown(0.3);
    bulletList(doc, sheNotes);
  }

  // 9. Challenges / delays
  numberedHeading(doc, 9, "CHALLENGES / DELAYS");
  const constraints = data.foreman.map((r) => r.foremanDetail?.constraints).filter(Boolean);
  bulletList(doc, constraints);

  // 10. Instructions & actions required
  numberedHeading(doc, 10, "INSTRUCTIONS & ACTIONS REQUIRED");
  const instructionRows = data.instructions.map((i) => [
    i.instructionNumber,
    i.description,
    i.personResponsible.name,
    fmtDate(i.dueDate),
    i.status,
  ]);
  drawTable(
    doc,
    40,
    [
      { header: "No.", width: 40 },
      { header: "Description", width: 245 },
      { header: "Responsible", width: 100 },
      { header: "Due", width: 65 },
      { header: "Status", width: 65 },
    ],
    instructionRows
  );
  doc.moveDown(0.3);
  const actionRows = data.outstandingActions.map((a) => [
    a.description,
    a.assignedTo.name,
    fmtDate(a.dueDate),
    a.isOverdue ? "OVERDUE" : a.status,
  ]);
  drawTable(
    doc,
    40,
    [
      { header: "Outstanding action", width: 260 },
      { header: "Assigned to", width: 120 },
      { header: "Due", width: 65 },
      { header: "Status", width: 70 },
    ],
    actionRows
  );

  // 11. Planned activities for next period
  numberedHeading(doc, 11, "PLANNED ACTIVITIES FOR NEXT PERIOD");
  const nextPlans = data.foreman.map((r) => r.foremanDetail?.nextDayPlan).filter(Boolean);
  bulletList(doc, nextPlans);

  // 12. Actual progress
  numberedHeading(doc, 12, "ACTUAL PROGRESS");
  drawLineChart(doc, 40, 515, 140, data.progressTrend, [
    { key: "actual", label: "Actual", color: "#2563eb" },
    { key: "planned", label: "Planned", color: "#94a3b8", dashed: true },
  ]);
  drawTable(
    doc,
    40,
    [
      { header: "Description", width: 220 },
      { header: "Target", width: 90 },
      { header: "Actual", width: 90 },
      { header: "Variance", width: 115 },
    ],
    [["Overall project progress", `${progress.planned ?? "n/a"}%`, `${progress.actual}%`, variance(progress.actual, progress.planned)]]
  );

  // 13. Fund utilisation
  numberedHeading(doc, 13, "FUND UTILISATION");
  drawBarChart(doc, 40, 515, [
    { label: "Approved budget", value: data.project.approvedBudget != null ? Number(data.project.approvedBudget) : 0, color: "#7c3aed" },
    { label: "Actual expenditure", value: finance.totalExpenditure, color: "#dc2626" },
  ]);
  const fundRows = [];
  Object.entries(finance.fundsReceivedByCategory).forEach(([cat, amt]) => {
    fundRows.push([CATEGORY_LABELS[cat] || cat, fmtMoney(amt)]);
  });
  fundRows.push(["Money allocated to:", ""]);
  Object.entries(finance.expenditureByCategory).forEach(([cat, amt]) => {
    fundRows.push([`  ${CATEGORY_LABELS[cat] || cat}`, fmtMoney(amt)]);
  });
  fundRows.push(["Total expenditure", fmtMoney(finance.totalExpenditure)]);
  fundRows.push(["Balance available", fmtMoney(finance.balanceAvailable)]);
  drawTable(doc, 40, [{ header: "Item", width: 300 }, { header: "Amount", width: 215 }], fundRows);

  if (data.recommendations) {
    numberedHeading(doc, 14, "MANAGEMENT RECOMMENDATIONS");
    doc.fontSize(9).fillColor("#334155").text(data.recommendations, { align: "justify" });
  }

  if (data.photos.length > 0) {
    numberedHeading(doc, 15, "SELECTED SITE PHOTOGRAPHS");
    let px = 40;
    let py = doc.y;
    const photoSize = 150;
    data.photos.forEach((p) => {
      if (px + photoSize > 555) {
        px = 40;
        py += photoSize + 30;
      }
      if (py + photoSize > 780) {
        doc.addPage();
        py = 40;
        px = 40;
      }
      try {
        const filePath = path.join(UPLOAD_ROOT, p.storageKey);
        if (fs.existsSync(filePath)) {
          doc.image(filePath, px, py, { fit: [photoSize, photoSize] });
        }
      } catch {
        // A single unreadable photo shouldn't fail the whole report.
      }
      doc.fontSize(7).fillColor("#64748b").text(`${p.reportType} - ${fmtDate(p.reportDate)}`, px, py + photoSize + 2, { width: photoSize });
      px += photoSize + 15;
    });
    doc.x = 40;
    doc.y = py + photoSize + 20;
  }

  // 16. Overall progress (final summary table, matching the template's
  // closing table) + sign-off.
  numberedHeading(doc, 16, "OVERALL PROGRESS");
  drawTable(
    doc,
    40,
    [
      { header: "Description", width: 220 },
      { header: "Target (%)", width: 90 },
      { header: "Actual (%)", width: 90 },
      { header: "Variance", width: 115 },
    ],
    [["Overall Project Progress", progress.planned ?? "n/a", progress.actual, variance(progress.actual, progress.planned)]]
  );

  signOffSection(doc, data.preparedByName);

  doc.end();
  return doc;
}

function signOffSection(doc, preparedByName) {
  if (doc.y > 680) doc.addPage();
  else doc.moveDown(2);
  doc.fontSize(9).fillColor("#334155");
  const y1 = doc.y + 30;
  doc.moveTo(40, y1).lineTo(260, y1).stroke("#94a3b8");
  doc.font("Helvetica-Bold").text(preparedByName || "", 40, y1 + 4);
  doc.font("Helvetica").text("Technical Manager", 40, y1 + 16);
  doc.text("One Touch Electrical Services", 40, y1 + 28);

  doc.moveTo(320, y1).lineTo(540, y1).stroke("#94a3b8");
  doc.text("Date", 320, y1 + 4);
}

// ---------- Excel export (unchanged structure) ----------

async function generateCombinedReportExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "One Touch Electrical Service";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 30 }, { width: 60 }];

  if (fs.existsSync(LOGO_PATH)) {
    const logoId = wb.addImage({ filename: LOGO_PATH, extension: "jpeg" });
    const logoWidthPx = 480;
    const logoHeightPx = logoWidthPx * LOGO_ASPECT;
    summary.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: logoWidthPx, height: logoHeightPx } });
    // addImage floats over cells rather than pushing rows down, so blank
    // rows are reserved underneath it to keep the text below from being
    // hidden behind the picture.
    const reserveRows = Math.ceil(logoHeightPx / 20) + 1;
    for (let i = 0; i < reserveRows; i++) summary.addRow([]);
  }

  summary.addRows([
    ["Project", `${data.project.name} (${data.project.code})`],
    ["Client", data.project.client || ""],
    ["Location", data.project.location || ""],
    ["Main contractor", data.mainContractor || ""],
    ["Contract value", fmtMoney(data.project.contractValue)],
    ["Approved budget", fmtMoney(data.project.approvedBudget)],
    ["Date range", `${fmtDate(data.from)} - ${fmtDate(data.to)}`],
    ["Prepared by", data.preparedByName || ""],
    ["Report generated", fmtDate(data.reportDate)],
    [],
    ["Actual progress", `${data.analytics.progress.actual}%`],
    ["Planned progress", data.analytics.progress.planned != null ? `${data.analytics.progress.planned}%` : "n/a"],
    ["Programme status", STATUS_LABELS[data.analytics.progress.status]],
    ["Funds received", fmtMoney(data.analytics.finance.totalFundsReceived)],
    ["Total expenditure", fmtMoney(data.analytics.finance.totalExpenditure)],
    ["Outstanding commitments", fmtMoney(data.analytics.finance.totalCommitments)],
    ["Balance available", fmtMoney(data.analytics.finance.balanceAvailable)],
    ["Fund utilisation", data.analytics.finance.fundUtilisationPercent != null ? `${data.analytics.finance.fundUtilisationPercent}%` : "n/a"],
  ]);
  summary.getColumn(1).font = { bold: true };
  summary.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  if (data.analytics.exceptions.length > 0) {
    summary.addRow([]);
    summary.addRow(["Exceptions"]).font = { bold: true };
    data.analytics.exceptions.forEach((e) => summary.addRow([e]));
  }
  if (data.recommendations) {
    summary.addRow([]);
    summary.addRow(["Management recommendations", data.recommendations]).font = { bold: true };
  }

  const foremanSheet = wb.addWorksheet("Foreman");
  foremanSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Submitted by", key: "by", width: 20 },
    { header: "Site location", key: "site", width: 20 },
    { header: "Progress %", key: "progress", width: 12 },
    { header: "Electrical Supervisors", key: "supervisors", width: 16 },
    { header: "Electricians", key: "electricians", width: 12 },
    { header: "Electrical Assistants", key: "assistants", width: 16 },
    { header: "General Hands", key: "generalHands", width: 12 },
    { header: "SHE officer", key: "sheOfficers", width: 10 },
    { header: "Total Workforce", key: "workers", width: 14 },
    { header: "Work completed", key: "completed", width: 30 },
    { header: "Work in progress", key: "inprogress", width: 30 },
    { header: "Constraints", key: "constraints", width: 30 },
    { header: "Planned next day", key: "nextDay", width: 30 },
  ];
  foremanSheet.getRow(1).font = { bold: true };
  data.foreman.forEach((r) => {
    const d = r.foremanDetail;
    foremanSheet.addRow({
      date: fmtDate(r.reportDate),
      by: r.submittedBy.name,
      site: d?.siteLocation ?? "",
      progress: d?.percentProgress ?? "",
      supervisors: d?.electricalSupervisors ?? "",
      electricians: d?.electricians ?? "",
      assistants: d?.electricalAssistants ?? "",
      generalHands: d?.generalHands ?? "",
      sheOfficers: d?.sheOfficersOnSite ?? "",
      workers: d?.workersOnSite ?? "",
      completed: d?.workCompleted ?? "",
      inprogress: d?.workInProgress ?? "",
      constraints: d?.constraints ?? "",
      nextDay: d?.nextDayPlan ?? "",
    });
  });

  const qsSheet = wb.addWorksheet("QS");
  qsSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "BOQ item", key: "item", width: 12 },
    { header: "Description", key: "desc", width: 30 },
    { header: "Contract qty", key: "contract", width: 14 },
    { header: "Qty today", key: "today", width: 12 },
    { header: "Cumulative qty", key: "cum", width: 14 },
    { header: "Balance qty", key: "balance", width: 14 },
    { header: "% complete", key: "pct", width: 12 },
    { header: "Valuation", key: "valuation", width: 14 },
    { header: "Variation ref", key: "variationRef", width: 16 },
    { header: "Variation status", key: "variationStatus", width: 16 },
  ];
  qsSheet.getRow(1).font = { bold: true };
  data.qs.forEach((r) => {
    (r.qsDetail?.lines ?? []).forEach((l) => {
      qsSheet.addRow({
        date: fmtDate(r.reportDate),
        item: l.boqItemNumber,
        desc: l.description,
        contract: Number(l.contractQuantity),
        today: Number(l.quantityToday),
        cum: Number(l.cumulativeQuantity),
        balance: Number(l.balanceQuantity),
        pct: l.percentCompletion,
        valuation: l.valuationAmount != null ? Number(l.valuationAmount) : "",
        variationRef: l.variationReference ?? "",
        variationStatus: l.variationStatus ?? "",
      });
    });
  });

  const sheSheet = wb.addWorksheet("SHE");
  sheSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Submitted by", key: "by", width: 20 },
    { header: "Workers on site", key: "workers", width: 14 },
    { header: "Toolbox talks", key: "talks", width: 30 },
    { header: "Safety inspections", key: "inspections", width: 30 },
    { header: "PPE compliance", key: "ppe", width: 20 },
    { header: "Hazards identified", key: "hazards", width: 30 },
    { header: "Incidents", key: "incidents", width: 10 },
    { header: "Near misses", key: "nearmiss", width: 12 },
    { header: "Corrective actions", key: "corrective", width: 30 },
    { header: "Environmental issues", key: "environmental", width: 30 },
    { header: "Safety observations", key: "observations", width: 30 },
  ];
  sheSheet.getRow(1).font = { bold: true };
  data.she.forEach((r) => {
    const d = r.sheDetail;
    sheSheet.addRow({
      date: fmtDate(r.reportDate),
      by: r.submittedBy.name,
      workers: d?.workersOnSite ?? "",
      talks: d?.toolboxTalksConducted ?? "",
      inspections: d?.safetyInspections ?? "",
      ppe: d?.ppeCompliance ?? "",
      hazards: d?.hazardsIdentified ?? "",
      incidents: d?.incidentCount ?? 0,
      nearmiss: d?.nearMissCount ?? 0,
      corrective: d?.correctiveActions ?? "",
      environmental: d?.environmentalIssues ?? "",
      observations: d?.safetyObservations ?? "",
    });
  });

  const storesSheet = wb.addWorksheet("Stores");
  storesSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Item", key: "item", width: 20 },
    { header: "Direction", key: "dir", width: 12 },
    { header: "Quantity", key: "qty", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Opening balance", key: "opening", width: 14 },
    { header: "Closing balance", key: "closing", width: 14 },
    { header: "Unit cost", key: "cost", width: 12 },
    { header: "Supplier", key: "supplier", width: 20 },
    { header: "Delivery ref", key: "ref", width: 16 },
  ];
  storesSheet.getRow(1).font = { bold: true };
  data.stores.forEach((r) => {
    (r.storesDetail?.lines ?? []).forEach((l) => {
      storesSheet.addRow({
        date: fmtDate(r.reportDate),
        item: l.itemName,
        dir: l.direction,
        qty: Number(l.quantity),
        unit: l.unit ?? "",
        opening: Number(l.openingBalance),
        closing: Number(l.closingBalance),
        cost: l.unitCost != null ? Number(l.unitCost) : "",
        supplier: l.supplier ?? "",
        ref: l.deliveryReference ?? "",
      });
    });
  });

  const financeSheet = wb.addWorksheet("Finance");
  financeSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Type", key: "type", width: 14 },
    { header: "Category", key: "category", width: 18 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Description", key: "desc", width: 30 },
    { header: "Payment ref", key: "ref", width: 16 },
  ];
  financeSheet.getRow(1).font = { bold: true };
  data.finance.forEach((r) => {
    (r.financeDetail?.lines ?? []).forEach((l) => {
      financeSheet.addRow({
        date: fmtDate(r.reportDate),
        type: l.type,
        category: CATEGORY_LABELS[l.category] || l.category,
        amount: Number(l.amount),
        desc: l.description ?? "",
        ref: l.paymentReference ?? "",
      });
    });
  });

  const instructionsSheet = wb.addWorksheet("Instructions");
  instructionsSheet.columns = [
    { header: "Number", key: "num", width: 12 },
    { header: "Date issued", key: "issued", width: 14 },
    { header: "Due date", key: "due", width: 14 },
    { header: "Description", key: "desc", width: 40 },
    { header: "Responsible", key: "resp", width: 20 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 14 },
  ];
  instructionsSheet.getRow(1).font = { bold: true };
  data.instructions.forEach((i) => {
    instructionsSheet.addRow({
      num: i.instructionNumber,
      issued: fmtDate(i.dateIssued),
      due: fmtDate(i.dueDate),
      desc: i.description,
      resp: i.personResponsible.name,
      priority: i.priority,
      status: i.status,
    });
  });

  const actionsSheet = wb.addWorksheet("Outstanding Actions");
  actionsSheet.columns = [
    { header: "Due date", key: "due", width: 14 },
    { header: "Description", key: "desc", width: 40 },
    { header: "Assigned to", key: "assignee", width: 20 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Overdue", key: "overdue", width: 10 },
  ];
  actionsSheet.getRow(1).font = { bold: true };
  data.outstandingActions.forEach((a) => {
    actionsSheet.addRow({
      due: fmtDate(a.dueDate),
      desc: a.description,
      assignee: a.assignedTo.name,
      priority: a.priority,
      status: a.status,
      overdue: a.isOverdue ? "Yes" : "No",
    });
  });

  return wb;
}

module.exports = { gatherCombinedReportData, generateCombinedReportPdf, generateCombinedReportExcel };
