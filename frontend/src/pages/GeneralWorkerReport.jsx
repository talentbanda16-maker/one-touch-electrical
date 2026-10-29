import { useEffect, useState } from "react";
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
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="border border-slate-200 rounded-md p-2 space-y-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-slate-500 block mb-0.5">{f.label}</label>
              <input
                type={f.type || "text"}
                value={row[f.key] ?? ""}
                onChange={(e) => updateRow(i, f.key, e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
          <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-600">
            Remove row
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-blue-600 font-medium">
        + {addLabel}
      </button>
    </div>
  );
}

const EMPTY_FORM = {
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
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
      };
      await api.post("/productivity-reports", payload);
      setSuccess("Daily productivity report submitted.");
      setForm(EMPTY_FORM);
      loadReports();
    } catch (err) {
      setError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
        {success && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{success}</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-3 text-base">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>
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
              <Field label="Achievement %" type="number" value={form.overallAchievementPercent} onChange={(v) => set("overallAchievementPercent", v)} />
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Work completed to required standard?</label>
            <select value={form.qualityStandardMet} onChange={(e) => set("qualityStandardMet", e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-2">
              <option value="">—</option>
              {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Field label="Rework details" value={form.reworkDetails} onChange={(v) => set("reworkDetails", v)} />
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
            {form.overtimeRequested && (
              <div className="space-y-2">
                <Field label="Hours requested" type="number" value={form.overtimeHoursRequested} onChange={(v) => set("overtimeHoursRequested", v)} />
                <Field label="Reason for overtime" value={form.overtimeReason} onChange={(v) => set("overtimeReason", v)} />
                <Field label="Expected output during overtime" value={form.expectedOvertimeOutput} onChange={(v) => set("expectedOvertimeOutput", v)} />
              </div>
            )}
          </Section>

          <Section title="H. Tomorrow's plan">
            <LineTable fields={TOMORROW_FIELDS} rows={form.tomorrowPlan} onChange={(v) => set("tomorrowPlan", v)} addLabel="Add planned task" />
          </Section>

          <Section title="I. Employee declaration">
            <p className="text-xs text-slate-500 mb-2">
              I confirm that the information in this report is accurate and represents the work performed during the working day.
            </p>
            <Field label="Employee name (signature)" required value={form.employeeSignatureName} onChange={(v) => set("employeeSignatureName", v)} />
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
