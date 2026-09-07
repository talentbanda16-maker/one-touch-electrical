const prisma = require("../prisma");
const { computeProjectAnalytics } = require("./analytics");
const {
  fmtDate,
  STATUS_LABELS,
  newPdfDoc,
  coverPage,
  drawBarChart,
  sectionHeading,
  section,
  line,
  signOffSection,
} = require("./pdfReportHelpers");

async function gatherProgressReportData(project, from, to) {
  const [analytics, snapshots] = await Promise.all([
    computeProjectAnalytics(project),
    prisma.projectSnapshot.findMany({
      where: { projectId: project.id, snapshotDate: { gte: from, lte: to } },
      orderBy: { snapshotDate: "asc" },
    }),
  ]);
  return { project, from, to, analytics, snapshots };
}

function generateProgressReportPdf(data, res) {
  const doc = newPdfDoc(res);
  const { progress } = data.analytics;

  coverPage(doc, {
    title: "Project Progress Report",
    project: data.project,
    from: data.from,
    to: data.to,
    extraRows: [
      ["Start date", data.project.startDate ? fmtDate(data.project.startDate) : "—"],
      ["Planned completion", data.project.plannedEndDate ? fmtDate(data.project.plannedEndDate) : "—"],
    ],
  });

  sectionHeading(doc, "Progress summary");
  doc.text(`Actual progress: ${progress.actual}%   Planned progress: ${progress.planned ?? "n/a"}%   Status: ${STATUS_LABELS[progress.status]}`);
  if (progress.variance != null) {
    doc.text(`Variance: ${progress.variance > 0 ? "+" : ""}${progress.variance} percentage points`);
  }
  if (progress.actualSources) {
    doc.fontSize(8).fillColor("#64748b");
    doc.text(
      `Actual progress sourced from: Foreman ${progress.actualSources.foreman ?? "n/a"}%${progress.actualSources.qs != null ? `, QS ${progress.actualSources.qs}%` : ""}`
    );
    doc.fontSize(9).fillColor("#334155");
  }
  doc.moveDown(0.5);
  drawBarChart(doc, 40, doc.y, 500, [
    { label: "Planned", value: progress.planned ?? 0, displayValue: `${progress.planned ?? "n/a"}%`, color: "#94a3b8" },
    { label: "Actual", value: progress.actual, displayValue: `${progress.actual}%`, color: "#2563eb" },
  ]);
  doc.moveDown(3);

  if (data.analytics.exceptions.length > 0) {
    sectionHeading(doc, "Exceptions");
    doc.fillColor("#b91c1c");
    data.analytics.exceptions.forEach((e) => line(doc, `! ${e}`));
    doc.fillColor("#334155");
  }

  section(doc, "Progress history (daily snapshots)", data.snapshots, (s) => {
    line(doc, `${fmtDate(s.snapshotDate)} - Actual ${s.actualProgress}%   Planned ${s.plannedProgress ?? "n/a"}%`);
  });

  signOffSection(doc);
  doc.end();
  return doc;
}

async function generateProgressReportExcel(data) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "One Touch Electrical Service";
  wb.created = new Date();
  const { progress } = data.analytics;

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 30 }, { width: 40 }];
  summary.addRows([
    ["Project", `${data.project.name} (${data.project.code})`],
    ["Date range", `${fmtDate(data.from)} - ${fmtDate(data.to)}`],
    ["Actual progress", `${progress.actual}%`],
    ["Planned progress", progress.planned != null ? `${progress.planned}%` : "n/a"],
    ["Variance", progress.variance != null ? `${progress.variance} points` : "n/a"],
    ["Status", STATUS_LABELS[progress.status]],
  ]);
  summary.getColumn(1).font = { bold: true };

  if (data.analytics.exceptions.length > 0) {
    summary.addRow([]);
    summary.addRow(["Exceptions"]).font = { bold: true };
    data.analytics.exceptions.forEach((e) => summary.addRow([e]));
  }

  const historySheet = wb.addWorksheet("Progress History");
  historySheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Actual %", key: "actual", width: 12 },
    { header: "Planned %", key: "planned", width: 12 },
    { header: "Fund utilisation %", key: "fund", width: 16 },
  ];
  historySheet.getRow(1).font = { bold: true };
  data.snapshots.forEach((s) => {
    historySheet.addRow({
      date: fmtDate(s.snapshotDate),
      actual: s.actualProgress,
      planned: s.plannedProgress ?? "",
      fund: s.fundUtilisationPercent ?? "",
    });
  });

  return wb;
}

module.exports = { gatherProgressReportData, generateProgressReportPdf, generateProgressReportExcel };
