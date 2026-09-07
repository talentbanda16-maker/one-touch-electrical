import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const STATUS_COLORS = {
  ON_PROGRAMME: "bg-green-100 text-green-800",
  MINOR_DELAY: "bg-amber-100 text-amber-800",
  CRITICAL_DELAY: "bg-red-100 text-red-800",
  UNKNOWN: "bg-slate-100 text-slate-600",
};

const DEPARTMENT_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };

function money(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export default function ManagementDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [delegatedActions, setDelegatedActions] = useState([]);
  const [delegatedInstructions, setDelegatedInstructions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/summary")
      .then(setSummary)
      .catch((err) => setError(err.message || "Failed to load dashboard"));
    api
      .get("/dashboard/projects-progress")
      .then(setProjects)
      .catch(() => setProjects([]));
    // Same endpoints the Action Tracker/Instructions pages use — already
    // scoped server-side, for Management, to jobs the Technical Manager
    // personally assigned (see actions.js/instructions.js), so this is
    // just showing that same list right on the dashboard instead of
    // requiring a click-through.
    api
      .get("/actions")
      .then((list) => setDelegatedActions(list.filter((a) => a.status !== "CLOSED")))
      .catch(() => setDelegatedActions([]));
    api
      .get("/instructions")
      .then((list) => setDelegatedInstructions(list.filter((i) => i.status !== "CLOSED")))
      .catch(() => setDelegatedInstructions([]));
  }, []);

  const alerts = projects.flatMap((p) =>
    p.exceptions.map((text) => ({ project: p.project.name, text, status: p.progress.status }))
  );

  const progressChartData = projects.map((p) => ({
    name: p.project.code,
    fullName: p.project.name,
    actual: p.progress.actual,
    planned: p.progress.planned ?? 0,
  }));

  const budgetChartData = projects.map((p) => ({
    name: p.project.code,
    approvedBudget: p.project.approvedBudget || 0,
    actualExpenditure: p.finance.totalExpenditure,
  }));

  const utilisationChartData = projects.map((p) => ({
    name: p.project.code,
    fundUtilisation: p.finance.fundUtilisationPercent ?? 0,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Management Dashboard</p>
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

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Active projects" value={summary.activeProjects} />
              <StatTile
                label="Reports today"
                value={`${summary.reportsToday} / ${summary.expectedReportsToday}`}
                alert={summary.reportsToday < summary.expectedReportsToday}
              />
              <StatTile
                label="Pending approvals"
                value={summary.pendingApprovals}
                onClick={() => navigate("/approvals")}
              />
              <StatTile
                label="Open actions assigned by TM"
                value={summary.openActions}
                alert={summary.overdueActions > 0}
                alertText={`${summary.overdueActions} overdue`}
                onClick={() => navigate("/actions")}
              />
              <StatTile
                label="Open instructions assigned by TM"
                value={summary.openInstructions}
                alert={summary.overdueInstructions > 0}
                alertText={`${summary.overdueInstructions} overdue`}
                onClick={() => navigate("/instructions")}
              />
              <StatTile
                label="SHE incidents (30d)"
                value={summary.sheIncidents.last30Days}
                alert={summary.sheIncidents.last30Days > 0}
                onClick={() => navigate("/analytics/she")}
              />
            </div>

            {delegatedActions.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Actions raised to the Technical Manager</h2>
                <ul className="space-y-2">
                  {delegatedActions.map((a) => (
                    <li key={a.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">Raised by: {a.createdBy.name}</span>
                        <span
                          className={`text-xs font-medium rounded px-2 py-0.5 ${
                            a.isOverdue ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {a.isOverdue ? "OVERDUE" : a.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{a.description}</p>
                      <p className="text-xs text-slate-400">
                        {a.project.name} · Due {new Date(a.dueDate).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {delegatedInstructions.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Instructions issued by the Technical Manager</h2>
                <ul className="space-y-2">
                  {delegatedInstructions.map((i) => (
                    <li key={i.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">{i.personResponsible.name}</span>
                        <span
                          className={`text-xs font-medium rounded px-2 py-0.5 ${
                            i.isOverdue ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {i.isOverdue ? "OVERDUE" : i.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{i.description}</p>
                      <p className="text-xs text-slate-400">
                        {i.project.name} · Due {new Date(i.dueDate).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.reportsTodayByType && summary.reportsToday > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="text-sm font-medium text-slate-700 mb-2">Reports submitted today by department</h2>
                <div style={{ width: "100%", height: 140 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={Object.entries(summary.reportsTodayByType).map(([type, count]) => ({
                        name: DEPARTMENT_LABELS[type] || type,
                        count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-red-900">Project-level alerts &amp; exceptions</h2>
                {alerts.map((a, i) => (
                  <p key={i} className="text-sm text-red-800">
                    <span className="font-medium">{a.project}:</span> {a.text}
                  </p>
                ))}
              </div>
            )}

            {summary.materialShortages.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-amber-900">Material shortages</h2>
                {summary.materialShortages.map((s, i) => (
                  <p key={i} className="text-sm text-amber-800">
                    <span className="font-medium">{s.project.name}</span> ({new Date(s.date).toLocaleDateString()}) —{" "}
                    {s.note}
                  </p>
                ))}
              </div>
            )}

            {summary.sheIncidents.openCorrectiveActions > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-1">SHE corrective actions</h2>
                <p className="text-sm text-slate-600">
                  {summary.sheIncidents.openCorrectiveActions} open
                  {summary.sheIncidents.overdueCorrectiveActions > 0 && (
                    <span className="text-red-600 font-medium">
                      {" "}
                      · {summary.sheIncidents.overdueCorrectiveActions} overdue
                    </span>
                  )}
                </p>
              </div>
            )}

            {projects.length > 0 && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="font-medium text-slate-900 mb-3">Planned vs actual progress by project</h2>
                  <div style={{ width: "100%", height: Math.max(160, projects.length * 60) }}>
                    <ResponsiveContainer>
                      <BarChart data={progressChartData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="actual" name="Actual" fill="#2563eb" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="planned" name="Planned" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="font-medium text-slate-900 mb-3">Budget vs actual expenditure by project</h2>
                  <div style={{ width: "100%", height: Math.max(160, projects.length * 60) }}>
                    <ResponsiveContainer>
                      <BarChart data={budgetChartData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip formatter={(v) => money(v)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="approvedBudget" name="Approved budget" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="actualExpenditure" name="Actual expenditure" fill="#dc2626" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="font-medium text-slate-900 mb-3">Fund utilisation by project</h2>
                  <div style={{ width: "100%", height: Math.max(160, projects.length * 50) }}>
                    <ResponsiveContainer>
                      <BarChart data={utilisationChartData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="fundUtilisation" name="Fund utilisation" fill="#16a34a" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="font-medium text-slate-900 mb-3">Projects overview</h2>
                  <ul className="space-y-2">
                    {projects.map((p) => (
                      <li key={p.project.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1 last:border-0">
                        <span>{p.project.name}</span>
                        <span className={`text-xs font-medium rounded px-2 py-1 ${STATUS_COLORS[p.progress.status]}`}>
                          {p.progress.actual}% · {p.progress.status.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <button
              onClick={() => navigate("/analytics/compare")}
              className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
            >
              Full project comparison view
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function StatTile({ label, value, onClick, alert = false, alertText }) {
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-slate-200 p-4 text-left">
      <div className={`text-2xl font-semibold ${alert ? "text-red-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
      {alert && alertText && <div className="text-xs text-red-600 font-medium mt-1">{alertText}</div>}
    </button>
  );
}
