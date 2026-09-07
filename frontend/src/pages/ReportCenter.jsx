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

const REPORT_TYPES = [
  { value: "progress", label: "Project progress report" },
  { value: "financial", label: "Project financial report" },
  { value: "department", label: "Department-specific report" },
];

const DEPARTMENTS = [
  { value: "FOREMAN", label: "Foreman" },
  { value: "QS", label: "QS" },
  { value: "SHE", label: "SHE" },
  { value: "STORES", label: "Stores" },
  { value: "FINANCE", label: "Finance" },
];

// Management can't download the file for any of these, but every one of
// them already has a live, on-screen equivalent — the same analytics
// pages the Technical Manager dashboard links to — so "can't print"
// doesn't mean "can't read."
const DEPARTMENT_ANALYTICS_ROUTES = {
  FOREMAN: "/analytics/foreman",
  QS: "/analytics/qs",
  SHE: "/analytics/she",
  STORES: "/analytics/stores",
  FINANCE: "/analytics/finance",
};

export default function ReportCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPrivileged = user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT";
  const isManagement = user?.role === "MANAGEMENT";
  const reportTypes = isPrivileged ? REPORT_TYPES : REPORT_TYPES.filter((t) => t.value !== "financial");
  const departments = isPrivileged ? DEPARTMENTS : DEPARTMENTS.filter((d) => d.value !== "FINANCE");

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportType, setReportType] = useState("progress");
  const [department, setDepartment] = useState("FOREMAN");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  function applyPreset(days) {
    setFrom(toIso(daysAgo(days)));
    setTo(toIso(new Date()));
  }

  async function handleExport(format) {
    if (!projectId) return;
    setError("");
    setDownloading(format);
    try {
      const params = new URLSearchParams({ from, to, format });
      let path = `/projects/${projectId}/reports/${reportType}`;
      if (reportType === "department") {
        params.set("department", department);
      }
      await api.download(`${path}?${params.toString()}`, `report.${format}`);
    } catch (err) {
      setError(err.message || "Failed to generate report");
    } finally {
      setDownloading(null);
    }
  }

  const rangeInvalid = from && to && from > to;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Report Center</p>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Report type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            >
              {reportTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

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

          {reportType === "department" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          {rangeInvalid && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              "From" date must be before "To" date.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          {isManagement ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-3 text-center">
                Management can't generate or download the file itself — that stays with the Technical Manager. The
                same information is available to read on screen below.
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    reportType === "progress"
                      ? "/analytics"
                      : reportType === "financial"
                      ? "/analytics/finance"
                      : DEPARTMENT_ANALYTICS_ROUTES[department]
                  )
                }
                className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium"
              >
                View this report on screen
              </button>
            </div>
          ) : (
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
          )}
        </div>

        {!isManagement && (
          <button
            onClick={() => navigate("/reports/combined")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Combined management report instead
          </button>
        )}
      </main>
    </div>
  );
}
