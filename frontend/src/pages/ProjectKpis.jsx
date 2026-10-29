import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function fmt$(v) {
  if (!v && v !== 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function pct(n) { return `${Math.round(n ?? 0)}%`; }

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-700",
  PLANNING: "bg-blue-100 text-blue-700",
  DELAYED: "bg-red-100 text-red-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  CLOSED: "bg-slate-100 text-slate-500",
};

function ProgressBar({ value, planned, color = "bg-blue-500" }) {
  const pv = Math.min(100, Math.max(0, value ?? 0));
  const pp = planned != null ? Math.min(100, Math.max(0, planned)) : null;
  return (
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pv}%` }} />
      {pp != null && (
        <div className="absolute top-0 h-full w-0.5 bg-slate-400" style={{ left: `${pp}%` }} title={`Planned: ${pp}%`} />
      )}
    </div>
  );
}

export default function ProjectKpis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ACTIVE");

  useEffect(() => {
    api.get("/dashboard/kpis")
      .then(setKpis)
      .catch((e) => setError(e.message || "Failed to load KPIs"))
      .finally(() => setLoading(false));
  }, []);

  const visible = filter ? kpis.filter((k) => k.status === filter) : kpis;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-400">Dashboard KPIs</p>
          <p className="font-semibold text-white">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors">Back</button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {/* Summary tiles */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Projects</p>
              <p className="text-2xl font-bold text-slate-900">{kpis.length}</p>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center">
              <p className="text-xs text-amber-600 mb-1">Pending Reqs</p>
              <p className="text-2xl font-bold text-amber-900">{kpis.reduce((s, k) => s + k.pendingReqs, 0)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center">
              <p className="text-xs text-red-600 mb-1">Open Actions</p>
              <p className="text-2xl font-bold text-red-900">{kpis.reduce((s, k) => s + k.openActions, 0)}</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {["ACTIVE", "PLANNING", "DELAYED", "COMPLETED", ""].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filter === s ? "bg-brand-900 text-white border-brand-900" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>
              {s || "All"}
            </button>
          ))}
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
        {loading && <div className="text-center text-slate-400 py-10">Loading KPIs…</div>}

        {/* KPI cards */}
        {visible.map((k) => {
          const budgetOver = k.variance > 0;
          const behindSchedule = k.plannedProgress != null && k.completion < k.plannedProgress - 5;
          return (
            <div key={k.id} className={`bg-white rounded-xl border ${behindSchedule || budgetOver ? "border-amber-300" : "border-slate-200"} shadow-sm overflow-hidden`}>
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{k.code}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[k.status] || "bg-slate-100 text-slate-600"}`}>{k.status}</span>
                    {behindSchedule && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Behind schedule</span>}
                    {budgetOver && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Over budget</span>}
                  </div>
                  <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">{k.name}</p>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Completion */}
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                    <span>Completion</span>
                    <span className="font-semibold text-slate-800">
                      {pct(k.completion)}
                      {k.plannedProgress != null && <span className="text-slate-400 font-normal"> / {pct(k.plannedProgress)} planned</span>}
                    </span>
                  </div>
                  <ProgressBar value={k.completion} planned={k.plannedProgress} color={behindSchedule ? "bg-amber-500" : "bg-green-500"} />
                </div>

                {/* Budget vs Actual */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500 mb-0.5">Budget</p>
                    <p className="font-bold text-slate-900">{fmt$(k.budgetCost)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-slate-500 mb-0.5">Actual</p>
                    <p className="font-bold text-slate-900">{fmt$(k.actualCost)}</p>
                  </div>
                  <div className={`rounded-lg p-2 text-center ${budgetOver ? "bg-red-50" : "bg-green-50"}`}>
                    <p className={`mb-0.5 ${budgetOver ? "text-red-500" : "text-green-600"}`}>Variance</p>
                    <p className={`font-bold ${budgetOver ? "text-red-700" : "text-green-700"}`}>{budgetOver ? "+" : ""}{fmt$(k.variance)}</p>
                  </div>
                </div>

                {/* Days & alerts */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {k.daysOnSite != null && (
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-slate-500">Days on site</p>
                      <p className="font-bold text-slate-900 text-sm">{k.daysOnSite}</p>
                    </div>
                  )}
                  {k.daysRemaining != null && (
                    <div className={`rounded-lg p-2 ${k.daysRemaining < 7 ? "bg-red-50" : "bg-slate-50"}`}>
                      <p className={k.daysRemaining < 7 ? "text-red-500" : "text-slate-500"}>Days remaining</p>
                      <p className={`font-bold text-sm ${k.daysRemaining < 7 ? "text-red-700" : "text-slate-900"}`}>{k.daysRemaining}</p>
                    </div>
                  )}
                  {k.pendingReqs > 0 && (
                    <div className="bg-amber-50 rounded-lg p-2">
                      <p className="text-amber-600">Pending reqs</p>
                      <p className="font-bold text-amber-900 text-sm">{k.pendingReqs}</p>
                    </div>
                  )}
                  {k.openActions > 0 && (
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-slate-500">Open actions</p>
                      <p className="font-bold text-slate-900 text-sm">{k.openActions}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
