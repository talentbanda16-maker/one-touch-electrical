import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function money(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export default function QsAnalytics() {
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
      .get(`/projects/${projectId}/qs-analytics`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load QS analytics"));
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">QS — BOQ Progress</p>
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
            <div className="grid grid-cols-3 gap-3">
              <Stat label="BOQ items" value={data.totals.itemCount} />
              <Stat label="Avg % complete" value={data.totals.overallPercentCompletion != null ? `${data.totals.overallPercentCompletion}%` : "—"} />
              <Stat label="Total valuation" value={money(data.totals.totalValuation)} />
            </div>

            {data.items.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
                No approved QS reports yet.
              </div>
            )}

            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Cumulative valuation over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={money} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Line type="monotone" dataKey="valuation" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.variations.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-amber-900">Variations flagged</h2>
                {data.variations.map((v) => (
                  <div key={v.boqItemNumber} className="text-sm text-amber-800">
                    {v.boqItemNumber} — {v.description} ({v.variationReference})
                  </div>
                ))}
              </div>
            )}

            {data.items.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
                <h2 className="font-medium text-slate-900 mb-3">BOQ items (latest reported)</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1 pr-2">Item</th>
                      <th className="py-1 pr-2">Contract qty</th>
                      <th className="py-1 pr-2">Cumulative</th>
                      <th className="py-1 pr-2">Balance</th>
                      <th className="py-1 pr-2">%</th>
                      <th className="py-1 pr-2">Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((i) => (
                      <tr key={i.boqItemNumber} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-2">{i.boqItemNumber}</td>
                        <td className="py-1 pr-2">{money(i.contractQuantity)}</td>
                        <td className="py-1 pr-2">{money(i.cumulativeQuantity)}</td>
                        <td className="py-1 pr-2">{money(i.balanceQuantity)}</td>
                        <td className="py-1 pr-2">{i.percentCompletion}%</td>
                        <td className="py-1 pr-2">{money(i.valuationAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
