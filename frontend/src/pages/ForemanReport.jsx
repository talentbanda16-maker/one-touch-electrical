import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const EMPTY_FORM = {
  reportDate: new Date().toISOString().slice(0, 10),
  siteLocation: "",
  workersOnSite: 0,
  labourSkilled: 0,
  labourUnskilled: 0,
  labourSubcontractor: 0,
  workCompleted: "",
  workInProgress: "",
  percentProgress: 0,
  equipmentUsed: "",
  materialsUsed: "",
  materialsRequired: "",
  constraints: "",
  instructionsReceived: "",
  nextDayPlan: "",
};

const NUMBER_FIELDS = ["workersOnSite", "labourSkilled", "labourUnskilled", "labourSubcontractor", "percentProgress"];

export default function ForemanReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
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
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/reports/foreman?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const body = { ...form, projectId, submissionId: crypto.randomUUID() };
      for (const field of NUMBER_FIELDS) {
        body[field] = Number(body[field]) || 0;
      }
      await api.post("/reports/foreman", body);
      setSuccess("Report submitted.");
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Daily Foreman Report</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Report date</label>
            <input
              type="date"
              required
              value={form.reportDate}
              onChange={(e) => updateField("reportDate", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site / location</label>
            <input
              type="text"
              value={form.siteLocation}
              onChange={(e) => updateField("siteLocation", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Workers on site</label>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.workersOnSite}
                onChange={(e) => updateField("workersOnSite", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">% progress</label>
              <input
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={form.percentProgress}
                onChange={(e) => updateField("percentProgress", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Labour breakdown</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Skilled</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.labourSkilled}
                  onChange={(e) => updateField("labourSkilled", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Unskilled</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.labourUnskilled}
                  onChange={(e) => updateField("labourUnskilled", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Subcontractor</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.labourSubcontractor}
                  onChange={(e) => updateField("labourSubcontractor", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
            </div>
          </div>

          <TextArea
            label="Work completed today"
            value={form.workCompleted}
            onChange={(v) => updateField("workCompleted", v)}
            required
          />
          <TextArea label="Work in progress" value={form.workInProgress} onChange={(v) => updateField("workInProgress", v)} />
          <TextArea label="Equipment / plant used" value={form.equipmentUsed} onChange={(v) => updateField("equipmentUsed", v)} />
          <TextArea label="Materials used" value={form.materialsUsed} onChange={(v) => updateField("materialsUsed", v)} />
          <TextArea label="Materials required" value={form.materialsRequired} onChange={(v) => updateField("materialsRequired", v)} />
          <TextArea label="Problems, delays and constraints" value={form.constraints} onChange={(v) => updateField("constraints", v)} />
          <TextArea label="Instructions received" value={form.instructionsReceived} onChange={(v) => updateField("instructionsReceived", v)} />
          <TextArea label="Planned activities for tomorrow" value={form.nextDayPlan} onChange={(v) => updateField("nextDayPlan", v)} />

          <button
            type="submit"
            disabled={submitting || !projectId}
            className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit report"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <span className="font-medium">{new Date(r.reportDate).toLocaleDateString()}</span>
                {" · "}
                {r.foremanDetail?.percentProgress}% progress · {r.status}
                {r.submittedBy?.name ? ` · ${r.submittedBy.name}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

function TextArea({ label, value, onChange, required = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <textarea
        rows={2}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
      />
    </div>
  );
}
