import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const STATUS_LABELS = {
  ON_PROGRAMME: "On programme",
  MINOR_DELAY: "Minor delay",
  CRITICAL_DELAY: "Critical delay",
  UNKNOWN: "Not enough data",
};

const STATUS_COLORS = {
  ON_PROGRAMME: "bg-green-100 text-green-800",
  MINOR_DELAY: "bg-amber-100 text-amber-800",
  CRITICAL_DELAY: "bg-red-100 text-red-800",
  UNKNOWN: "bg-slate-100 text-slate-600",
};

function money(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

const CATEGORY_LABELS = {
  ADVANCE_PAYMENT: "Advance payment",
  OTHER_FUNDS: "Other funds",
  MATERIALS: "Materials",
  LABOUR: "Labour",
  PLANT_EQUIPMENT: "Plant/equipment",
  TRANSPORT_LOGISTICS: "Transport/logistics",
  SUBCONTRACTOR: "Subcontractor",
  SUPPLIER: "Supplier",
  PETTY_CASH: "Petty cash",
  OTHER: "Other",
};

function categoryChartData(byCategory) {
  return Object.entries(byCategory || {})
    .map(([category, value]) => ({ name: CATEGORY_LABELS[category] || category, value }))
    .sort((a, b) => b.value - a.value);
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().slice(0, 10);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [analytics, setAnalytics] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [programme, setProgramme] = useState([]);
  const [newPeriodDate, setNewPeriodDate] = useState("");
  const [newPlannedProgress, setNewPlannedProgress] = useState("");
  const [programmeError, setProgrammeError] = useState("");
  const [error, setError] = useState("");

  const isTechnicalManager = user?.role === "TECHNICAL_MANAGER";

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setError("");
    api
      .get(`/projects/${projectId}/analytics`)
      .then(setAnalytics)
      .catch((err) => setError(err.message || "Failed to load analytics"));
    loadProgramme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !from || !to) return;
    api
      .get(`/projects/${projectId}/snapshots?from=${from}&to=${to}`)
      .then((data) =>
        setSnapshots(
          data.map((s) => ({
            date: new Date(s.snapshotDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            actual: s.actualProgress,
            planned: s.plannedProgress,
            fundUtilisation: s.fundUtilisationPercent,
          }))
        )
      )
      .catch(() => setSnapshots([]));
  }, [projectId, from, to]);

  function loadProgramme() {
    api
      .get(`/projects/${projectId}/programme`)
      .then(setProgramme)
      .catch(() => setProgramme([]));
  }

  async function handleAddProgrammeEntry(e) {
    e.preventDefault();
    setProgrammeError("");
    try {
      await api.post(`/projects/${projectId}/programme`, {
        periodDate: newPeriodDate,
        plannedProgress: Number(newPlannedProgress) || 0,
      });
      setNewPeriodDate("");
      setNewPlannedProgress("");
      loadProgramme();
      api.get(`/projects/${projectId}/analytics`).then(setAnalytics).catch(() => {});
    } catch (err) {
      setProgrammeError(err.message || "Failed to save programme entry");
    }
  }

  async function handleDeleteProgrammeEntry(entryId) {
    setProgrammeError("");
    try {
      await api.delete(`/projects/${projectId}/programme/${entryId}`);
      loadProgramme();
      api.get(`/projects/${projectId}/analytics`).then(setAnalytics).catch(() => {});
    } catch (err) {
      setProgrammeError(err.message || "Failed to delete programme entry");
    }
  }

  const budgetVsActualData = analytics
    ? [
        { name: "Approved budget", value: analytics.project.approvedBudget || 0 },
        { name: "Actual expenditure", value: analytics.finance.totalExpenditure },
      ]
    : [];

  const expenditureByCategoryData = analytics ? categoryChartData(analytics.finance.expenditureByCategory) : [];
  const fundsReceivedByCategoryData = analytics ? categoryChartData(analytics.finance.fundsReceivedByCategory) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Progress &amp; Finance</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/analytics/compare")}
            className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
          >
            Compare projects
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
          >
            Back
          </button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
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

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trend from</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trend to</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {analytics && (
          <>
            {analytics.exceptions.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-red-900">Exceptions</h2>
                {analytics.exceptions.map((e, i) => (
                  <p key={i} className="text-sm text-red-800">
                    ⚠ {e}
                  </p>
                ))}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-slate-900">Planned vs actual progress</h2>
                <span className={`text-xs font-medium rounded px-2 py-1 ${STATUS_COLORS[analytics.progress.status]}`}>
                  {STATUS_LABELS[analytics.progress.status]}
                </span>
              </div>

              {snapshots.length >= 2 ? (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={snapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="actual" name="Actual" stroke="#2563eb" strokeWidth={2} />
                      <Line type="monotone" dataKey="planned" name="Planned" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <>
                  <ProgressBar label="Actual" value={analytics.progress.actual} color="bg-blue-600" />
                  {analytics.progress.planned != null && (
                    <ProgressBar label="Planned" value={analytics.progress.planned} color="bg-slate-400" />
                  )}
                  <p className="text-xs text-slate-400">
                    Trend line appears once a few days of history build up — for now this shows today's numbers only.
                  </p>
                </>
              )}

              {analytics.progress.variance != null && (
                <p className="text-sm text-slate-500">
                  Variance: {analytics.progress.variance > 0 ? "+" : ""}
                  {analytics.progress.variance} percentage points
                </p>
              )}
              {analytics.progress.asOf && (
                <p className="text-xs text-slate-400">
                  Actual progress from the latest approved Foreman report ({new Date(analytics.progress.asOf).toLocaleDateString()})
                  {analytics.progress.actualSources?.qs != null &&
                    `, blended with QS's ${analytics.progress.actualSources.qs}% BOQ completion`}
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-medium text-slate-900">Budget vs actual expenditure</h2>
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={budgetVsActualData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={110} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm pt-2">
                <FinanceStat label="Funds received" value={money(analytics.finance.totalFundsReceived)} />
                <FinanceStat label="Outstanding commitments" value={money(analytics.finance.totalCommitments)} />
                <FinanceStat label="Balance available" value={money(analytics.finance.balanceAvailable)} />
                <FinanceStat label="Contract value" value={money(analytics.project.contractValue)} />
              </div>
            </div>

            {(expenditureByCategoryData.length > 0 || fundsReceivedByCategoryData.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <h2 className="font-medium text-slate-900">Where the money went / came from</h2>

                {expenditureByCategoryData.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Expenditure by category</p>
                    <div style={{ width: "100%", height: Math.max(120, expenditureByCategoryData.length * 36) }}>
                      <ResponsiveContainer>
                        <BarChart data={expenditureByCategoryData} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                          <Tooltip formatter={(v) => money(v)} />
                          <Bar dataKey="value" fill="#dc2626" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {fundsReceivedByCategoryData.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Funds received by category</p>
                    <div style={{ width: "100%", height: Math.max(120, fundsReceivedByCategoryData.length * 36) }}>
                      <ResponsiveContainer>
                        <BarChart data={fundsReceivedByCategoryData} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                          <Tooltip formatter={(v) => money(v)} />
                          <Bar dataKey="value" fill="#16a34a" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-medium text-slate-900">Fund utilisation</h2>
              {analytics.finance.fundUtilisationPercent != null && (
                <ProgressBar label="Current" value={analytics.finance.fundUtilisationPercent} color="bg-purple-600" />
              )}

              {snapshots.length >= 2 && (
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={snapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip />
                      <Line type="monotone" dataKey="fundUtilisation" name="Fund utilisation" stroke="#7c3aed" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-medium text-slate-900">Approved programme</h2>
              <p className="text-xs text-slate-500">
                Set planned progress for specific dates — the analytics above interpolate between them. With no
                entries, planned progress falls back to a straight line between the project's start and planned
                end date.
              </p>

              {programmeError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{programmeError}</p>
              )}

              {programme.length === 0 ? (
                <p className="text-sm text-slate-500">No programme entries yet — using the straight-line estimate.</p>
              ) : (
                <ul className="space-y-1">
                  {programme.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1 last:border-0">
                      <span>
                        {new Date(entry.periodDate).toLocaleDateString()} — {entry.plannedProgress}% planned
                      </span>
                      {isTechnicalManager && (
                        <button
                          onClick={() => handleDeleteProgrammeEntry(entry.id)}
                          className="text-red-600 text-xs underline"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isTechnicalManager && (
                <form onSubmit={handleAddProgrammeEntry} className="flex gap-2 pt-2">
                  <input
                    type="date"
                    required
                    value={newPeriodDate}
                    onChange={(e) => setNewPeriodDate(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    placeholder="% planned"
                    value={newPlannedProgress}
                    onChange={(e) => setNewPlannedProgress(e.target.value)}
                    className="w-28 rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <button type="submit" className="bg-brand-900 text-white rounded-md px-3 py-2 text-sm shrink-0">
                    Set
                  </button>
                </form>
              )}
            </div>

            <p className="text-xs text-slate-400 text-center">
              All figures are calculated only from approved reports. Actual progress blends the latest approved
              Foreman report with QS's BOQ completion when both exist. Planned progress comes from the approved
              programme above when set, otherwise a straight line between the project's start and planned end date.
              Trend lines build up from one snapshot taken per day.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function ProgressBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FinanceStat({ label, value }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}
