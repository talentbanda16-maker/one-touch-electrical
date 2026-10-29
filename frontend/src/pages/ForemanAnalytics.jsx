import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const MANPOWER_LABELS = {
  electricalSupervisors: "Electrical Supervisors",
  electricians: "Electricians",
  electricalAssistants: "Electrical Assistants",
  generalHands: "General Hands",
  sheOfficersOnSite: "SHE officer",
};

export default function ForemanAnalytics() {
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
      .get(`/projects/${projectId}/foreman-analytics`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load Foreman analytics"));
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Foreman — Site Performance</p>
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
                No approved Foreman reports yet.
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Reports filed" value={data.totals.reportCount} />
              <Stat label="Latest progress" value={data.totals.latestProgress != null ? `${data.totals.latestProgress}%` : "—"} />
              <Stat label="Avg. workforce" value={data.totals.avgWorkforce} />
            </div>

            {data.manpowerBreakdown && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Latest manpower on site</h2>
                <ul className="space-y-1 text-sm">
                  {Object.entries(MANPOWER_LABELS).map(([key, label]) => (
                    <li key={key} className="flex justify-between">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-medium text-slate-900">{data.manpowerBreakdown[key]}</span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-slate-100 pt-1 mt-1 font-semibold">
                    <span>Total Workforce</span>
                    <span>{data.manpowerBreakdown.total}</span>
                  </li>
                </ul>
              </div>
            )}

            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Progress &amp; workforce over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="percentProgress" name="Progress %" stroke="#2563eb" strokeWidth={2} />
                      <Line type="monotone" dataKey="workersOnSite" name="Workers on site" stroke="#16a34a" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.recentConstraints.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-amber-900">Recent constraints &amp; delays</h2>
                {data.recentConstraints.map((c, i) => (
                  <p key={i} className="text-sm text-amber-800">
                    {new Date(c.date).toLocaleDateString()} — {c.note}
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

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
