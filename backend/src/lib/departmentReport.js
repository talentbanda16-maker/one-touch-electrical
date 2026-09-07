const prisma = require("../prisma");
const { computeQsAnalytics, computeStoresAnalytics, computeSheAnalytics } = require("./departmentAnalytics");
const {
  fmtDate,
  fmtMoney,
  CATEGORY_LABELS,
  newPdfDoc,
  coverPage,
  sectionHeading,
  section,
  line,
  signOffSection,
} = require("./pdfReportHelpers");

const DEPARTMENT_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };
const DEPARTMENT_INCLUDE = {
  FOREMAN: { foremanDetail: true },
  QS: { qsDetail: { include: { lines: true } } },
  SHE: { sheDetail: true },
  STORES: { storesDetail: { include: { lines: true } } },
  FINANCE: { financeDetail: { include: { lines: true } } },
};

async function gatherDepartmentReportData(project, department, from, to) {
  const reports = await prisma.report.findMany({
    where: { projectId: project.id, type: department, status: "APPROVED", reportDate: { gte: from, lte: to } },
    include: { ...DEPARTMENT_INCLUDE[department], submittedBy: { select: { name: true } } },
    orderBy: { reportDate: "asc" },
  });

  let summary = null;
  if (department === "QS") summary = await computeQsAnalytics(project);
  else if (department === "STORES") summary = await computeStoresAnalytics(project);
  else if (department === "SHE") summary = await computeSheAnalytics(project);

  return { project, department, from, to, reports, summary };
}

function renderForemanReport(doc, r) {
  const d = r.foremanDetail;
  line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}${d?.siteLocation ? " - " + d.siteLocation : ""}`);
  if (!d) return;
  line(
    doc,
    `  Progress: ${d.percentProgress}%   Total workforce: ${d.workersOnSite} (supervisors ${d.electricalSupervisors}, electricians ${d.electricians}, assistants ${d.electricalAssistants}, general hands ${d.generalHands}, SHE ${d.sheOfficersOnSite})`
  );
  if (d.workCompleted) line(doc, `  Completed: ${d.workCompleted}`);
  if (d.workInProgress) line(doc, `  In progress: ${d.workInProgress}`);
  if (d.equipmentUsed) line(doc, `  Equipment: ${d.equipmentUsed}`);
  if (d.materialsUsed) line(doc, `  Materials used: ${d.materialsUsed}`);
  if (d.materialsRequired) line(doc, `  Materials required: ${d.materialsRequired}`);
  if (d.constraints) line(doc, `  Constraints: ${d.constraints}`);
  if (d.instructionsReceived) line(doc, `  Instructions received: ${d.instructionsReceived}`);
  if (d.nextDayPlan) line(doc, `  Planned next day: ${d.nextDayPlan}`);
}

function renderQsReport(doc, r) {
  line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}`);
  (r.qsDetail?.lines ?? []).forEach((l) => {
    line(doc, `  ${l.boqItemNumber}  ${l.description}  today ${fmtMoney(l.quantityToday)}  cum ${fmtMoney(l.cumulativeQuantity)}  ${l.percentCompletion}%${l.variationReference ? `  [variation ${l.variationReference}${l.variationStatus ? ": " + l.variationStatus : ""}]` : ""}`);
  });
  if (r.qsDetail?.commercialIssues) line(doc, `  Commercial issues: ${r.qsDetail.commercialIssues}`);
  if (r.qsDetail?.comments) line(doc, `  Comments: ${r.qsDetail.comments}`);
}

function renderSheReport(doc, r) {
  const d = r.sheDetail;
  line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}`);
  if (!d) return;
  line(doc, `  Workers on site: ${d.workersOnSite}   Incidents: ${d.incidentCount}   Near misses: ${d.nearMissCount}`);
  if (d.toolboxTalksConducted) line(doc, `  Toolbox talks: ${d.toolboxTalksConducted}`);
  if (d.safetyInspections) line(doc, `  Safety inspections: ${d.safetyInspections}`);
  if (d.ppeCompliance) line(doc, `  PPE compliance: ${d.ppeCompliance}`);
  if (d.hazardsIdentified) line(doc, `  Hazards identified: ${d.hazardsIdentified}`);
  if (d.correctiveActions) line(doc, `  Corrective actions: ${d.correctiveActions}`);
  if (d.environmentalIssues) line(doc, `  Environmental issues: ${d.environmentalIssues}`);
  if (d.safetyObservations) line(doc, `  Safety observations: ${d.safetyObservations}`);
  if (d.incidentsDescription) line(doc, `  Incident details: ${d.incidentsDescription}`);
}

function renderStoresReport(doc, r) {
  line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}`);
  (r.storesDetail?.lines ?? []).forEach((l) => {
    line(doc, `  ${l.direction}  ${l.itemName}  qty ${fmtMoney(l.quantity)}${l.unit ? " " + l.unit : ""}  (opening ${fmtMoney(l.openingBalance)} -> closing ${fmtMoney(l.closingBalance)})${l.supplier ? "  supplier: " + l.supplier : ""}`);
  });
  if (r.storesDetail?.shortagesAndRequirements) line(doc, `  Shortages/urgent requirements: ${r.storesDetail.shortagesAndRequirements}`);
}

function renderFinanceReport(doc, r) {
  line(doc, `${fmtDate(r.reportDate)} - ${r.submittedBy.name}`);
  (r.financeDetail?.lines ?? []).forEach((l) => {
    line(doc, `  ${l.type}  ${CATEGORY_LABELS[l.category] || l.category}  ${fmtMoney(l.amount)}${l.description ? "  " + l.description : ""}`);
  });
}

const RENDERERS = { FOREMAN: renderForemanReport, QS: renderQsReport, SHE: renderSheReport, STORES: renderStoresReport, FINANCE: renderFinanceReport };

function renderDepartmentSummary(doc, department, summary) {
  if (!summary) return;
  sectionHeading(doc, "Summary");
  if (department === "QS") {
    doc.text(`BOQ items tracked: ${summary.totals.itemCount}   Average % complete: ${summary.totals.overallPercentCompletion ?? "n/a"}%   Total valuation: ${fmtMoney(summary.totals.totalValuation)}`);
    if (summary.variations.length > 0) {
      doc.text(`Variations flagged: ${summary.variations.length}`);
    }
  } else if (department === "STORES") {
    if (summary.items.length === 0) {
      doc.text("No stock movements recorded.");
    } else {
      summary.items.forEach((i) => doc.text(`  ${i.itemName}: received ${fmtMoney(i.received)}, issued ${fmtMoney(i.issued)}, balance ${fmtMoney(i.balance)}${i.unit ? " " + i.unit : ""}`));
    }
  } else if (department === "SHE") {
    doc.text(`Total incidents: ${summary.totals.totalIncidents}   Near misses: ${summary.totals.totalNearMisses}   Open corrective actions: ${summary.correctiveActions.open} (${summary.correctiveActions.overdue} overdue)`);
  }
  doc.moveDown(1);
}

function generateDepartmentReportPdf(data, res) {
  const doc = newPdfDoc(res);
  const label = DEPARTMENT_LABELS[data.department];

  coverPage(doc, {
    title: `${label} Department Report`,
    project: data.project,
    from: data.from,
    to: data.to,
  });

  renderDepartmentSummary(doc, data.department, data.summary);
  section(doc, `${label} reports`, data.reports, (r) => RENDERERS[data.department](doc, r));
  signOffSection(doc);

  doc.end();
  return doc;
}

async function generateDepartmentReportExcel(data) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "One Touch Electrical Service";
  wb.created = new Date();
  const label = DEPARTMENT_LABELS[data.department];

  const summarySheet = wb.addWorksheet("Summary");
  summarySheet.columns = [{ width: 30 }, { width: 50 }];
  summarySheet.addRows([
    ["Project", `${data.project.name} (${data.project.code})`],
    ["Department", label],
    ["Date range", `${fmtDate(data.from)} - ${fmtDate(data.to)}`],
    ["Report generated", fmtDate(new Date())],
  ]);
  summarySheet.getColumn(1).font = { bold: true };

  if (data.department === "QS" && data.summary) {
    summarySheet.addRow([]);
    summarySheet.addRow(["BOQ items tracked", data.summary.totals.itemCount]);
    summarySheet.addRow(["Average % complete", data.summary.totals.overallPercentCompletion ?? "n/a"]);
    summarySheet.addRow(["Total valuation", fmtMoney(data.summary.totals.totalValuation)]);
  } else if (data.department === "STORES" && data.summary) {
    summarySheet.addRow([]);
    summarySheet.addRow(["Item", "Received", "Issued", "Balance"]).font = { bold: true };
    data.summary.items.forEach((i) => summarySheet.addRow([i.itemName, i.received, i.issued, i.balance]));
  } else if (data.department === "SHE" && data.summary) {
    summarySheet.addRow([]);
    summarySheet.addRow(["Total incidents", data.summary.totals.totalIncidents]);
    summarySheet.addRow(["Total near misses", data.summary.totals.totalNearMisses]);
    summarySheet.addRow(["Open corrective actions", data.summary.correctiveActions.open]);
    summarySheet.addRow(["Overdue corrective actions", data.summary.correctiveActions.overdue]);
  }

  const detailSheet = wb.addWorksheet(label);
  if (data.department === "FOREMAN") {
    detailSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Submitted by", key: "by", width: 20 },
      { header: "Site location", key: "site", width: 20 },
      { header: "Progress %", key: "progress", width: 12 },
      { header: "Workers", key: "workers", width: 12 },
      { header: "Work completed", key: "completed", width: 30 },
      { header: "Work in progress", key: "inprogress", width: 30 },
      { header: "Constraints", key: "constraints", width: 30 },
      { header: "Planned next day", key: "nextDay", width: 30 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    data.reports.forEach((r) => {
      const d = r.foremanDetail;
      detailSheet.addRow({
        date: fmtDate(r.reportDate),
        by: r.submittedBy.name,
        site: d?.siteLocation ?? "",
        progress: d?.percentProgress ?? "",
        workers: d?.workersOnSite ?? "",
        completed: d?.workCompleted ?? "",
        inprogress: d?.workInProgress ?? "",
        constraints: d?.constraints ?? "",
        nextDay: d?.nextDayPlan ?? "",
      });
    });
  } else if (data.department === "QS") {
    detailSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "BOQ item", key: "item", width: 12 },
      { header: "Description", key: "desc", width: 30 },
      { header: "Cumulative qty", key: "cum", width: 14 },
      { header: "% complete", key: "pct", width: 12 },
      { header: "Valuation", key: "valuation", width: 14 },
      { header: "Variation ref", key: "variationRef", width: 16 },
      { header: "Variation status", key: "variationStatus", width: 16 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    data.reports.forEach((r) => {
      (r.qsDetail?.lines ?? []).forEach((l) => {
        detailSheet.addRow({
          date: fmtDate(r.reportDate),
          item: l.boqItemNumber,
          desc: l.description,
          cum: Number(l.cumulativeQuantity),
          pct: l.percentCompletion,
          valuation: l.valuationAmount != null ? Number(l.valuationAmount) : "",
          variationRef: l.variationReference ?? "",
          variationStatus: l.variationStatus ?? "",
        });
      });
    });
  } else if (data.department === "SHE") {
    detailSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Submitted by", key: "by", width: 20 },
      { header: "Workers", key: "workers", width: 10 },
      { header: "Incidents", key: "incidents", width: 10 },
      { header: "Near misses", key: "nearmiss", width: 12 },
      { header: "Hazards identified", key: "hazards", width: 30 },
      { header: "Corrective actions", key: "corrective", width: 30 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    data.reports.forEach((r) => {
      const d = r.sheDetail;
      detailSheet.addRow({
        date: fmtDate(r.reportDate),
        by: r.submittedBy.name,
        workers: d?.workersOnSite ?? "",
        incidents: d?.incidentCount ?? 0,
        nearmiss: d?.nearMissCount ?? 0,
        hazards: d?.hazardsIdentified ?? "",
        corrective: d?.correctiveActions ?? "",
      });
    });
  } else if (data.department === "STORES") {
    detailSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Item", key: "item", width: 20 },
      { header: "Direction", key: "dir", width: 12 },
      { header: "Quantity", key: "qty", width: 12 },
      { header: "Opening balance", key: "opening", width: 14 },
      { header: "Closing balance", key: "closing", width: 14 },
      { header: "Supplier", key: "supplier", width: 20 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    data.reports.forEach((r) => {
      (r.storesDetail?.lines ?? []).forEach((l) => {
        detailSheet.addRow({
          date: fmtDate(r.reportDate),
          item: l.itemName,
          dir: l.direction,
          qty: Number(l.quantity),
          opening: Number(l.openingBalance),
          closing: Number(l.closingBalance),
          supplier: l.supplier ?? "",
        });
      });
    });
  } else if (data.department === "FINANCE") {
    detailSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 14 },
      { header: "Category", key: "category", width: 18 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Description", key: "desc", width: 30 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    data.reports.forEach((r) => {
      (r.financeDetail?.lines ?? []).forEach((l) => {
        detailSheet.addRow({
          date: fmtDate(r.reportDate),
          type: l.type,
          category: CATEGORY_LABELS[l.category] || l.category,
          amount: Number(l.amount),
          desc: l.description ?? "",
        });
      });
    });
  }

  return wb;
}

module.exports = { gatherDepartmentReportData, generateDepartmentReportPdf, generateDepartmentReportExcel };
