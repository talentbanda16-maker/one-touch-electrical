import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../api";

function iso(d) { return d.toISOString().slice(0, 10); }
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}
// Pull a field from the rich formData, falling back to the old scalar column.
function detailOf(r) {
  const d = r.foremanDetail || {};
  const f = d.formData && typeof d.formData === "object" ? d.formData : {};
  return {
    progress: d.percentProgress ?? 0,
    workers: d.workersOnSite ?? 0,
    workCompleted: f.workCompleted || d.workCompleted || "",
    materials: Array.isArray(f.materials) ? f.materials.filter((m) => m.material).map((m) => `${m.material}${m.qtyUsed ? ` (used ${m.qtyUsed})` : ""}`).join("; ") : (d.materialsUsed || ""),
    incidents: f.incidentsNearMisses || "",
    problems: f.problemsDelaysConstraints || d.constraints || "",
    weather: f.weather || "",
  };
}

export default function ForemanReportsCompile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const today = new Date();
  const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 6);
  const [from, setFrom] = useState(iso(weekAgo));
  const [to, setTo] = useState(iso(today));
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const compile = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/reports/foreman?projectId=${projectId}&periodType=DAILY&from=${from}&to=${to}&order=asc`)
      .then((data) => { setReports(data); setLoaded(true); })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [projectId, from, to]);

  function preset(kind) {
    const end = new Date();
    const start = new Date();
    if (kind === "week") start.setDate(end.getDate() - 6);
    else if (kind === "month") start.setDate(1);
    setFrom(iso(start)); setTo(iso(end));
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "Project";

  const summary = useMemo(() => {
    if (reports.length === 0) return null;
    const details = reports.map(detailOf);
    const incidents = details.filter((d) => d.incidents.trim()).length;
    const progresses = details.map((d) => Number(d.progress) || 0);
    const workerDays = details.reduce((s, d) => s + (Number(d.workers) || 0), 0);
    return {
      days: reports.length,
      firstProgress: progresses[0],
      lastProgress: progresses[progresses.length - 1],
      gained: progresses[progresses.length - 1] - progresses[0],
      incidents,
      workerDays,
    };
  }, [reports]);

  function downloadExcel() {
    const aoa = [
      [`COMPILED FOREMAN REPORT — ${projectName}`],
      [`${from} to ${to}`],
      [],
      ["Date", "Submitted By", "Progress %", "Workers", "Weather", "Work Completed", "Materials Used", "Problems / Delays", "Incidents / Near Misses"],
    ];
    reports.forEach((r) => {
      const d = detailOf(r);
      aoa.push([new Date(r.reportDate).toISOString().slice(0, 10), r.submittedBy?.name || "", d.progress, d.workers, d.weather, d.workCompleted, d.materials, d.problems, d.incidents]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compiled Report");
    const safe = projectName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    XLSX.writeFile(wb, `Compiled_Report_${safe}_${from}_to_${to}.xlsx`);
  }

  return (
    <div className="p-4 max-w-[1000px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <h1 className="text-xl font-semibold text-slate-800">Compile Foreman Reports</h1>
      <p className="text-xs text-slate-500 mb-3">Pick a project and a date range to compile the daily reports into a weekly / monthly report.</p>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Project</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLoaded(false); }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end gap-1.5">
            <button onClick={() => preset("week")} className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 hover:bg-slate-50">This week</button>
            <button onClick={() => preset("month")} className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 hover:bg-slate-50">This month</button>
          </div>
          <div className="flex items-end">
            <button onClick={compile} disabled={!projectId || loading} className="w-full bg-brand-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {loading ? "Compiling…" : "Compile"}
            </button>
          </div>
        </div>
      </div>

      {loaded && reports.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">
          No daily reports from {from} to {to} for this project.
        </div>
      )}

      {reports.length > 0 && (
        <>
          {/* Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Compiled Report</h2>
                <p className="text-xs text-slate-500">{fmtDate(from)} → {fmtDate(to)}</p>
              </div>
              <button onClick={downloadExcel} className="text-xs bg-brand-900 text-white rounded-lg px-3 py-1.5">⬇️ Download Excel</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Days reported" value={summary.days} />
              <Stat label="Progress now" value={`${summary.lastProgress}%`} />
              <Stat label="Progress gained" value={`${summary.gained >= 0 ? "+" : ""}${summary.gained}%`} color={summary.gained >= 0 ? "green" : "red"} />
              <Stat label="Incidents" value={summary.incidents} color={summary.incidents > 0 ? "red" : "slate"} />
            </div>
          </div>

          {/* Per-day */}
          <div className="space-y-2">
            {reports.map((r) => {
              const d = detailOf(r);
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-semibold text-slate-800">{fmtDate(r.reportDate)}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">👷 {d.workers}</span>
                      <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">{d.progress}%</span>
                      {r.submittedBy?.name && <span className="text-slate-400">{r.submittedBy.name}</span>}
                    </div>
                  </div>
                  {d.workCompleted && <p className="text-xs text-slate-600 mt-2"><b>Work done:</b> {d.workCompleted}</p>}
                  {d.materials && <p className="text-xs text-slate-600 mt-1"><b>Materials:</b> {d.materials}</p>}
                  {d.problems && <p className="text-xs text-amber-700 mt-1"><b>Problems:</b> {d.problems}</p>}
                  {d.incidents && <p className="text-xs text-red-700 mt-1"><b>⚠ Incidents:</b> {d.incidents}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color = "slate" }) {
  const cls = color === "green" ? "text-green-700" : color === "red" ? "text-red-600" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
