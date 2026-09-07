import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

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

function fmtMoney(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

export default function FinanceAnalytics() {
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
      .get(`/projects/${projectId}/finance-analytics`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load Finance analytics"));
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Finance — Project Performance</p>
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
                No approved Finance reports yet.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Funds received" value={fmtMoney(data.totals.totalFundsReceived)} />
              <Stat label="Expenditure" value={fmtMoney(data.totals.totalExpenditure)} />
              <Stat label="Balance" value={fmtMoney(data.totals.balance)} alert={data.totals.balance < 0} />
              <Stat label="Outstanding commitments" value={fmtMoney(data.totals.totalCommitment)} />
            </div>

            {data.totals.approvedBudget != null && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-1">Budget utilisation</h2>
                <p className="text-sm text-slate-600">
                  {fmtMoney(data.totals.totalExpenditure)} of {fmtMoney(data.totals.approvedBudget)} approved budget spent
                  {" — "}
                  <span className={`font-semibold ${data.totals.utilizationPercent > 100 ? "text-red-600" : "text-slate-900"}`}>
                    {data.totals.utilizationPercent}%
                  </span>
                </p>
              </div>
            )}

            {data.categoryBreakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Expenditure by category</h2>
                <ul className="space-y-1 text-sm">
                  {data.categoryBreakdown.map((c) => (
                    <li key={c.category} className="flex justify-between">
                      <span className="text-slate-600">{CATEGORY_LABELS[c.category] || c.category}</span>
                      <span className="font-medium text-slate-900">{fmtMoney(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Funds received vs. expenditure over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="cumulativeReceived" name="Funds received" stroke="#16a34a" strokeWidth={2} />
                      <Line type="monotone" dataKey="cumulativeExpenditure" name="Expenditure" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
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
