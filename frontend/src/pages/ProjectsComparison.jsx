import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function ProjectsComparison() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/projects-progress")
      .then((data) =>
        setProjects(
          data.map((p) => ({
            name: p.project.code,
            fullName: p.project.name,
            actual: p.progress.actual,
            planned: p.progress.planned ?? 0,
            fundUtilisation: p.finance.fundUtilisationPercent ?? 0,
            status: p.progress.status,
          }))
        )
      )
      .catch((err) => setError(err.message || "Failed to load comparison"));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Progress by Project</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/analytics")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {projects.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
            No active projects yet.
          </div>
        )}

        {projects.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-medium text-slate-900 mb-3">Actual vs planned progress</h2>
              <div style={{ width: "100%", height: Math.max(180, projects.length * 60) }}>
                <ResponsiveContainer>
                  <BarChart data={projects} layout="vertical" margin={{ left: 10 }}>
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
              <h2 className="font-medium text-slate-900 mb-3">Fund utilisation by project</h2>
              <div style={{ width: "100%", height: Math.max(180, projects.length * 50) }}>
                <ResponsiveContainer>
                  <BarChart data={projects} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="fundUtilisation" name="Fund utilisation" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-medium text-slate-900 mb-3">Project list</h2>
              <ul className="space-y-1 text-sm">
                {projects.map((p) => (
                  <li key={p.name} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                    <span>{p.fullName}</span>
                    <span className="text-slate-500">
                      {p.actual}% actual · {p.planned}% planned
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
