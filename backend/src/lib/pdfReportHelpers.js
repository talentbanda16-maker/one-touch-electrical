const PDFDocument = require("pdfkit");

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

function newPdfDoc(res) {
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);
  return doc;
}

function coverPage(doc, { title, project, from, to, extraRows = [] }) {
  doc.fontSize(24).fillColor("#0f172a").text(title, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor("#334155").text(project.name, { align: "center" });
  doc.fontSize(12).fillColor("#64748b").text(project.code, { align: "center" });
  doc.moveDown(2);

  const rows = [["Reporting period", `${fmtDate(from)} to ${fmtDate(to)}`], ...extraRows, ["Report generated", fmtDate(new Date())]];
  doc.fontSize(11).fillColor("#0f172a");
  const startY = doc.y;
  const colWidth = 200;
  rows.forEach(([label, value], i) => {
    const rowY = startY + i * 22;
    doc.font("Helvetica-Bold").text(label, 150, rowY, { width: colWidth });
    doc.font("Helvetica").text(value, 150 + colWidth, rowY, { width: 200 });
  });
  doc.x = 40;
  doc.y = startY + rows.length * 22 + 40;
  doc.addPage();
}

// Simple horizontal bar comparison, drawn with pdfkit vector primitives
// rather than a rasterized chart library — no extra native dependency
// (chart-rendering packages typically need `canvas`, which is a known
// pain to install reliably), and it's precisely scaled to the real data.
function drawBarChart(doc, x, y, width, bars) {
  const barHeight = 16;
  const gap = 10;
  const labelWidth = 100;
  const chartLeft = x + labelWidth;
  const chartWidth = width - labelWidth - 60;
  const max = Math.max(...bars.map((b) => b.value), 1) * 1.1;

  let cy = y;
  bars.forEach((b) => {
    const w = Math.max(0, (b.value / max) * chartWidth);
    doc.fontSize(8).fillColor("#334155").text(b.label, x, cy + 3, { width: labelWidth - 6, align: "right" });
    doc.rect(chartLeft, cy, chartWidth, barHeight).fill("#e2e8f0");
    doc.rect(chartLeft, cy, w, barHeight).fill(b.color);
    doc.fillColor("#0f172a").fontSize(8).text(b.displayValue ?? String(b.value), chartLeft + chartWidth + 6, cy + 3);
    cy += barHeight + gap;
  });
  // doc.text() with explicit x/y leaves the cursor (doc.x) wherever that
  // last call landed — every subsequent flowing .text() call (section
  // headings, body text) would otherwise wrap into a narrow leftover
  // column starting from there instead of the page's left margin.
  doc.x = x;
  doc.y = cy;
  return cy;
}

function sectionHeading(doc, title) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.5).fillColor("#0f172a").fontSize(13).text(title);
  doc.fontSize(9).fillColor("#334155");
}

function section(doc, title, items, renderItem) {
  sectionHeading(doc, title);
  if (items.length === 0) {
    doc.text("None in this range.");
    return;
  }
  items.forEach((r) => {
    if (doc.y > 740) doc.addPage();
    renderItem(r);
    doc.moveDown(0.3);
  });
}

function line(doc, text) {
  if (doc.y > 760) doc.addPage();
  doc.text(text);
}

function signOffSection(doc) {
  if (doc.y > 650) doc.addPage();
  else doc.moveDown(2);
  sectionHeading(doc, "Approval / sign-off");
  doc.fontSize(9).fillColor("#334155");
  const y1 = doc.y + 20;
  doc.moveTo(40, y1).lineTo(260, y1).stroke("#94a3b8");
  doc.text("Prepared by (Technical Manager)", 40, y1 + 4);
  doc.moveTo(320, y1).lineTo(540, y1).stroke("#94a3b8");
  doc.text("Date", 320, y1 + 4);

  const y2 = y1 + 50;
  doc.moveTo(40, y2).lineTo(260, y2).stroke("#94a3b8");
  doc.text("Approved by (Management)", 40, y2 + 4);
  doc.moveTo(320, y2).lineTo(540, y2).stroke("#94a3b8");
  doc.text("Date", 320, y2 + 4);
}

module.exports = {
  CATEGORY_LABELS,
  STATUS_LABELS,
  fmtDate,
  fmtMoney,
  newPdfDoc,
  coverPage,
  drawBarChart,
  sectionHeading,
  section,
  line,
  signOffSection,
};
