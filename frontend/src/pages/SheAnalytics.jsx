import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function SheAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/projects").then((list) => {
      setProjects(list);
      if (list.length > 0) setProjectId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setError("");
    api
      .get(`/projects/${projectId}/she-analytics`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load SHE analytics"));
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">SHE — Safety Performance</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
        >
          Back
        </button>
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
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {data && (
          <>
            {data.totals.reportCount === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
                No approved SHE reports yet.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total incidents" value={data.totals.totalIncidents} alert={data.totals.totalIncidents > 0} />
              <Stat label="Near misses" value={data.totals.totalNearMisses} />
              <Stat label="Toolbox talk days" value={data.totals.toolboxTalkDays} />
              <Stat label="Inspection days" value={data.totals.inspectionDays} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-medium text-slate-900 mb-1">SHE actions — outstanding &amp; closed</h2>
              <p className="text-sm text-slate-600">
                {data.correctiveActions.open} outstanding
                {data.correctiveActions.overdue > 0 && (
                  <span className="text-red-600 font-medium"> · {data.correctiveActions.overdue} overdue</span>
                )}
                {" · "}
                {data.correctiveActions.closed} closed
              </p>
            </div>

            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Incidents &amp; near misses over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="incidents" name="Incidents" stroke="#dc2626" strokeWidth={2} />
                      <Line type="monotone" dataKey="nearMisses" name="Near misses" stroke="#d97706" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.recentIncidents.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-red-900">Recent incidents</h2>
                {data.recentIncidents.map((inc, i) => (
                  <p key={i} className="text-sm text-red-800">
                    {new Date(inc.date).toLocaleDateString()} — {inc.count} incident{inc.count > 1 ? "s" : ""}
                    {inc.description ? `: ${inc.description}` : ""}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, alert = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <div className={`text-lg font-semibold ${alert ? "text-red-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
