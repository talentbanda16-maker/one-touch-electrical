import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

import {
  QUALITY_OPTIONS,
  DELAY_CATEGORIES,
  WORK_TARGET_FIELDS,
  NOT_COMPLETED_FIELDS,
  DELAY_FIELDS,
  MATERIALS_FIELDS,
  TOMORROW_FIELDS,
  PRODUCTIVITY_RATINGS,
  DELAY_JUSTIFIED,
  OVERTIME_RECOMMENDATIONS,
  MANAGEMENT_ACTIONS,
} from "../lib/productivityOptions";

function LineTable({ fields, rows, onChange, addLabel }) {
  function updateRow(i, key, value) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  function addRow() {
    onChange([...rows, Object.fromEntries(fields.map((f) => [f.key, ""]))]);
  }
  function removeRow(i) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      {fields.length >= 5 && (
        <p className="text-[11px] text-slate-400 mb-1">⇆ Swipe the table sideways to reach all columns.</p>
      )}
      <div className="overflow-x-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm border-collapse" style={{ minWidth: `${fields.length * 95 + 55}px` }}>
          <thead>
            <tr className="bg-slate-100 text-xs text-slate-600">
              <th className="border border-slate-200 px-2 py-1.5 w-8 text-center">#</th>
              {fields.map((f) => (
                <th key={f.key} className="border border-slate-200 px-2 py-1.5 text-left font-medium whitespace-nowrap">{f.label}</th>
              ))}
              <th className="border border-slate-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={fields.length + 2} className="border border-slate-200 px-2 py-3 text-center text-slate-400 text-xs">No rows yet — tap “+ {addLabel}”.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="border border-slate-200 px-1 py-1 text-center text-xs text-slate-500">{i + 1}</td>
                {fields.map((f) => (
                  <td key={f.key} className="border border-slate-200 px-1 py-1 align-top">
                    {f.type === "number" || f.type === "time" ? (
                      <input
                        type={f.type}
                        value={row[f.key] ?? ""}
                        onChange={(e) => updateRow(i, f.key, e.target.value)}
                        className="w-full min-w-[68px] rounded border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : (
                      <textarea
                        rows={2}
                        value={row[f.key] ?? ""}
                        onChange={(e) => updateRow(i, f.key, e.target.value)}
                        onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                        className="w-full min-w-[150px] rounded border-0 px-1.5 py-1 text-sm leading-snug resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    )}
                  </td>
                ))}
                <td className="border border-slate-200 px-1 py-1 text-center">
                  <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="text-xs text-blue-600 font-medium mt-1.5">
        + {addLabel}
      </button>
    </div>
  );
}

const EMPTY_FORM = {
  employeeName: "",
  employeeIdNumber: "",
  department: "",
  position: "",
  siteLocation: "",
  supervisorName: "",
  shift: "",
  workTargets: [],
  totalTarget: "",
  totalCompleted: "",
  overallAchievementPercent: "",
  workCompletedToday: "",
  workNotCompleted: [],
  delayExperienced: false,
  totalDelayHours: "",
  delays: [],
  delayCategories: [],
  materialsRequired: [],
  qualityStandardMet: "",
  reworkDetails: "",
  normalHours: "",
  actualHoursWorked: "",
  productiveHours: "",
  delayHours: "",
  overtimeRequested: false,
  overtimeHoursRequested: "",
  overtimeReason: "",
  expectedOvertimeOutput: "",
  tomorrowPlan: [],
  employeeSignatureName: "",
  // J–L (supervisor / foreman)
  targetAchievementPercent: "",
  productivityRating: "",
  delayJustified: "",
  overtimeRecommendation: "",
  supervisorComments: "",
  supervisorSignatureName: "",
  productivityScore: "",
  overtimeHoursApproved: "",
  overtimeCost: "",
  managementActions: [],
};

const STATUS_LABELS = { SUBMITTED: "Awaiting supervisor review", SUPERVISOR_REVIEWED: "Awaiting TM sign-off", COMPLETED: "Completed" };

export default function GeneralWorkerReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState(EMPTY_FORM);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastId, setLastId] = useState(null);
  const [signing, setSigning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.name) setForm((f) => (f.employeeName ? f : { ...f, employeeName: user.name }));
  }, [user]);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length === 0) return;
      let saved = "";
      try { saved = localStorage.getItem("active_project") || ""; } catch { /* ignore */ }
      const match = data.find((p) => p.id === saved);
      setProjectId((cur) => cur || (match ? match.id : data[0].id));
    });
    loadReports();
  }, []);

  function loadReports() {
    api.get("/productivity-reports").then(setReports).catch(() => setReports([]));
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleDelayCategory(cat) {
    setForm((f) => ({
      ...f,
      delayCategories: f.delayCategories.includes(cat)
        ? f.delayCategories.filter((c) => c !== cat)
        : [...f.delayCategories, cat],
    }));
  }

  function num(v) {
    if (v === "" || v == null) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const payload = {
        projectId,
        reportDate,
        employeeName: (form.employeeName || user?.name) || undefined,
        employeeIdNumber: form.employeeIdNumber || undefined,
        department: form.department || undefined,
        position: form.position || undefined,
        siteLocation: form.siteLocation || undefined,
        supervisorName: form.supervisorName || undefined,
        shift: form.shift || undefined,
        workTargets: form.workTargets,
        totalTarget: num(form.totalTarget),
        totalCompleted: num(form.totalCompleted),
        overallAchievementPercent: num(form.overallAchievementPercent),
        workCompletedToday: form.workCompletedToday || undefined,
        workNotCompleted: form.workNotCompleted,
        delayExperienced: form.delayExperienced,
        totalDelayHours: num(form.totalDelayHours),
        delays: form.delays,
        delayCategories: form.delayCategories,
        materialsRequired: form.materialsRequired,
        qualityStandardMet: form.qualityStandardMet || undefined,
        reworkDetails: form.reworkDetails || undefined,
        normalHours: num(form.normalHours),
        actualHoursWorked: num(form.actualHoursWorked),
        productiveHours: num(form.productiveHours),
        delayHours: num(form.delayHours),
        overtimeRequested: form.overtimeRequested,
        overtimeHoursRequested: num(form.overtimeHoursRequested),
        overtimeReason: form.overtimeReason || undefined,
        expectedOvertimeOutput: form.expectedOvertimeOutput || undefined,
        tomorrowPlan: form.tomorrowPlan,
        employeeSignatureName: form.employeeSignatureName,
        // J–L (Foreman)
        targetAchievementPercent: num(form.targetAchievementPercent),
        productivityRating: form.productivityRating || undefined,
        delayJustified: form.delayJustified || undefined,
        overtimeRecommendation: form.overtimeRecommendation || undefined,
        supervisorComments: form.supervisorComments || undefined,
        supervisorSignatureName: form.supervisorSignatureName || undefined,
        productivityScore: num(form.productivityScore),
        overtimeHoursApproved: num(form.overtimeHoursApproved),
        overtimeCost: num(form.overtimeCost),
        managementActions: form.managementActions,
      };
      const created = await api.post("/productivity-reports", payload);
      setSuccess(form.supervisorSignatureName ? "Report completed and saved." : "Daily productivity report submitted.");
      setLastId(created?.id || null);
      setForm(EMPTY_FORM);
      loadReports();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {signing && <SignaturePad onSave={(sig) => { set(signing, sig); setSigning(null); }} onClose={() => setSigning(null)} />}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Daily Productivity Report</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors">
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
            <span>{success}</span>
            {lastId && (
              <Link to={`/productivity/${lastId}/print`} target="_blank" className="font-semibold text-green-800 underline shrink-0">
                👁 View full report
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="text-center border-b-2 border-brand-900 pb-3 -mt-1">
            <img src="/logo.png" alt="One Touch Electrical Services" className="h-14 mx-auto mb-2 object-contain" />
            <h1 className="text-lg font-bold tracking-wide text-brand-900">ONE TOUCH ELECTRICAL SERVICES</h1>
            <h2 className="text-xs font-semibold tracking-wider text-slate-500 mt-0.5">DAILY EMPLOYEE PRODUCTIVITY &amp; WORK REPORT</h2>
          </div>

          {/* Project comes from the Foreman's active project — the dropdown only
              shows if none is set yet. */}
          {!projectId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-3 text-base">
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input type="date" required value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-3 text-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Employee ID" value={form.employeeIdNumber} onChange={(v) => set("employeeIdNumber", v)} />
            <Field label="Department" value={form.department} onChange={(v) => set("department", v)} />
            <Field label="Position" value={form.position} onChange={(v) => set("position", v)} />
            <Field label="Shift" value={form.shift} onChange={(v) => set("shift", v)} />
            <Field label="Site" value={form.siteLocation} onChange={(v) => set("siteLocation", v)} />
            <Field label="Supervisor" value={form.supervisorName} onChange={(v) => set("supervisorName", v)} />
          </div>

          <Section title="A. Daily work targets">
            <LineTable fields={WORK_TARGET_FIELDS} rows={form.workTargets} onChange={(v) => set("workTargets", v)} addLabel="Add task" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Field label="Total target" type="number" value={form.totalTarget} onChange={(v) => set("totalTarget", v)} />
              <Field label="Total completed" type="number" value={form.totalCompleted} onChange={(v) => set("totalCompleted", v)} />
              <Field label="Overall Achievement" type="number" value={form.overallAchievementPercent} onChange={(v) => set("overallAchievementPercent", v)} />
            </div>
          </Section>

          <Section title="B. Work completed today">
            <textarea rows={3} value={form.workCompletedToday} onChange={(e) => set("workCompletedToday", e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Section>

          <Section title="C. Work not completed">
            <LineTable fields={NOT_COMPLETED_FIELDS} rows={form.workNotCompleted} onChange={(v) => set("workNotCompleted", v)} addLabel="Add item" />
          </Section>

          <Section title="D. Delays / time lost">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={form.delayExperienced} onChange={(e) => set("delayExperienced", e.target.checked)} />
              Delay experienced today
            </label>
            <Field label="Total delay (hrs)" type="number" value={form.totalDelayHours} onChange={(v) => set("totalDelayHours", v)} />
            <div className="mt-2">
              <LineTable fields={DELAY_FIELDS} rows={form.delays} onChange={(v) => set("delays", v)} addLabel="Add delay" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {DELAY_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs border border-slate-300 rounded-full px-2 py-1">
                  <input type="checkbox" checked={form.delayCategories.includes(c)} onChange={() => toggleDelayCategory(c)} />
                  {c.replace("_", " ")}
                </label>
              ))}
            </div>
          </Section>

          <Section title="E. Materials / tools required">
            <LineTable fields={MATERIALS_FIELDS} rows={form.materialsRequired} onChange={(v) => set("materialsRequired", v)} addLabel="Add item" />
          </Section>

          <Section title="F. Quality check">
            <label className="block text-sm font-medium text-slate-700 mb-2">Work completed to required standard?</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {QUALITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set("qualityStandardMet", form.qualityStandardMet === o.value ? "" : o.value)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    form.qualityStandardMet === o.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Field label="Rework" value={form.reworkDetails} onChange={(v) => set("reworkDetails", v)} />
            <div className="mt-2 opacity-70">
              <label className="block text-xs text-slate-500 mb-1">Supervisor comments <span className="italic">(completed by the supervisor)</span></label>
              <textarea disabled rows={2} className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
          </Section>

          <Section title="G. End-of-day summary">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Normal hours" type="number" value={form.normalHours} onChange={(v) => set("normalHours", v)} />
              <Field label="Actual hours worked" type="number" value={form.actualHoursWorked} onChange={(v) => set("actualHoursWorked", v)} />
              <Field label="Productive hours" type="number" value={form.productiveHours} onChange={(v) => set("productiveHours", v)} />
              <Field label="Delay hours" type="number" value={form.delayHours} onChange={(v) => set("delayHours", v)} />
            </div>
            <label className="flex items-center gap-2 text-sm my-2">
              <input type="checkbox" checked={form.overtimeRequested} onChange={(e) => set("overtimeRequested", e.target.checked)} />
              Overtime requested
            </label>
            <div className="space-y-2">
              <Field label="Hours requested" type="number" value={form.overtimeHoursRequested} onChange={(v) => set("overtimeHoursRequested", v)} />
              <Field label="Reason for overtime" value={form.overtimeReason} onChange={(v) => set("overtimeReason", v)} />
              <Field label="Expected output during overtime" value={form.expectedOvertimeOutput} onChange={(v) => set("expectedOvertimeOutput", v)} />
            </div>
          </Section>

          <Section title="H. Tomorrow's plan">
            <LineTable fields={TOMORROW_FIELDS} rows={form.tomorrowPlan} onChange={(v) => set("tomorrowPlan", v)} addLabel="Add planned task" />
          </Section>

          <Section title="I. Employee declaration">
            <p className="text-xs text-slate-500 mb-3">
              I confirm that the information in this report is accurate and represents the work performed during the working day.
            </p>

            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee name</label>
              <input
                value={form.employeeName}
                onChange={(e) => set("employeeName", e.target.value)}
                placeholder={user?.name || "Employee name"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1">Signature <span className="text-red-600">*</span></label>
            {form.employeeSignatureName && form.employeeSignatureName.startsWith("data:") ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSigning("employeeSignatureName")} className="flex-1 h-20 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
                  <img src={form.employeeSignatureName} alt="signature" className="max-h-16 object-contain" />
                </button>
                <button type="button" onClick={() => set("employeeSignatureName", "")} className="text-xs text-red-400 hover:text-red-600">Clear</button>
              </div>
            ) : (
              <button type="button" onClick={() => setSigning("employeeSignatureName")} className="w-full h-20 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                ✍️ Tap to sign
              </button>
            )}

            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Time submitted</label>
              <input value="Recorded automatically when you submit" disabled className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 italic" />
            </div>
          </Section>

          {/* J–L: filled by the Foreman (the supervisor responsible). */}
          <Section title="J. Supervisor review">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Target achievement %" type="number" value={form.targetAchievementPercent} onChange={(v) => set("targetAchievementPercent", v)} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Delay justified?</label>
                <div className="flex flex-wrap gap-2">
                  {DELAY_JUSTIFIED.map((o) => (
                    <button key={o} type="button" onClick={() => set("delayJustified", form.delayJustified === o ? "" : o)}
                      className={`text-sm px-3 py-1.5 rounded-full border ${form.delayJustified === o ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"}`}>
                      {o.charAt(0) + o.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Productivity rating</label>
              <div className="flex flex-wrap gap-2">
                {PRODUCTIVITY_RATINGS.map((o) => (
                  <button key={o.value} type="button" onClick={() => set("productivityRating", form.productivityRating === o.value ? "" : o.value)}
                    className={`text-sm px-3 py-1.5 rounded-full border ${form.productivityRating === o.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Overtime recommendation</label>
              <div className="flex flex-wrap gap-2">
                {OVERTIME_RECOMMENDATIONS.map((o) => (
                  <button key={o.value} type="button" onClick={() => set("overtimeRecommendation", form.overtimeRecommendation === o.value ? "" : o.value)}
                    className={`text-sm px-3 py-1.5 rounded-full border ${form.overtimeRecommendation === o.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Field label="Supervisor comments" value={form.supervisorComments} onChange={(v) => set("supervisorComments", v)} />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Supervisor signature</label>
              {form.supervisorSignatureName && form.supervisorSignatureName.startsWith("data:") ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSigning("supervisorSignatureName")} className="flex-1 h-20 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
                    <img src={form.supervisorSignatureName} alt="signature" className="max-h-16 object-contain" />
                  </button>
                  <button type="button" onClick={() => set("supervisorSignatureName", "")} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                </div>
              ) : (
                <button type="button" onClick={() => setSigning("supervisorSignatureName")} className="w-full h-20 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                  ✍️ Tap to sign
                </button>
              )}
            </div>
          </Section>

          <Section title="K. Daily productivity control">
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-xs text-slate-600">
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Metric</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left w-44">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Target achievement</td>
                    <td className="border border-slate-200 px-2 py-2 text-slate-600">{form.targetAchievementPercent !== "" ? `${form.targetAchievementPercent} %` : "— %"}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Productivity score</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input type="number" value={form.productivityScore} onChange={(e) => set("productivityScore", e.target.value)} className="w-full min-w-[60px] rounded border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <span className="text-xs text-slate-400 whitespace-nowrap">/ 100</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Productive hours</td>
                    <td className="border border-slate-200 px-2 py-2 text-slate-600">{form.productiveHours !== "" ? `${form.productiveHours} hrs` : "— hrs"}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Delay hours</td>
                    <td className="border border-slate-200 px-2 py-2 text-slate-600">{form.delayHours !== "" ? `${form.delayHours} hrs` : "— hrs"}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Overtime hours approved</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input type="number" value={form.overtimeHoursApproved} onChange={(e) => set("overtimeHoursApproved", e.target.value)} className="w-full min-w-[60px] rounded border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <span className="text-xs text-slate-400 whitespace-nowrap">hrs</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2">Overtime cost</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">$</span>
                        <input type="number" value={form.overtimeCost} onChange={(e) => set("overtimeCost", e.target.value)} className="w-full min-w-[60px] rounded border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Target achievement, productive &amp; delay hours come from sections J and G.</p>
          </Section>

          <Section title="L. Management action / follow-up">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {MANAGEMENT_ACTIONS.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.managementActions.includes(a.value)}
                    onChange={() => set("managementActions", form.managementActions.includes(a.value)
                      ? form.managementActions.filter((x) => x !== a.value)
                      : [...form.managementActions, a.value])}
                  />
                  {a.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Report measurable output and reasons for delays. Overtime must be approved before it is worked, except where management authorises an emergency exception.
            </p>
          </Section>

          <button type="submit" disabled={submitting || !projectId} className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60">
            {submitting ? "Submitting..." : "Submit report"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">My past submissions</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{new Date(r.reportDate).toLocaleDateString()} · {r.project.name}</div>
                  <div className="text-slate-500">{STATUS_LABELS[r.status] || r.status}</div>
                </div>
                <Link to={`/productivity/${r.id}/print`} target="_blank" className="text-xs text-blue-600 font-medium shrink-0">
                  View report
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function start(e) { e.preventDefault(); drawing.current = true; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { e.preventDefault(); if (!drawing.current) return; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end(e) { e.preventDefault(); drawing.current = false; }
  function clear() { const c = canvasRef.current; const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <p className="text-sm font-bold text-slate-800">Sign here</p>
        <canvas ref={canvasRef} width={340} height={140}
          className="w-full border-2 border-slate-300 rounded-xl touch-none cursor-crosshair" style={{ background: "#fff" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="flex gap-2">
          <button onClick={clear} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Clear</button>
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(canvasRef.current.toDataURL("image/png"))} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <h2 className="text-sm font-semibold text-slate-800 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return (
    <div>
      <label className="text-sm text-slate-600 block mb-1">{label}{required && " *"}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
