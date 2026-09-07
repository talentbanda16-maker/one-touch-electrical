const prisma = require("../prisma");
const { computeProjectAnalytics } = require("./analytics");
const {
  fmtDate,
  fmtMoney,
  CATEGORY_LABELS,
  newPdfDoc,
  coverPage,
  drawBarChart,
  sectionHeading,
  section,
  line,
  signOffSection,
} = require("./pdfReportHelpers");

async function gatherFinancialReportData(project, from, to) {
  const [analytics, financeReports] = await Promise.all([
    computeProjectAnalytics(project),
    prisma.report.findMany({
      where: { projectId: project.id, type: "FINANCE", status: "APPROVED", reportDate: { gte: from, lte: to } },
      include: { financeDetail: { include: { lines: true } }, submittedBy: { select: { name: true } } },
      orderBy: { reportDate: "asc" },
    }),
  ]);
  return { project, from, to, analytics, financeReports };
}

function categoryRows(byCategory) {
  return Object.entries(byCategory || {})
    .map(([cat, value]) => [CATEGORY_LABELS[cat] || cat, value])
    .sort((a, b) => b[1] - a[1]);
}

function generateFinancialReportPdf(data, res) {
  const doc = newPdfDoc(res);
  const { finance } = data.analytics;

  coverPage(doc, {
    title: "Project Financial Report",
    project: data.project,
    from: data.from,
    to: data.to,
    extraRows: [
      ["Contract value", fmtMoney(data.project.contractValue)],
      ["Approved budget", fmtMoney(data.project.approvedBudget)],
    ],
  });

  sectionHeading(doc, "Finance summary");
  doc.text(`Funds received: ${fmtMoney(finance.totalFundsReceived)}   Expenditure: ${fmtMoney(finance.totalExpenditure)}   Commitments: ${fmtMoney(finance.totalCommitments)}   Balance: ${fmtMoney(finance.balanceAvailable)}`);
  doc.text(`Fund utilisation: ${finance.fundUtilisationPercent ?? "n/a"}%   (Actual expenditure / Approved budget x 100)`);
  doc.moveDown(0.5);
  drawBarChart(doc, 40, doc.y, 500, [
    { label: "Approved budget", value: data.project.approvedBudget || 0, displayValue: fmtMoney(data.project.approvedBudget), color: "#7c3aed" },
    { label: "Actual expenditure", value: finance.totalExpenditure, displayValue: fmtMoney(finance.totalExpenditure), color: "#dc2626" },
  ]);
  doc.moveDown(3);

  const expByCat = categoryRows(finance.expenditureByCategory);
  if (expByCat.length > 0) {
    sectionHeading(doc, "Expenditure by category");
    drawBarChart(
      doc,
      40,
      doc.y,
      500,
      expByCat.map(([label, value]) => ({ label, value, displayValue: fmtMoney(value), color: "#dc2626" }))
    );
    doc.moveDown(3);
  }

  const fundsByCat = categoryRows(finance.fundsReceivedByCategory);
  if (fundsByCat.length > 0) {
    sectionHeading(doc, "Funds received by category");
    drawBarChart(
      doc,
      40,
      doc.y,
      500,
      fundsByCat.map(([label, value]) => ({ label, value, displayValue: fmtMoney(value), color: "#16a34a" }))
    );
    doc.moveDown(3);
  }

  if (data.analytics.exceptions.length > 0) {
    sectionHeading(doc, "Exceptions");
    doc.fillColor("#b91c1c");
    data.analytics.exceptions.forEach((e) => line(doc, `! ${e}`));
    doc.fillColor("#334155");
  }

  section(doc, "Finance transactions", data.financeReports, (r) => {
    line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}`);
    (r.financeDetail?.lines ?? []).forEach((l) => {
      line(doc, `  ${l.type}  ${CATEGORY_LABELS[l.category] || l.category}  ${fmtMoney(l.amount)}${l.description ? "  " + l.description : ""}`);
    });
  });

  signOffSection(doc);
  doc.end();
  return doc;
}

async function generateFinancialReportExcel(data) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "One Touch Electrical Service";
  wb.created = new Date();
  const { finance } = data.analytics;

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 30 }, { width: 40 }];
  summary.addRows([
    ["Project", `${data.project.name} (${data.project.code})`],
    ["Date range", `${fmtDate(data.from)} - ${fmtDate(data.to)}`],
    ["Contract value", fmtMoney(data.project.contractValue)],
    ["Approved budget", fmtMoney(data.project.approvedBudget)],
    ["Funds received", fmtMoney(finance.totalFundsReceived)],
    ["Total expenditure", fmtMoney(finance.totalExpenditure)],
    ["Outstanding commitments", fmtMoney(finance.totalCommitments)],
    ["Balance available", fmtMoney(finance.balanceAvailable)],
    ["Fund utilisation", finance.fundUtilisationPercent != null ? `${finance.fundUtilisationPercent}%` : "n/a"],
  ]);
  summary.getColumn(1).font = { bold: true };

  if (data.analytics.exceptions.length > 0) {
    summary.addRow([]);
    summary.addRow(["Exceptions"]).font = { bold: true };
    data.analytics.exceptions.forEach((e) => summary.addRow([e]));
  }

  const expSheet = wb.addWorksheet("Expenditure by Category");
  expSheet.columns = [{ header: "Category", key: "cat", width: 25 }, { header: "Amount", key: "amt", width: 18 }];
  expSheet.getRow(1).font = { bold: true };
  categoryRows(finance.expenditureByCategory).forEach(([cat, value]) => expSheet.addRow({ cat, amt: value }));

  const fundsSheet = wb.addWorksheet("Funds Received by Category");
  fundsSheet.columns = [{ header: "Category", key: "cat", width: 25 }, { header: "Amount", key: "amt", width: 18 }];
  fundsSheet.getRow(1).font = { bold: true };
  categoryRows(finance.fundsReceivedByCategory).forEach(([cat, value]) => fundsSheet.addRow({ cat, amt: value }));

  const txSheet = wb.addWorksheet("Transactions");
  txSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Submitted by", key: "by", width: 20 },
    { header: "Type", key: "type", width: 14 },
    { header: "Category", key: "category", width: 18 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Description", key: "desc", width: 30 },
    { header: "Payment ref", key: "ref", width: 16 },
  ];
  txSheet.getRow(1).font = { bold: true };
  data.financeReports.forEach((r) => {
    (r.financeDetail?.lines ?? []).forEach((l) => {
      txSheet.addRow({
        date: fmtDate(r.reportDate),
        by: r.submittedBy.name,
        type: l.type,
        category: CATEGORY_LABELS[l.category] || l.category,
        amount: Number(l.amount),
        desc: l.description ?? "",
        ref: l.paymentReference ?? "",
      });
    });
  });

  return wb;
}

module.exports = { gatherFinancialReportData, generateFinancialReportPdf, generateFinancialReportExcel };
