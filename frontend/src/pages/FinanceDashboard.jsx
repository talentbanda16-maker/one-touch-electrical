import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const fmt$ = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmt$dec = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v || 0);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });

// ─── Ledger sheet ─────────────────────────────────────────────────────────────
function LedgerSheet({ title, endpoint, projectId, accentCls, onClose, onSaved }) {
  const [items, setItems]     = useState([]);
  const [adding, setAdding]   = useState(false);
  const [newItem, setNewItem] = useState({ desc: "", amt: "" });

  const load = () => api.get(`/dashboard/${endpoint}?projectId=${projectId}`).then(setItems).catch(() => {});
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const addItem = async () => {
    if (!newItem.desc.trim()) return;
    await api.post(`/dashboard/${endpoint}`, { projectId, description: newItem.desc.trim(), amount: parseFloat(newItem.amt) || 0 });
    setNewItem({ desc: "", amt: "" }); setAdding(false); load(); onSaved?.();
  };
  const delItem = async (id) => { await api.delete(`/dashboard/${endpoint}/${id}`).catch(() => {}); load(); onSaved?.(); };
  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className={`text-sm font-extrabold tracking-wide ${accentCls}`}>{title}</p>
        <button onClick={onClose} className="text-xs text-slate-400 underline">Close</button>
      </div>
      <div className="border border-slate-300 rounded-lg overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-50">
              <th className="text-left px-4 py-3 font-bold text-slate-700 border-r border-slate-300 w-3/5">Item</th>
              <th className="text-right px-4 py-3 font-bold text-slate-700">Amounts</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={`border-b border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                <td className="px-4 py-3 border-r border-slate-200 text-slate-800">{item.description}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <span className="font-semibold tabular-nums">{fmt$dec(parseFloat(item.amount))}</span>
                    <button onClick={() => delItem(item.id)} className="text-slate-300 hover:text-red-500 text-xs leading-none">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {adding ? (
              <tr className="border-b border-slate-200 bg-blue-50">
                <td className="px-3 py-2 border-r border-slate-200">
                  <input autoFocus placeholder="Item description" value={newItem.desc}
                    onChange={(e) => setNewItem(n => ({ ...n, desc: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }}
                    className="w-full border border-blue-400 rounded px-2 py-1.5 text-sm focus:outline-none bg-white" />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    <input type="number" placeholder="0.00" value={newItem.amt}
                      onChange={(e) => setNewItem(n => ({ ...n, amt: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }}
                      className="w-24 border border-blue-400 rounded px-2 py-1.5 text-sm text-right focus:outline-none bg-white tabular-nums" />
                    <button onClick={addItem} className="bg-brand-900 text-white text-xs font-bold px-3 py-1.5 rounded">Add</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr className="border-b border-slate-200 cursor-pointer hover:bg-slate-50" onClick={() => setAdding(true)}>
                <td colSpan={2} className="px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">+ Add row</span>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-brand-900 text-white">
              <td className="px-4 py-3 font-bold text-sm border-r border-slate-600">Total</td>
              <td className="px-4 py-3 font-black text-right text-base tabular-nums">{fmt$dec(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function FinanceDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [summary, setSummary] = useState(null);
  const [incomeItems, setIncomeItems] = useState([]);
  const [expenseItems, setExpenseItems] = useState([]);
  const [procItems, setProcItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openSheet, setOpenSheet] = useState(null); // "income" | "expense" | null

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      const saved = localStorage.getItem("finance_projectId");
      const first = data.length > 0 ? data[0].id : "";
      setProjectId(saved && data.find(p => p.id === saved) ? saved : first);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    try { localStorage.setItem("finance_projectId", projectId); } catch {}
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/finance-project?projectId=${projectId}`).catch(() => null),
      api.get(`/dashboard/income-items?projectId=${projectId}`).catch(() => []),
      api.get(`/dashboard/expense-items?projectId=${projectId}`).catch(() => []),
      api.get(`/procurement?projectId=${projectId}`).catch(() => []),
    ]).then(([proj, income, expense, proc]) => {
      setSummary(proj);
      setIncomeItems(income);
      setExpenseItems(expense);
      setProcItems(proc);
    }).finally(() => setLoading(false));
  }, [projectId]);

  // ── Derived numbers ──────────────────────────────────────────────────────────
  const contractValue  = summary?.contractValue  ?? 0;
  const claimedToDate  = summary?.claimedToDate  ?? 0;
  const totalPaid      = summary?.totalPaid      ?? 0;
  const outstanding    = Math.max(0, claimedToDate - totalPaid);
  const balance        = Math.max(0, contractValue - claimedToDate);
  const incomeTotal    = incomeItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const expenseTotal   = expenseItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const profit         = incomeTotal - expenseTotal;
  const isProfit       = profit >= 0;
  const procSpend      = procItems.reduce((s, i) => s + (i.totalCost || 0), 0);

  // ── Cash flow: group income + expense by month ────────────────────────────
  const cashFlowMap = {};
  [...incomeItems].forEach(i => {
    const m = new Date(i.createdAt).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
    if (!cashFlowMap[m]) cashFlowMap[m] = { month: m, Income: 0, Expenses: 0 };
    cashFlowMap[m].Income += parseFloat(i.amount) || 0;
  });
  [...expenseItems].forEach(i => {
    const m = new Date(i.createdAt).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
    if (!cashFlowMap[m]) cashFlowMap[m] = { month: m, Income: 0, Expenses: 0 };
    cashFlowMap[m].Expenses += parseFloat(i.amount) || 0;
  });
  const cashFlow = Object.values(cashFlowMap).sort((a, b) => new Date("01 " + a.month) - new Date("01 " + b.month));

  // ── Contract Sum vs Payment chart ─────────────────────────────────────────
  const balance2   = Math.max(0, contractValue - totalPaid);
  const pie2Data = contractValue > 0
    ? [
        { name: "Payment Received", value: Math.min(totalPaid, contractValue) },
        { name: "Balance",          value: balance2 },
      ].filter(d => d.value > 0)
    : [];
  const PIE2_COLOR_MAP = { "Payment Received": "#15803d", "Balance": "#d97706" };
  const receivedPct = contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : 0;

  const selProject = projects.find(p => p.id === projectId);


  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="One Touch" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shadow" />
          <div>
            <p className="text-white font-bold text-sm leading-tight">One Touch Electrical</p>
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fde68a" }}>
              Finance Officer
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/reports/finance")} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">💰 New Report</button>
          <button onClick={logout} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">Log out</button>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">

        {/* Project selector */}
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base bg-white font-medium">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>

        {/* Quick action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate("/reports/finance")} className="bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium">Submit Finance Report</button>
          <button onClick={() => navigate("/qs-payments")} className="bg-brand-600 text-white rounded-xl py-2.5 text-sm font-medium">QS Claim Payments</button>
        </div>

        {loading && <p className="text-sm text-slate-400 text-center py-6">Loading…</p>}

        {!loading && (
          <>
            {/* ── Nav buttons ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate("/finance/payment-history")}
                className="bg-brand-600 text-white rounded-xl py-2.5 text-sm font-medium">
                Payment History
              </button>
              <button onClick={() => navigate("/finance/procurement-spend")}
                className="bg-blue-700 text-white rounded-xl py-2.5 text-sm font-medium">
                Procurement Spend
              </button>
            </div>

            {/* ── 1. Outstanding Claims ──────────────────────────────────────── */}
            <Section title="Outstanding Claims">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Contract Value",  value: contractValue,  color: "bg-slate-50  text-slate-800" },
                  { label: "Amount Claimed",  value: claimedToDate,  color: "bg-green-50  text-green-900" },
                  { label: "Total Paid",      value: totalPaid,      color: "bg-blue-50   text-blue-900"  },
                  { label: "Outstanding",     value: outstanding,    color: "bg-amber-50  text-amber-900" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-xl p-3 text-center border border-slate-200 ${color}`}>
                    <p className="text-xs mb-1 opacity-70">{label}</p>
                    <p className="text-base font-black tabular-nums">{fmt$(value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>Paid of contract value</span>
                  <span className="font-bold text-slate-700">
                    {contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : 0}%
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : 0}%` }} />
                </div>
              </div>
              {balance > 0 && (
                <p className="text-xs text-slate-500 mt-2 text-center">Balance remaining on contract: <span className="font-bold text-slate-700">{fmt$(balance)}</span></p>
              )}
            </Section>

            {/* ── 5. Cash Flow ───────────────────────────────────────────────── */}
            <Section title="Cash Flow Summary">
              {cashFlow.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No income or expense data yet.</p>
              ) : (
                <>
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={cashFlow} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => [fmt$(v)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Income"   fill="#15803d" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Profit / Loss summary */}
                  <div className={`rounded-xl border-2 p-4 mt-2 flex items-center justify-between ${isProfit ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${isProfit ? "text-green-700" : "text-red-700"}`}>{isProfit ? "Net Profit" : "Net Loss"}</p>
                      <p className={`text-2xl font-black ${isProfit ? "text-green-800" : "text-red-800"}`}>{isProfit ? "+" : "-"}{fmt$(Math.abs(profit))}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-slate-500">Income</p><p className="font-bold text-slate-800 mb-1">{fmt$(incomeTotal)}</p>
                      <p className="text-slate-500">Expenses</p><p className="font-bold text-slate-800">{fmt$(expenseTotal)}</p>
                    </div>
                  </div>
                </>
              )}
            </Section>

            {/* ── Income / Expense buttons ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setOpenSheet(s => s === "income" ? null : "income")}
                className={`py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${openSheet === "income" ? "bg-brand-600 border-green-700 text-white" : "bg-white border-green-600 text-green-700 hover:bg-green-50"}`}>
                Income Payments
              </button>
              <button onClick={() => setOpenSheet(s => s === "expense" ? null : "expense")}
                className={`py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${openSheet === "expense" ? "bg-red-700 border-red-700 text-white" : "bg-white border-red-500 text-red-600 hover:bg-red-50"}`}>
                Project Expenses
              </button>
            </div>

            {openSheet === "income" && projectId && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <LedgerSheet title="Income Payments" endpoint="income-items" projectId={projectId}
                  accentCls="text-green-700" onClose={() => setOpenSheet(null)}
                  onSaved={() => api.get(`/dashboard/income-items?projectId=${projectId}`).then(setIncomeItems).catch(() => {})} />
              </div>
            )}
            {openSheet === "expense" && projectId && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <LedgerSheet title="Project Expenses" endpoint="expense-items" projectId={projectId}
                  accentCls="text-red-700" onClose={() => setOpenSheet(null)}
                  onSaved={() => api.get(`/dashboard/expense-items?projectId=${projectId}`).then(setExpenseItems).catch(() => {})} />
              </div>
            )}

            {/* ── Contract Sum vs Payment chart ────────────────────────────── */}
            {pie2Data.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-800 mb-0.5">Contract Sum vs Payment Received</p>
                <p className="text-xs text-slate-400 mb-3">{selProject?.name}</p>
                <div className="flex flex-col items-center">
                  <div style={{ width: "100%", height: 200, position: "relative" }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pie2Data} cx="50%" cy="50%" innerRadius={55} outerRadius={82} dataKey="value"
                          startAngle={90} endAngle={-270} paddingAngle={2} strokeWidth={0}>
                          {pie2Data.map((d) => <Cell key={d.name} fill={PIE2_COLOR_MAP[d.name]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                          formatter={(v) => [fmt$(v)]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>CONTRACT</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{fmt$(contractValue)}</span>
                      <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700, marginTop: 2 }}>{receivedPct}% paid</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 w-full">
                    {[
                      { label: "Contract Value",   value: contractValue, bg: "bg-slate-100 border-slate-300", txt: "text-slate-800", lbl: "text-slate-500" },
                      { label: "Payment Received", value: totalPaid,     bg: "bg-green-50 border-green-300",  txt: "text-green-800", lbl: "text-green-600" },
                      { label: "Balance",          value: Math.max(0, contractValue - totalPaid), bg: contractValue > totalPaid ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200", txt: contractValue > totalPaid ? "text-amber-800" : "text-slate-400", lbl: contractValue > totalPaid ? "text-amber-600" : "text-slate-400" },
                    ].map(({ label, value, bg, txt, lbl }) => (
                      <div key={label} className={`rounded-xl border p-2 text-center ${bg}`}>
                        <p className={`text-xs mb-0.5 leading-tight ${lbl}`}>{label}</p>
                        <p className={`text-xs font-black tabular-nums ${txt}`}>{fmt$(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-brand-900 px-4 py-2.5">
        <p className="text-xs font-bold text-white uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
