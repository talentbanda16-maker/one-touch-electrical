import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function fmt$(val) {
  if (val == null || isNaN(val)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
function fmt$dec(val) {
  if (val == null || isNaN(val)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

export default function FinanceProcurementSpend() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [projectId] = useState(() => {
    try { return localStorage.getItem("finance_projectId") || ""; } catch { return ""; }
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.get("/projects").then((data) => {
      const p = Array.isArray(data) ? data.find(x => x.id === projectId) : null;
      if (p) setProjectName(`${p.name} (${p.code})`);
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/procurement?projectId=${projectId}`)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const totalSpend = items.reduce((s, i) => s + (i.totalCost || 0), 0);
  const totalBudget = items.reduce((s, i) => s + (i.budgetCost || 0), 0);
  const totalVariance = items.reduce((s, i) => s + (i.variance || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-brand-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/dashboard/finance")}
          className="text-slate-500 hover:text-slate-900 p-1 -ml-1 rounded-lg hover:bg-slate-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-xs text-slate-500">{projectName || "Finance Dashboard"}</p>
          <p className="font-semibold text-slate-900">Procurement Spend</p>
        </div>
        <button onClick={logout} className="text-xs text-slate-300 border border-slate-600 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">Log out</button>
      </header>

      <div className="max-w-xl mx-auto px-4 py-5 w-full space-y-4">
        {!projectId && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 text-sm">No project selected.</p>
            <button onClick={() => navigate("/dashboard/finance")} className="mt-3 text-blue-600 text-sm font-medium">Go back and select one</button>
          </div>
        )}

        {loading && <p className="text-sm text-slate-400 text-center py-6">Loading…</p>}

        {!loading && projectId && items.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-400 text-sm">No procurement items found.</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total Spend",  value: totalSpend,    cls: "text-slate-900" },
                { label: "Budget Cost",  value: totalBudget,   cls: "text-slate-900" },
                { label: "Variance",     value: totalVariance, cls: totalVariance > 0 ? "text-red-700" : "text-green-700" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className={`text-sm font-black tabular-nums ${cls}`}>{fmt$(value)}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-semibold text-slate-800 text-sm">Materials</p>
                <p className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? "s" : ""}</p>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-900 text-white">
                    <th className="text-left px-3 py-2.5 text-xs font-bold border-r border-slate-600">Item</th>
                    <th className="text-right px-3 py-2.5 text-xs font-bold border-r border-slate-600">Qty Ordered</th>
                    <th className="text-right px-3 py-2.5 text-xs font-bold">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2 border-b border-r border-slate-100 text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 border-b border-r border-slate-100 text-right text-slate-600 tabular-nums">{item.qtyOrdered}</td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right font-semibold tabular-nums">{fmt$dec(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-900 text-white">
                    <td className="px-3 py-2.5 font-bold text-xs border-r border-slate-600" colSpan={2}>TOTAL SPEND</td>
                    <td className="px-3 py-2.5 font-black text-right tabular-nums">{fmt$dec(totalSpend)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
