import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const EMPTY_FORM = {
  reportDate: new Date().toISOString().slice(0, 10),
  toolboxTalksConducted: "",
  safetyInspections: "",
  ppeCompliance: "",
  correctiveActions: "",
  incidentCount: 0,
  nearMissCount: 0,
  incidentsDescription: "",
};

const NUMBER_FIELDS = ["incidentCount", "nearMissCount"];

export default function SheReport() {
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
    api.get(`/reports/she?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
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
      await api.post("/reports/she", body);
      setSuccess("SHE report submitted.");
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
          <p className="text-sm text-slate-500">SHE Report</p>
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

          <TextArea
            label="Toolbox talks conducted"
            value={form.toolboxTalksConducted}
            onChange={(v) => updateField("toolboxTalksConducted", v)}
            required
          />
          <TextArea label="Safety inspections" value={form.safetyInspections} onChange={(v) => updateField("safetyInspections", v)} />
          <TextArea label="PPE compliance" value={form.ppeCompliance} onChange={(v) => updateField("ppeCompliance", v)} />
          <TextArea label="Corrective actions" value={form.correctiveActions} onChange={(v) => updateField("correctiveActions", v)} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Incidents &amp; near misses</label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Incidents</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.incidentCount}
                  onChange={(e) => updateField("incidentCount", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Near misses</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.nearMissCount}
                  onChange={(e) => updateField("nearMissCount", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
            </div>
            <TextArea label="Description (if any)" value={form.incidentsDescription} onChange={(v) => updateField("incidentsDescription", v)} />
          </div>

          <button
            type="submit"
            disabled={submitting || !projectId}
            className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit SHE report"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent SHE reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <span className="font-medium">{new Date(r.reportDate).toLocaleDateString()}</span>
                {" · "}
                {r.sheDetail?.incidentCount ?? 0} incidents, {r.sheDetail?.nearMissCount ?? 0} near misses · {r.status}
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
