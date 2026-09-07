import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import AttachmentThumb from "../components/AttachmentThumb";

const TYPE_LABELS = {
  FOREMAN: "Foreman",
  QS: "QS",
  SHE: "SHE",
  STORES: "Stores",
  FINANCE: "Finance",
};

const DETAIL_KEY = {
  FOREMAN: "foremanDetail",
  QS: "qsDetail",
  SHE: "sheDetail",
  STORES: "storesDetail",
  FINANCE: "financeDetail",
};

const PATCH_PATH = {
  FOREMAN: "foreman",
  QS: "qs",
  SHE: "she",
  STORES: "stores",
  FINANCE: "finance",
};

const VARIATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const STOCK_DIRECTIONS = ["RECEIVED", "ISSUED", "RETURNED", "DAMAGED_LOST"];
const FINANCE_LINE_TYPES = ["FUNDS_RECEIVED", "EXPENDITURE", "COMMITMENT"];
const FINANCE_CATEGORIES = [
  "ADVANCE_PAYMENT",
  "OTHER_FUNDS",
  "MATERIALS",
  "LABOUR",
  "PLANT_EQUIPMENT",
  "TRANSPORT_LOGISTICS",
  "SUBCONTRACTOR",
  "SUPPLIER",
  "PETTY_CASH",
  "OTHER",
];

// Field configs mirror the backend zod schemas in reports.js exactly —
// every field the PATCH endpoint accepts needs an input here, or that
// field would silently reset to its default on save.
const FOREMAN_FIELDS = [
  { key: "siteLocation", label: "Site location", type: "text" },
  { key: "workersOnSite", label: "Workers on site", type: "number" },
  { key: "labourSkilled", label: "Skilled labour", type: "number" },
  { key: "labourUnskilled", label: "Unskilled labour", type: "number" },
  { key: "labourSubcontractor", label: "Subcontractor labour", type: "number" },
  { key: "workCompleted", label: "Work completed today", type: "textarea", required: true },
  { key: "workInProgress", label: "Work in progress", type: "textarea" },
  { key: "percentProgress", label: "% progress", type: "number" },
  { key: "equipmentUsed", label: "Equipment used", type: "textarea" },
  { key: "materialsUsed", label: "Materials used", type: "textarea" },
  { key: "materialsRequired", label: "Materials required", type: "textarea" },
  { key: "constraints", label: "Constraints", type: "textarea" },
  { key: "instructionsReceived", label: "Instructions received", type: "textarea" },
  { key: "nextDayPlan", label: "Next day plan", type: "textarea" },
];

const SHE_FIELDS = [
  { key: "workersOnSite", label: "Workers on site", type: "number" },
  { key: "toolboxTalksConducted", label: "Toolbox talks conducted", type: "textarea", required: true },
  { key: "safetyInspections", label: "Safety inspections", type: "textarea" },
  { key: "ppeCompliance", label: "PPE compliance", type: "text" },
  { key: "hazardsIdentified", label: "Hazards identified", type: "textarea" },
  { key: "correctiveActions", label: "Corrective actions", type: "textarea" },
  { key: "environmentalIssues", label: "Environmental issues", type: "textarea" },
  { key: "safetyObservations", label: "Safety observations", type: "textarea" },
  { key: "incidentCount", label: "Incident count", type: "number" },
  { key: "nearMissCount", label: "Near miss count", type: "number" },
  { key: "incidentsDescription", label: "Incidents description", type: "textarea" },
];

const QS_HEADER_FIELDS = [
  { key: "comments", label: "Comments", type: "textarea" },
  { key: "commercialIssues", label: "Commercial issues", type: "textarea" },
];
const QS_LINE_FIELDS = [
  { key: "boqItemNumber", label: "BOQ item #", type: "text", required: true },
  { key: "description", label: "Description", type: "text", required: true },
  { key: "contractQuantity", label: "Contract qty", type: "number", required: true },
  { key: "quantityToday", label: "Qty today", type: "number", required: true },
  { key: "cumulativeQuantity", label: "Cumulative qty", type: "number", required: true },
  { key: "measurements", label: "Measurements", type: "text" },
  { key: "valuationAmount", label: "Valuation amount", type: "number" },
  { key: "variationReference", label: "Variation ref", type: "text" },
  { key: "variationStatus", label: "Variation status", type: "select", options: VARIATION_STATUSES },
  { key: "comments", label: "Line comments", type: "text" },
];

const STORES_HEADER_FIELDS = [
  { key: "shortagesAndRequirements", label: "Shortages & requirements", type: "textarea" },
  { key: "comments", label: "Comments", type: "textarea" },
];
const STORES_LINE_FIELDS = [
  { key: "itemName", label: "Item", type: "text", required: true },
  { key: "direction", label: "Direction", type: "select", options: STOCK_DIRECTIONS, required: true },
  { key: "quantity", label: "Quantity", type: "number", required: true },
  { key: "unit", label: "Unit", type: "text" },
  { key: "unitCost", label: "Unit cost", type: "number" },
  { key: "supplier", label: "Supplier", type: "text" },
  { key: "deliveryReference", label: "Delivery ref", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

const FINANCE_HEADER_FIELDS = [{ key: "comments", label: "Comments", type: "textarea" }];
const FINANCE_LINE_FIELDS = [
  { key: "type", label: "Type", type: "select", options: FINANCE_LINE_TYPES, required: true },
  { key: "category", label: "Category", type: "select", options: FINANCE_CATEGORIES, required: true },
  { key: "amount", label: "Amount", type: "number", required: true },
  { key: "description", label: "Description", type: "text" },
  { key: "paymentReference", label: "Payment ref", type: "text" },
];

const LINE_TYPES = {
  QS: { header: QS_HEADER_FIELDS, line: QS_LINE_FIELDS, blank: { boqItemNumber: "", description: "", contractQuantity: 0, quantityToday: 0, cumulativeQuantity: 0, measurements: "", valuationAmount: 0, variationReference: "", variationStatus: "", comments: "" } },
  STORES: { header: STORES_HEADER_FIELDS, line: STORES_LINE_FIELDS, blank: { itemName: "", direction: "RECEIVED", quantity: 0, unit: "", unitCost: 0, supplier: "", deliveryReference: "", notes: "" } },
  FINANCE: { header: FINANCE_HEADER_FIELDS, line: FINANCE_LINE_FIELDS, blank: { type: "EXPENDITURE", category: "MATERIALS", amount: 0, description: "", paymentReference: "" } },
};

function fieldValue(v, type) {
  if (type === "number") return v == null ? 0 : Number(v);
  return v ?? "";
}

function buildEditForm(report) {
  const detail = report[DETAIL_KEY[report.type]];
  const base = { reportDate: report.reportDate.slice(0, 10) };

  if (LINE_TYPES[report.type]) {
    const { header, line } = LINE_TYPES[report.type];
    const flat = {};
    for (const f of header) flat[f.key] = fieldValue(detail[f.key], f.type);
    const lines = detail.lines.map((l) => {
      const out = {};
      for (const f of line) out[f.key] = fieldValue(l[f.key], f.type);
      return out;
    });
    return { ...base, ...flat, lines };
  }

  const fields = report.type === "FOREMAN" ? FOREMAN_FIELDS : SHE_FIELDS;
  const flat = {};
  for (const f of fields) flat[f.key] = fieldValue(detail[f.key], f.type);
  return { ...base, ...flat };
}

export default function Approvals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [returnReasonFor, setReturnReasonFor] = useState(null);
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    loadPending();
  }, []);

  function loadPending() {
    api.get("/reports/pending").then(setPending).catch(() => setPending([]));
  }

  async function toggleExpand(reportId) {
    if (expandedId === reportId) {
      setExpandedId(null);
      setDetail(null);
      setEditingId(null);
      return;
    }
    setExpandedId(reportId);
    setDetail(null);
    setEditingId(null);
    const full = await api.get(`/reports/${reportId}/full`);
    setDetail(full);
  }

  async function handleApprove(reportId) {
    setError("");
    setBusy(true);
    try {
      await api.post(`/reports/${reportId}/approve`);
      setExpandedId(null);
      setDetail(null);
      loadPending();
    } catch (err) {
      setError(err.message || "Failed to approve report");
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn(reportId) {
    if (!returnReason.trim()) {
      setError("A reason is required to return a report");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.post(`/reports/${reportId}/return`, { reason: returnReason });
      setReturnReasonFor(null);
      setReturnReason("");
      setExpandedId(null);
      setDetail(null);
      loadPending();
    } catch (err) {
      setError(err.message || "Failed to return report");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(report) {
    setEditForm(buildEditForm(report));
    setEditingId(report.id);
    setEditError("");
    setReturnReasonFor(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditError("");
  }

  async function saveEdit(report) {
    setEditError("");
    setBusy(true);
    try {
      const body = { ...editForm };
      // QS's variationStatus is the one optional select field among the
      // line types — the backend schema accepts it omitted but not as an
      // empty string, which is what an untouched dropdown holds. The
      // original QS submission form already does this same "" -> undefined
      // conversion; this form just never mirrored it, so editing any QS
      // report with an unset variation status failed on every save.
      if (report.type === "QS" && Array.isArray(body.lines)) {
        body.lines = body.lines.map((l) => ({ ...l, variationStatus: l.variationStatus || undefined }));
      }
      const updated = await api.patch(`/reports/${PATCH_PATH[report.type]}/${report.id}`, body);
      setEditingId(null);
      setEditForm(null);
      setDetail((prev) => (prev ? { ...prev, ...updated } : updated));
      const full = await api.get(`/reports/${report.id}/full`);
      setDetail(full);
      loadPending();
    } catch (err) {
      setEditError(err.message || "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Pending Approvals</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {pending.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
            Nothing waiting for review.
          </div>
        )}

        {pending.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleExpand(r.id)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">
                  {TYPE_LABELS[r.type]} · {r.project.name}
                </span>
                <span className="text-xs text-slate-500">{new Date(r.reportDate).toLocaleDateString()}</span>
              </div>
              <div className="text-sm text-slate-500">
                {r.submittedBy.name} · submitted {new Date(r.submittedAt).toLocaleString()}
              </div>
            </button>

            {expandedId === r.id && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {!detail ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : editingId === r.id ? (
                  <>
                    {editError && (
                      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        {editError}
                      </p>
                    )}
                    <EditForm report={detail} form={editForm} setForm={setEditForm} />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(detail)}
                        className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex-1 border border-slate-300 rounded-md py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <ReportDetailView report={detail} />

                    {detail.revisions?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Revision history ({detail.revisions.length})
                        </p>
                        <ul className="space-y-2">
                          {detail.revisions.map((rev) => (
                            <li key={rev.id} className="text-xs bg-amber-50 border border-amber-200 rounded-md p-2">
                              <div className="text-amber-800 font-medium">
                                Returned {new Date(rev.returnedAt).toLocaleString()} by {rev.returnedBy?.name}
                              </div>
                              <div className="text-slate-700">Reason: {rev.reason}</div>
                              <div className="text-slate-500 mt-1">
                                Content at that time: {summarizeSnapshot(rev.snapshot)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {detail.attachments?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Attachments ({detail.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {detail.attachments.map((a) => (
                            <AttachmentThumb key={a.id} attachment={a} />
                          ))}
                        </div>
                      </div>
                    )}

                    {returnReasonFor === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder="Reason for returning this report..."
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReturn(r.id)}
                            className="flex-1 bg-red-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                          >
                            Confirm return
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReturnReasonFor(null);
                              setReturnReason("");
                            }}
                            className="flex-1 border border-slate-300 rounded-md py-2 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleApprove(r.id)}
                          className="flex-1 bg-green-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(detail)}
                          className="flex-1 bg-white border border-slate-300 text-slate-700 rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setReturnReasonFor(r.id)}
                          className="flex-1 bg-white border border-red-300 text-red-700 rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Return for correction
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}

function EditForm({ report, form, setForm }) {
  if (!form) return null;

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLine(idx, key, value) {
    setForm((f) => {
      const lines = f.lines.map((l, i) => (i === idx ? { ...l, [key]: value } : l));
      return { ...f, lines };
    });
  }

  function addLine() {
    const { blank } = LINE_TYPES[report.type];
    setForm((f) => ({ ...f, lines: [...f.lines, { ...blank }] }));
  }

  function removeLine(idx) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  }

  const lineConfig = LINE_TYPES[report.type];

  return (
    <div className="space-y-3">
      <FieldInput
        field={{ key: "reportDate", label: "Report date", type: "date", required: true }}
        value={form.reportDate}
        onChange={(v) => set("reportDate", v)}
      />

      {lineConfig ? (
        <>
          {lineConfig.header.map((f) => (
            <FieldInput key={f.key} field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} />
          ))}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Lines</p>
            {form.lines.map((line, idx) => (
              <div key={idx} className="border border-slate-200 rounded-md p-2 space-y-2">
                {lineConfig.line.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={line[f.key]}
                    onChange={(v) => setLine(idx, f.key, v)}
                    compact
                  />
                ))}
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  className="text-xs text-red-600"
                  disabled={form.lines.length <= 1}
                >
                  Remove line
                </button>
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-xs text-blue-600 font-medium">
              + Add line
            </button>
          </div>
        </>
      ) : (
        (report.type === "FOREMAN" ? FOREMAN_FIELDS : SHE_FIELDS).map((f) => (
          <FieldInput key={f.key} field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} />
        ))
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange, compact }) {
  const labelCls = compact ? "text-xs text-slate-500 block mb-0.5" : "text-sm text-slate-600 block mb-1";
  const inputCls = `w-full rounded-md border border-slate-300 px-2 ${compact ? "py-1.5 text-xs" : "py-2 text-sm"}`;

  return (
    <div>
      <label className={labelCls}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {field.type === "textarea" ? (
        <textarea
          rows={compact ? 2 : 3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      ) : field.type === "select" ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input
          type="number"
          value={value ?? 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={inputCls}
        />
      ) : field.type === "date" ? (
        <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      ) : (
        <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </div>
  );
}

// Short one-line summary of a revision snapshot — the full detail view
// is for the live report; this is just enough to see what changed.
function summarizeSnapshot(snapshot) {
  switch (snapshot.type) {
    case "FOREMAN":
      return snapshot.foremanDetail?.workCompleted || "(no work completed text)";
    case "QS":
      return `${snapshot.qsDetail?.lines?.length || 0} BOQ line(s)`;
    case "SHE":
      return snapshot.sheDetail?.toolboxTalksConducted || "(no toolbox talks text)";
    case "STORES":
      return `${snapshot.storesDetail?.lines?.length || 0} stock line(s)`;
    case "FINANCE":
      return `${snapshot.financeDetail?.lines?.length || 0} transaction line(s)`;
    default:
      return "";
  }
}

// Shows every field the reporter actually filled in — not a trimmed
// summary. The Technical Manager is deciding whether to approve real
// project data; a shortened view here means approving blind.
function ReportDetailView({ report }) {
  switch (report.type) {
    case "FOREMAN": {
      const d = report.foremanDetail;
      return (
        <dl className="text-sm space-y-1">
          <Row label="Site" value={d.siteLocation} />
          <Row label="Electrical Supervisors" value={d.electricalSupervisors} />
          <Row label="Electricians" value={d.electricians} />
          <Row label="Electrical Assistants" value={d.electricalAssistants} />
          <Row label="General Hands" value={d.generalHands} />
          <Row label="SHE officer" value={d.sheOfficersOnSite} />
          <Row label="Total Workforce" value={d.workersOnSite} />
          <Row label="% progress" value={`${d.percentProgress}%`} />
          <Row label="Work completed" value={d.workCompleted} />
          <Row label="Work in progress" value={d.workInProgress} />
          <Row label="Equipment used" value={d.equipmentUsed} />
          <Row label="Materials used" value={d.materialsUsed} />
          <Row label="Materials required" value={d.materialsRequired} />
          <Row label="Constraints" value={d.constraints} />
          <Row label="Instructions received" value={d.instructionsReceived} />
          <Row label="Next day plan" value={d.nextDayPlan} />
        </dl>
      );
    }
    case "QS":
      return (
        <div className="text-sm space-y-2">
          {report.qsDetail.comments && <p className="text-slate-600">{report.qsDetail.comments}</p>}
          {report.qsDetail.commercialIssues && (
            <p className="text-amber-700">Commercial issues: {report.qsDetail.commercialIssues}</p>
          )}
          {report.qsDetail.lines.map((l) => {
            const balanceNegative = Number(l.balanceQuantity) < 0;
            const noContractQty = Number(l.contractQuantity) === 0;
            return (
              <div key={l.id} className="border border-slate-100 rounded-md p-2 space-y-1">
                <div className="font-medium">
                  {l.boqItemNumber} — {l.description}
                </div>
                <Row label="Contract qty" value={l.contractQuantity} />
                <Row label="Qty today" value={l.quantityToday} />
                <Row label="Cumulative qty" value={l.cumulativeQuantity} />
                <Row
                  label="Completion"
                  value={
                    noContractQty ? (
                      <span className="text-amber-600 font-medium">n/a (no contract quantity set)</span>
                    ) : (
                      `${l.percentCompletion}%`
                    )
                  }
                />
                <Row
                  label="Balance"
                  value={
                    <span className={balanceNegative ? "text-red-600 font-medium" : ""}>
                      {l.balanceQuantity}
                      {balanceNegative ? " — more claimed than contracted" : ""}
                    </span>
                  }
                />
                <Row label="Measurements" value={l.measurements} />
                <Row label="Valuation amount" value={l.valuationAmount} />
                <Row label="Variation ref" value={l.variationReference} />
                <Row label="Variation status" value={l.variationStatus} />
                <Row label="Line comments" value={l.comments} />
              </div>
            );
          })}
        </div>
      );
    case "SHE": {
      const d = report.sheDetail;
      return (
        <dl className="text-sm space-y-1">
          <Row label="Workers on site" value={d.workersOnSite} />
          <Row label="Toolbox talks" value={d.toolboxTalksConducted} />
          <Row label="Inspections" value={d.safetyInspections} />
          <Row label="PPE compliance" value={d.ppeCompliance} />
          <Row label="Hazards identified" value={d.hazardsIdentified} />
          <Row label="Corrective actions" value={d.correctiveActions} />
          <Row label="Environmental issues" value={d.environmentalIssues} />
          <Row label="Safety observations" value={d.safetyObservations} />
          <Row label="Incidents / near misses" value={`${d.incidentCount} / ${d.nearMissCount}`} />
          <Row label="Incident description" value={d.incidentsDescription} />
        </dl>
      );
    }
    case "STORES":
      return (
        <div className="text-sm space-y-2">
          {report.storesDetail.shortagesAndRequirements && (
            <p className="text-red-600">Shortage: {report.storesDetail.shortagesAndRequirements}</p>
          )}
          {report.storesDetail.comments && <p className="text-slate-600">{report.storesDetail.comments}</p>}
          {report.storesDetail.lines.map((l) => (
            <div key={l.id} className="border border-slate-100 rounded-md p-2 space-y-1">
              <div className="font-medium">
                {l.itemName} — {l.direction.replace("_", "/")}: {l.quantity} {l.unit || ""}
              </div>
              <Row label="Opening balance" value={l.openingBalance} />
              <Row label="Closing balance" value={l.closingBalance} />
              <Row label="Unit cost" value={l.unitCost} />
              <Row label="Supplier" value={l.supplier} />
              <Row label="Delivery ref" value={l.deliveryReference} />
              <Row label="Notes" value={l.notes} />
            </div>
          ))}
        </div>
      );
    case "FINANCE":
      return (
        <div className="text-sm space-y-2">
          {report.financeDetail.comments && <p className="text-slate-600">{report.financeDetail.comments}</p>}
          {report.financeDetail.lines.map((l) => (
            <div key={l.id} className="border border-slate-100 rounded-md p-2 space-y-1">
              <div className="font-medium">
                {l.type.replace("_", " ")} · {l.category.replace("_", " ")}: {l.amount}
              </div>
              <Row label="Description" value={l.description} />
              <Row label="Payment ref" value={l.paymentReference} />
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
