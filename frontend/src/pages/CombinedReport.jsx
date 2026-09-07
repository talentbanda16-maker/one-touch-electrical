import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const PRESETS = [
  { label: "Daily", days: 0 },
  { label: "Weekly", days: 6 },
  { label: "Monthly", days: 29 },
];

export default function CombinedReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [mainContractor, setMainContractor] = useState("");
  const [reportDate, setReportDate] = useState(defaultTo());
  const [recommendations, setRecommendations] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) {
        setProjectId(data[0].id);
        setMainContractor(data[0].mainContractor || "");
      }
    });
  }, []);

  function selectProject(id) {
    setProjectId(id);
    const p = projects.find((pr) => pr.id === id);
    setMainContractor(p?.mainContractor || "");
  }

  async function handleExport(format) {
    if (!projectId) return;
    setError("");
    setDownloading(format);
    try {
      const params = new URLSearchParams({ from, to, format, reportDate });
      if (recommendations.trim()) params.set("recommendations", recommendations.trim());
      if (mainContractor.trim()) params.set("mainContractor", mainContractor.trim());
      await api.download(`/projects/${projectId}/combined-report?${params.toString()}`, `combined-report.${format}`);
    } catch (err) {
      setError(err.message || "Failed to generate report");
    } finally {
      setDownloading(null);
    }
  }

  function applyPreset(days) {
    setFrom(toIso(daysAgo(days)));
    setTo(toIso(new Date()));
  }

  const rangeInvalid = from && to && from > to;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Combined Report</p>
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
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => selectProject(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Main contractor</label>
              <input
                type="text"
                value={mainContractor}
                onChange={(e) => setMainContractor(e.target.value)}
                placeholder="—"
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Report date</label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quick range</label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.days)}
                  className="bg-white border border-slate-300 text-slate-700 rounded-md py-2 text-sm"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Management recommendations (optional)</label>
            <textarea
              rows={3}
              placeholder="Any commentary or recommendations to include in the report..."
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          {rangeInvalid && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              "From" date must be before "To" date.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          <p className="text-xs text-slate-400">
            Pulls every approved Foreman, QS, SHE, Stores and Finance report for this project in the selected range,
            plus instructions issued, outstanding actions and site photos, into a single report with a cover page,
            progress/budget graphs and a sign-off section.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleExport("pdf")}
              disabled={!projectId || rangeInvalid || downloading !== null}
              className="bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
            >
              {downloading === "pdf" ? "Generating..." : "Export PDF"}
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              disabled={!projectId || rangeInvalid || downloading !== null}
              className="bg-green-700 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
            >
              {downloading === "xlsx" ? "Generating..." : "Export Excel"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
