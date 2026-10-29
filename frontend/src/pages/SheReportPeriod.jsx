import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";

const PERIOD_META = {
  weekly:    { label: "Weekly",    type: "WEEKLY" },
  monthly:   { label: "Monthly",   type: "MONTHLY" },
  quarterly: { label: "Quarterly", type: "QUARTERLY" },
  annual:    { label: "Annual",    type: "ANNUAL" },
};

const DEFAULT_KPI_ROWS = [
  { indicator: "Fatalities",                  performance: "" },
  { indicator: "LTIs - Lost Time Injuries",   performance: "" },
  { indicator: "Medical treatment cases",     performance: "" },
  { indicator: "Near misses reported",        performance: "" },
  { indicator: "Unsafe acts and conditions",  performance: "" },
  { indicator: "Property damage",             performance: "" },
];

function AutoTextarea({ value, onChange, placeholder, minRows = 2, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={minRows}
      className={`w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden ${className}`}
    />
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionCard({ number, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2.5 border-b border-slate-100 flex items-center gap-2">
        {number && (
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {number}
          </span>
        )}
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function BulletEditor({ items, onChange, numbered = false, placeholder = "Type here..." }) {
  const containerRef = useRef(null);

  function updateItem(idx, val) {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  }

  function focusInput(idx) {
    setTimeout(() => {
      const inputs = containerRef.current?.querySelectorAll("input");
      if (inputs) inputs[Math.max(0, Math.min(idx, inputs.length - 1))]?.focus();
    }, 0);
  }

  function handleKeyDown(e, idx) {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...items];
      next.splice(idx + 1, 0, "");
      onChange(next);
      focusInput(idx + 1);
    }
    if (e.key === "Backspace" && items[idx] === "" && items.length > 1) {
      e.preventDefault();
      onChange(items.filter((_, i) => i !== idx));
      focusInput(idx - 1);
    }
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-slate-300 bg-white px-3 py-2 space-y-0.5 focus-within:ring-2 focus-within:ring-blue-500"
    >
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-slate-500 text-sm select-none flex-shrink-0 w-5 text-right">
            {numbered ? `${idx + 1}.` : "•"}
          </span>
          <input
            type="text"
            value={item}
            placeholder={placeholder}
            onChange={(e) => updateItem(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 py-1"
          />
        </div>
      ))}
      <p className="text-xs text-slate-400 pl-6 pt-1">Press Enter to add · Backspace on empty line to remove</p>
    </div>
  );
}

function DynamicList({ items, onChange, placeholder = "Add item...", bullet = false }) {
  function update(idx, val) {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  }
  function add() {
    onChange([...items, ""]);
  }
  function remove(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="mt-2.5 text-sm text-slate-400 w-5 flex-shrink-0 text-center">
            {bullet ? "•" : `${idx + 1}.`}
          </span>
          <input
            type="text"
            value={item}
            onChange={(e) => update(idx, e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {items.length > 1 && (
            <button type="button" onClick={() => remove(idx)} className="mt-1.5 text-slate-400 hover:text-red-500 text-lg leading-none">×</button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-1"
      >
        + Add item
      </button>
    </div>
  );
}

function KpiTable({ rows, onChange }) {
  function updateRow(idx, field, val) {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    onChange(next);
  }
  function addRow() {
    onChange([...rows, { indicator: "", performance: "" }]);
  }
  function removeRow(idx) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Key Performance Indicator</span>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Performance</span>
        <span className="w-6" />
      </div>
      {/* Rows */}
      {rows.map((row, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
          <input
            type="text"
            value={row.indicator}
            onChange={(e) => updateRow(idx, "indicator", e.target.value)}
            placeholder="Indicator"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <AutoTextarea
            value={row.performance}
            onChange={(e) => updateRow(idx, "performance", e.target.value)}
            placeholder="0 or description"
            minRows={1}
          />
          <button type="button" onClick={() => removeRow(idx)} className="mt-2 text-slate-400 hover:text-red-500 text-lg leading-none w-6 text-center">×</button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-1"
      >
        + Add row
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function SheReportPeriod() {
  const { period } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const meta = PERIOD_META[period?.toLowerCase()];

  const [projects, setProjects]   = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reports, setReports]     = useState([]);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());

  // ── Header ──
  const today = new Date().toISOString().slice(0, 10);
  const [weekEnding,  setWeekEnding]  = useState(today);
  const [preparedBy,  setPreparedBy]  = useState(user?.name ?? "");
  const [position,    setPosition]    = useState("SHE Officer");
  const [reportDate,  setReportDate]  = useState(today);

  // ── Section 1 ──
  const [executiveSummary, setExecutiveSummary]   = useState("");
  const [focusNextWeekText, setFocusNextWeekText] = useState("");
  const [keyActivities, setKeyActivities]         = useState([""]);
  const [kpiRows, setKpiRows]                     = useState(DEFAULT_KPI_ROWS.map(r => ({ ...r })));

  // ── Section 2 ──
  const [incidentsText, setIncidentsText] = useState("");

  // ── Section 4a ──
  const [insp4aType,     setInsp4aType]     = useState("House keeping");
  const [insp4aArea,     setInsp4aArea]     = useState("");
  const [insp4aDate,     setInsp4aDate]     = useState("");
  const [insp4aFindings, setInsp4aFindings] = useState("");
  const [insp4aAction,   setInsp4aAction]   = useState("");

  // ── Section 4b PPE ──
  const [insp4bArea,     setInsp4bArea]     = useState("");
  const [insp4bDate,     setInsp4bDate]     = useState("");
  const [insp4bFindings, setInsp4bFindings] = useState("");

  // ── Section 4b Work Monitoring ──
  const [wmArea,     setWmArea]     = useState("");
  const [wmDate,     setWmDate]     = useState("");
  const [wmFindings, setWmFindings] = useState("");
  const [wmAction,   setWmAction]   = useState("");

  // ── Section 5 ──
  const [toolboxTalks, setToolboxTalks] = useState("");

  // ── Section 6 ──
  const [topHazards, setTopHazards] = useState([""]);

  // ── Section 7 ──
  const [focusItems, setFocusItems] = useState([""]);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api
      .get(`/reports/she?projectId=${projectId}`)
      .then((all) => setReports(all.filter((r) => r.sheDetail?.periodType === meta?.type)))
      .catch(() => setReports([]));
  }, [projectId, success, meta?.type]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!projectId) return setError("Please select a project.");
    if (!executiveSummary.trim()) return setError("Executive Summary is required.");

    const periodReportData = {
      weekEnding, preparedBy, position,
      executiveSummary, focusNextWeekText,
      keyActivities: keyActivities.filter(Boolean),
      kpiRows,
      incidentsText,
      inspection4a: { type: insp4aType, area: insp4aArea, date: insp4aDate, findings: insp4aFindings, action: insp4aAction },
      inspection4b: { area: insp4bArea, date: insp4bDate, findings: insp4bFindings },
      workMonitoring: { area: wmArea, date: wmDate, findings: wmFindings, action: wmAction },
      toolboxTalks,
      topHazards: topHazards.filter(Boolean),
      focusItems: focusItems.filter(Boolean),
    };

    const incidentCount = kpiRows.find(r => r.indicator.toLowerCase().includes("lti"))?.performance || "0";
    const nearMissCount = kpiRows.find(r => r.indicator.toLowerCase().includes("near miss"))?.performance || "0";

    setSubmitting(true);
    try {
      await api.post("/reports/she", {
        projectId,
        reportDate,
        periodEnd: weekEnding,
        periodType: meta.type,
        submissionId,
        periodReportData,
        toolboxTalksConducted: toolboxTalks || "See period report",
        incidentCount: parseInt(incidentCount) || 0,
        nearMissCount: parseInt(nearMissCount) || 0,
        incidentsDescription: incidentsText,
        hazardsIdentified: topHazards.filter(Boolean).join(", "),
      });
      setSuccess("Report submitted successfully.");
    } catch (err) {
      if (isNetworkFailure(err)) {
        await queueReport("SHE", {
          projectId, reportDate, periodEnd: weekEnding, periodType: meta.type,
          submissionId, periodReportData,
          toolboxTalksConducted: toolboxTalks || "See period report",
          incidentCount: parseInt(incidentCount) || 0,
          nearMissCount: parseInt(nearMissCount) || 0,
          incidentsDescription: incidentsText,
          hazardsIdentified: topHazards.filter(Boolean).join(", "),
        });
        setSuccess("Saved offline — will sync when back online.");
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!meta) {
    return (
      <div className="p-6">
        <p className="text-red-600">Unknown report period.</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-blue-600 underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top bar */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">SHE Performance {meta.label} Report</h1>
          <p className="text-xs text-slate-500">Safety, Health &amp; Environment</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Report Header ── */}
          <SectionCard title="Report Details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project / Site" required>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={`${meta.label} Ending`} required>
                <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Prepared By" required>
                <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Position">
                <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Date">
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Section 1: Executive Summary ── */}
          <SectionCard number="1" title="Executive Summary">
            <Field label="Executive Summary" required>
              <AutoTextarea
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                placeholder="Write a summary of SHE activities conducted this period..."
                minRows={3}
              />
            </Field>

            <Field label={`Focus Area for Next ${meta.label === "Weekly" ? "Week" : "Period"}`}>
              <AutoTextarea
                value={focusNextWeekText}
                onChange={(e) => setFocusNextWeekText(e.target.value)}
                placeholder="Describe focus areas for the next period..."
                minRows={2}
              />
            </Field>

            <Field label="Key Activities Conducted">
              <BulletEditor items={keyActivities} onChange={setKeyActivities} />
            </Field>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Key SHE Statistics</p>
              <KpiTable rows={kpiRows} onChange={setKpiRows} />
            </div>
          </SectionCard>

          {/* ── Section 2: Incidents ── */}
          <SectionCard number="2" title="Incidents and Investigations">
            <AutoTextarea
              value={incidentsText}
              onChange={(e) => setIncidentsText(e.target.value)}
              placeholder="Describe any incidents or investigations during this period. If none, write 'No incidents recorded'..."
              minRows={3}
            />
          </SectionCard>

          {/* ── Section 4: Inspections ── */}
          <SectionCard number="3" title="Inspections and Audits Done">
            {/* 4a */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">a) General Inspection</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <input type="text" value={insp4aType} onChange={(e) => setInsp4aType(e.target.value)} className={inputCls} placeholder="e.g. Housekeeping" />
                </Field>
                <Field label="Date">
                  <input type="text" value={insp4aDate} onChange={(e) => setInsp4aDate(e.target.value)} className={inputCls} placeholder="e.g. Continuously (everyday)" />
                </Field>
              </div>
              <Field label="Area">
                <input type="text" value={insp4aArea} onChange={(e) => setInsp4aArea(e.target.value)} className={inputCls} placeholder="e.g. All workstations" />
              </Field>
              <Field label="Findings">
                <AutoTextarea value={insp4aFindings} onChange={(e) => setInsp4aFindings(e.target.value)} placeholder="Describe inspection findings..." minRows={2} />
              </Field>
              <Field label="Action">
                <AutoTextarea value={insp4aAction} onChange={(e) => setInsp4aAction(e.target.value)} placeholder="Describe actions taken..." minRows={2} />
              </Field>
            </div>

            <hr className="border-slate-100" />

            {/* 4b PPE */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">b) PPE Compliance Inspection</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Area">
                  <input type="text" value={insp4bArea} onChange={(e) => setInsp4bArea(e.target.value)} className={inputCls} placeholder="e.g. All workstations" />
                </Field>
                <Field label="Date">
                  <input type="text" value={insp4bDate} onChange={(e) => setInsp4bDate(e.target.value)} className={inputCls} placeholder="e.g. Continuously (everyday)" />
                </Field>
              </div>
              <Field label="Findings">
                <AutoTextarea value={insp4bFindings} onChange={(e) => setInsp4bFindings(e.target.value)} placeholder="PPE compliance findings..." minRows={2} />
              </Field>
            </div>

            <hr className="border-slate-100" />

            {/* Work Monitoring */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Work Monitoring</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Area">
                  <input type="text" value={wmArea} onChange={(e) => setWmArea(e.target.value)} className={inputCls} placeholder="e.g. All workstations" />
                </Field>
                <Field label="Date">
                  <input type="text" value={wmDate} onChange={(e) => setWmDate(e.target.value)} className={inputCls} placeholder="e.g. Continuously (everyday)" />
                </Field>
              </div>
              <Field label="Findings">
                <AutoTextarea value={wmFindings} onChange={(e) => setWmFindings(e.target.value)} placeholder="Work monitoring findings..." minRows={2} />
              </Field>
              <Field label="Action">
                <AutoTextarea value={wmAction} onChange={(e) => setWmAction(e.target.value)} placeholder="Actions taken..." minRows={2} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Section 5: Training ── */}
          <SectionCard number="4" title="Training and Meetings">
            <Field label="Toolbox Talks">
              <AutoTextarea
                value={toolboxTalks}
                onChange={(e) => setToolboxTalks(e.target.value)}
                placeholder="Topics covered during toolbox talks this period..."
                minRows={2}
              />
            </Field>
          </SectionCard>

          {/* ── Section 6: Hazards ── */}
          <SectionCard number="5" title={`Top Hazards Identified This ${meta.label === "Weekly" ? "Week" : "Period"}`}>
            <BulletEditor
              items={topHazards}
              onChange={setTopHazards}
              numbered
              placeholder="Describe hazard..."
            />
          </SectionCard>

          {/* ── Section 7: Focus Next ── */}
          <SectionCard number="6" title={`Focus for Next ${meta.label === "Weekly" ? "Week" : "Period"}`}>
            <BulletEditor
              items={focusItems}
              onChange={setFocusItems}
              numbered
              placeholder="Focus item..."
            />
          </SectionCard>

          {/* ── Footer / Submission ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Submitted By">
                <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Date">
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors"
          >
            {submitting ? "Submitting..." : `Submit ${meta.label} SHE Report`}
          </button>
        </form>

        {/* Past reports */}
        {reports.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2.5 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Past {meta.label} Reports</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {reports.slice(0, 10).map((r) => {
                const d = r.sheDetail?.periodReportData;
                const ending = d?.weekEnding
                  ? new Date(d.weekEnding).toLocaleDateString()
                  : new Date(r.reportDate).toLocaleDateString();
                const statusColors = {
                  SUBMITTED: "bg-amber-100 text-amber-800",
                  APPROVED:  "bg-green-100 text-green-800",
                  RETURNED:  "bg-red-100 text-red-800",
                };
                return (
                  <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{meta.label} ending {ending}</p>
                      <p className="text-xs text-slate-500">{d?.preparedBy ?? ""}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColors[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {r.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
