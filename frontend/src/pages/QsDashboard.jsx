import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const TABS = ["Overview", "Claims", "BOQ", "Schedule Payment", "Site Overview"];

function fmt$(val) {
  if (val == null || isNaN(val)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}
function fmt$dec(val) {
  if (val == null || isNaN(val)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : "—"; }

function StatusPill({ status }) {
  const s = { APPROVED: "bg-green-100 text-green-800", PENDING: "bg-yellow-100 text-yellow-800", RETURNED: "bg-red-100 text-red-800" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>;
}

// ─── Top-level project switcher ───────────────────────────────────────────────
function ProjectSwitcher({ projects, value, onChange }) {
  if (!projects.length) return null;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
    </select>
  );
}

// ─── Ledger sheet (single table — income or expense) ─────────────────────────
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

      {/* Ledger table */}
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
                    <button onClick={addItem} className="bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded">Add</button>
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
            <tr className="bg-brand-600 text-white">
              <td className="px-4 py-3 font-bold text-sm border-r border-slate-600">Total</td>
              <td className="px-4 py-3 font-black text-right text-base tabular-nums">{fmt$dec(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Overview tab (single project) ───────────────────────────────────────────
function OverviewTab({ project, onUpdate }) {
  const [openSheet, setOpenSheet] = useState(null); // "income" | "expense" | null

  if (!project) return <p className="text-sm text-slate-400 text-center py-10">No project selected.</p>;

  const pct          = project.contractValue > 0 ? Math.round((project.claimedToDate / project.contractValue) * 100) : 0;
  const paid         = project.totalPaid ?? 0;
  const paidPct      = project.contractValue > 0 ? Math.min(100, Math.round((paid / project.contractValue) * 100)) : 0;
  const outstanding  = Math.max(0, project.claimedToDate - paid);

  const incomeTotal  = project.incomeTotal ?? 0;
  const expenseTotal = project.expenseTotal ?? 0;
  const hasDirectData = incomeTotal > 0 || expenseTotal > 0;
  const received     = hasDirectData ? incomeTotal : project.claimedToDate;
  const expenses     = hasDirectData ? expenseTotal : (project.procurementCost ?? 0);
  const profit       = received - expenses;
  const marginPct    = received > 0 ? Math.round((profit / received) * 100) : null;
  const isProfitable = profit >= 0;

  const remaining = Math.max(0, project.contractValue - project.claimedToDate);
  const overSpent = Math.max(0, project.claimedToDate - project.contractValue);
  const pieData = project.contractValue > 0
    ? [
        { name: "Money Spent",  value: Math.min(project.claimedToDate, project.contractValue) },
        { name: "Remaining",    value: remaining },
        ...(overSpent > 0 ? [{ name: "Over Budget", value: overSpent }] : []),
      ]
    : [{ name: "No contract value", value: 1 }];
  const PIE_COLORS = ["#f97316", "#15803d", "#ef4444", "#e2e8f0"];

  return (
    <div className="space-y-4">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">Contract Value</p>
          <p className="text-sm font-bold text-slate-900">{fmt$(project.contractValue)}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center">
          <p className="text-xs text-green-700 mb-1">Amount Claimed</p>
          <p className="text-sm font-bold text-green-900">{fmt$(project.claimedToDate)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center">
          <p className="text-xs text-blue-700 mb-1">Balance</p>
          <p className="text-sm font-bold text-blue-900">{fmt$(project.balance)}</p>
        </div>
        <div className="bg-brand-600 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-300 mb-1">Overall Progress</p>
          <p className="text-2xl font-black text-white">
            {project.siteProgress != null ? `${project.siteProgress}%` : `${pct}%`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {project.siteProgress != null ? "Site avg · " : "Financial · "}
            <span className="text-slate-300">
              {project.siteProgress != null ? `Financial: ${pct}%` : "no site data yet"}
            </span>
          </p>
        </div>
      </div>

      {/* Profit / Loss indicator */}
      <div className={`rounded-xl border-2 p-4 ${isProfitable ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${isProfitable ? "text-green-700" : "text-red-700"}`}>
              {isProfitable ? "Profit" : "Loss"}
            </p>
            <p className={`text-2xl font-black ${isProfitable ? "text-green-800" : "text-red-800"}`}>
              {isProfitable ? "+" : "-"}{fmt$(Math.abs(profit))}
            </p>
            <p className={`text-xs mt-0.5 ${isProfitable ? "text-green-600" : "text-red-600"}`}>
              {hasDirectData ? "Income Received − Project Expenses" : "Claimed − Procurement (estimated)"}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-black ${isProfitable ? "text-green-700" : "text-red-700"}`}>
              {marginPct != null ? `${marginPct}%` : "—"}
            </p>
            <p className={`text-xs font-semibold ${isProfitable ? "text-green-600" : "text-red-600"}`}>Margin</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-white bg-opacity-60 rounded-lg p-2 text-center">
            <p className={`mb-0.5 ${isProfitable ? "text-green-700" : "text-red-700"}`}>Income Received</p>
            <p className="font-bold text-slate-800">{fmt$(received)}</p>
          </div>
          <div className="bg-white bg-opacity-60 rounded-lg p-2 text-center">
            <p className="text-slate-500 mb-0.5">Project Expenses</p>
            <p className="font-bold text-slate-800">{fmt$(expenses)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpenSheet(s => s === "income" ? null : "income")}
            className="flex-1 py-2 rounded-lg text-xs font-bold border border-green-400 text-green-800 bg-white bg-opacity-60 hover:bg-opacity-100 transition-colors">
            Income Payments
          </button>
          <button onClick={() => setOpenSheet(s => s === "expense" ? null : "expense")}
            className="flex-1 py-2 rounded-lg text-xs font-bold border border-red-400 text-red-800 bg-white bg-opacity-60 hover:bg-opacity-100 transition-colors">
            Project Expenses
          </button>
        </div>
      </div>

      {openSheet === "income" && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <LedgerSheet title="Income Payments" endpoint="income-items" projectId={project.id}
            accentCls="text-green-700" onClose={() => setOpenSheet(null)} onSaved={onUpdate} />
        </div>
      )}
      {openSheet === "expense" && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <LedgerSheet title="Project Expenses" endpoint="expense-items" projectId={project.id}
            accentCls="text-red-700" onClose={() => setOpenSheet(null)} onSaved={onUpdate} />
        </div>
      )}

      {/* Payment status */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800">Amount Claimed Payment Status</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-600 mb-1">Amount Paid</p>
            <p className="text-sm font-bold text-blue-900">{fmt$(paid)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-xs text-amber-700 mb-1">Outstanding</p>
            <p className="text-sm font-bold text-amber-900">{fmt$(outstanding)}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Paid of contract value</span>
            <span className="font-bold text-slate-700">{paidPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      </div>

      {/* Chart 1: Contract Value vs Money Spent */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-800 mb-0.5">Contract Value vs Money Spent</p>
        <p className="text-xs text-slate-400 mb-3">{project.name}</p>
        {project.contractValue === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No contract value set yet.</p>
        ) : (
          <div className="flex flex-col items-center">
            <div style={{ width: "100%", height: 200, position: "relative" }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} dataKey="value"
                    startAngle={90} endAngle={-270} paddingAngle={2} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                    formatter={(v) => [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: pct > 100 ? "#ef4444" : "#f97316" }}>{pct}%</span>
                <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>SPENT</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-1">
              {pieData.map((entry, i) => (
                <div key={entry.name} className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                    {entry.name}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart 2: Contract Sum vs Payment Received */}
      {(() => {
        const cv = project.contractValue;
        const paidAmt = paid;
        const balance = Math.max(0, cv - paidAmt);
        const paidPct = cv > 0 ? Math.min(100, Math.round((paidAmt / cv) * 100)) : 0;
        const fmtC = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
        const pie2Data = cv > 0
          ? [
              { name: "Payment Received", value: Math.min(paidAmt, cv) },
              { name: "Balance",          value: balance },
            ].filter(d => d.value > 0)
          : [{ name: "No data", value: 1 }];
        const PIE2_COLORS = { "Payment Received": "#15803d", "Balance": "#d97706", "No data": "#e2e8f0" };
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-800 mb-0.5">Contract Sum vs Payment Received</p>
            <p className="text-xs text-slate-400 mb-3">{project.name}</p>
            {cv === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No contract value set yet.</p>
            ) : (
              <div className="flex flex-col items-center">
                <div style={{ width: "100%", height: 200, position: "relative" }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie2Data} cx="50%" cy="50%" innerRadius={55} outerRadius={82} dataKey="value"
                        startAngle={90} endAngle={-270} paddingAngle={2} strokeWidth={0}>
                        {pie2Data.map((d) => <Cell key={d.name} fill={PIE2_COLORS[d.name]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v) => [fmtC(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>CONTRACT</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{fmtC(cv)}</span>
                    <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700, marginTop: 2 }}>{paidPct}% paid</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 w-full">
                  {[
                    { label: "Contract Value",   value: cv,      bg: "bg-slate-100 border-slate-300", txt: "text-slate-800", lbl: "text-slate-500" },
                    { label: "Payment Received", value: paidAmt, bg: "bg-green-50 border-green-300",  txt: "text-green-800", lbl: "text-green-600" },
                    { label: "Balance",          value: balance,  bg: balance > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200", txt: balance > 0 ? "text-amber-800" : "text-slate-400", lbl: balance > 0 ? "text-amber-600" : "text-slate-400" },
                  ].map(({ label, value, bg, txt, lbl }) => (
                    <div key={label} className={`rounded-xl border p-2 text-center ${bg}`}>
                      <p className={`text-xs mb-0.5 leading-tight ${lbl}`}>{label}</p>
                      <p className={`text-xs font-black tabular-nums ${txt}`}>{fmtC(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Claims tab ───────────────────────────────────────────────────────────────
function ClaimsTab({ projectId, navigate }) {
  const [claims, setClaims] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [adding, setAdding] = useState(false);

  const loadItems = (pid) => api.get(`/dashboard/claim-items?projectId=${pid}`).then(setItems).catch(() => setItems([]));

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.get(`/reports/qs/history?projectId=${projectId}`).then(setClaims).catch(() => setClaims([])),
      loadItems(projectId),
    ]).finally(() => setLoading(false));
  }, [projectId]);

  const handleAddItem = async () => {
    if (!newDesc.trim()) return;
    await api.post("/dashboard/claim-items", { projectId, description: newDesc.trim(), amount: parseFloat(newAmt) || 0 });
    setNewDesc(""); setNewAmt(""); setAdding(false);
    loadItems(projectId);
  };

  const handleDeleteItem = async (id) => {
    await api.delete(`/dashboard/claim-items/${id}`).catch(() => {});
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-400 text-center py-6">Loading...</p>}
      {!loading && (() => {
        const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        return (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brand-600 text-white">
                  <th className="text-left px-4 py-3 font-bold text-xs border-r border-slate-600">ITEMS</th>
                  <th className="text-right px-4 py-3 font-bold text-xs pr-10">MONEY</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !adding && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400 text-sm">No items yet — click + Add Item below</td></tr>
                )}
                {items.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-3 border-r border-b border-slate-100 text-slate-800 font-medium">{item.description}</td>
                    <td className="px-4 py-3 border-b border-slate-100 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-semibold text-slate-900">{fmt$dec(parseFloat(item.amount))}</span>
                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-300 hover:text-red-600 font-bold text-xs transition-colors">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {adding && (
                  <tr className="bg-green-50">
                    <td className="px-3 py-2 border-r border-b border-slate-100">
                      <input autoFocus placeholder="Item name (e.g. Cables)" value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") setAdding(false); }}
                        className="w-full rounded border border-green-400 px-2 py-1.5 text-sm focus:outline-none" />
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex items-center gap-2 justify-end">
                        <input type="number" placeholder="Amount" value={newAmt}
                          onChange={(e) => setNewAmt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") setAdding(false); }}
                          className="w-32 rounded border border-green-400 px-2 py-1.5 text-sm text-right focus:outline-none" />
                        <button onClick={handleAddItem} className="bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded">Save</button>
                        <button onClick={() => setAdding(false)} className="text-slate-400 text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="cursor-pointer hover:bg-green-50 transition-colors" onClick={() => setAdding(true)}>
                  <td colSpan={2} className="px-4 py-2 border-t border-slate-100">
                    <span className="text-xs font-semibold text-green-700">+ Add Item</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-brand-600 text-white">
                  <td className="px-4 py-3 font-bold text-xs border-r border-slate-600">TOTAL</td>
                  <td className="px-4 py-3 font-black text-right text-base pr-10">{fmt$dec(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

// ─── BOQ tab ──────────────────────────────────────────────────────────────────
const EMPTY_BOQ_ROW = { boqItemNumber: "", description: "", unit: "", contractQuantity: "", contractRate: "" };

function mapBoqHeader(h) {
  const s = String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  if (s.match(/^(item|itemno|no|itemnumber|ref|boqitem|boqno)$/) || s.startsWith("item")) return "boqItemNumber";
  if (s.includes("desc") || s.includes("work") || s.includes("activity") || s.includes("scope") || s.includes("detail") || s.includes("name")) return "description";
  if (s.match(/^(unit|uom|measure|units)$/) || s.includes("unit")) return "unit";
  if (s.includes("qty") || s.includes("quantity") || s === "q") return "contractQuantity";
  if (s.includes("rate") || s.includes("price") || s.includes("cost")) return "contractRate";
  return null;
}

function BoqTab({ projectId, projectName }) {
  const [progress, setProgress] = useState([]);
  const [template, setTemplate] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const loadData = (pid) => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/qs/boq-progress?projectId=${pid}`).catch(() => []),
      api.get(`/projects/${pid}/boq`).catch(() => []),
    ]).then(([prog, tmpl]) => { setProgress(prog); setTemplate(tmpl); }).finally(() => setLoading(false));
  };

  useEffect(() => { if (projectId) { setEditing(false); loadData(projectId); } }, [projectId]);

  const startEdit = () => {
    setDraftRows(template.length > 0
      ? template.map(t => ({ ...t, contractQuantity: String(t.contractQuantity), contractRate: String(t.contractRate) }))
      : [{ ...EMPTY_BOQ_ROW }]);
    setEditing(true);
  };

  const updateRow = (i, field, val) => setDraftRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  const addRow    = () => setDraftRows(r => [...r, { ...EMPTY_BOQ_ROW }]);
  const removeRow = (i) => setDraftRows(r => r.filter((_, idx) => idx !== i));

  const saveBoq = async () => {
    const rows = draftRows.filter(r => r.boqItemNumber.trim() && r.description.trim());
    if (rows.length === 0) return;
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/boq`, rows.map(r => ({
        boqItemNumber: r.boqItemNumber.trim(), description: r.description.trim(),
        unit: r.unit.trim(), contractQuantity: parseFloat(r.contractQuantity) || 0, contractRate: parseFloat(r.contractRate) || 0,
      })));
      await api.post("/procurement/sync-from-boq", { projectId }).catch(() => {});
      setEditing(false); loadData(projectId);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleExcelUpload = (e) => {
    setUploadError("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (raw.length < 2) { setUploadError("Sheet appears empty."); return; }

        // Find the actual header row (scan first 15 rows for one containing a description-like column)
        let headerRowIdx = -1;
        let headers = [];
        let fieldMap = [];
        for (let r = 0; r < Math.min(15, raw.length); r++) {
          const fm = raw[r].map(mapBoqHeader);
          if (fm.includes("description")) { headerRowIdx = r; headers = raw[r]; fieldMap = fm; break; }
        }
        if (headerRowIdx === -1) { setUploadError(`Could not find a Description column in the first 15 rows. First row headers: ${raw[0].map(h => `"${h}"`).join(", ")}`); return; }

        const parsed = [];
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          if (row.every(c => String(c).trim() === "")) continue;
          const obj = { boqItemNumber: String(i - headerRowIdx), description: "", unit: "", contractQuantity: "", contractRate: "" };
          headers.forEach((_, hi) => { if (fieldMap[hi]) obj[fieldMap[hi]] = String(row[hi] ?? ""); });
          if (!obj.description.trim()) continue;
          parsed.push(obj);
        }
        if (parsed.length === 0) { setUploadError("No valid rows found after the header row."); return; }
        // Save directly — no editing step
        setSaving(true);
        try {
          await api.put(`/projects/${projectId}/boq`, parsed.map(r => ({
            boqItemNumber: r.boqItemNumber.trim(), description: r.description.trim(),
            unit: r.unit.trim(), contractQuantity: parseFloat(r.contractQuantity) || 0, contractRate: parseFloat(r.contractRate) || 0,
          })));
          await api.post("/procurement/sync-from-boq", { projectId }).catch(() => {});
          loadData(projectId);
        } catch { setUploadError("Upload failed — could not save to server."); }
        setSaving(false);
      } catch { setUploadError("Could not read file. Make sure it is a valid .xlsx or .xls file."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  if (editing) return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-800 text-sm">Edit BOQ — {projectName}</p>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-500 underline">Cancel</button>
      </div>
      {draftRows.map((row, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input placeholder="Item No." value={row.boqItemNumber} onChange={e => updateRow(i, "boqItemNumber", e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1.5 text-xs" />
            <input placeholder="Unit (m, m², nr…)" value={row.unit} onChange={e => updateRow(i, "unit", e.target.value)} className="w-28 rounded border border-slate-300 px-2 py-1.5 text-xs" />
            <button onClick={() => removeRow(i)} className="ml-auto text-red-500 text-xs font-semibold">✕</button>
          </div>
          <input placeholder="Description" value={row.description} onChange={e => updateRow(i, "description", e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Contract Qty</p>
              <input type="number" min="0" placeholder="0" value={row.contractQuantity} onChange={e => updateRow(i, "contractQuantity", e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Contract Rate ($)</p>
              <input type="number" min="0" placeholder="0.00" value={row.contractRate} onChange={e => updateRow(i, "contractRate", e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
          </div>
          {row.contractQuantity && row.contractRate && (
            <p className="text-xs text-green-700 font-semibold">= {fmt$dec((parseFloat(row.contractQuantity)||0)*(parseFloat(row.contractRate)||0))}</p>
          )}
        </div>
      ))}
      <button onClick={addRow} className="w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 hover:border-green-400 hover:text-green-700">+ Add Item</button>
      <button onClick={saveBoq} disabled={saving} className="w-full bg-brand-600 hover:bg-green-800 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
        {saving ? "Saving…" : "Save BOQ Template"}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
      <button onClick={() => { setUploadError(""); fileInputRef.current?.click(); }}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-3 py-2 rounded-md">
        Upload Excel BOQ
      </button>
      {uploadError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{uploadError}</p>}
      {saving && <p className="text-sm text-blue-600 text-center py-2">Saving…</p>}
      {loading && <p className="text-sm text-slate-400 text-center py-6">Loading...</p>}
      {!loading && template.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold text-amber-800">No BOQ template set up yet</p>
          <p className="text-xs text-amber-700">Upload an Excel file or click "Set up BOQ" to enter contract items.</p>
          <button onClick={startEdit} className="text-sm font-semibold text-green-700 underline">Set up BOQ</button>
        </div>
      )}
      {!loading && template.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{template.length} items</p>
            <button onClick={startEdit} className="text-xs text-blue-600 underline">Edit</button>
          </div>
          {template.map((l) => {
            const contractAmt = (parseFloat(l.contractQuantity) || 0) * (parseFloat(l.contractRate) || 0);
            return (
              <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{l.boqItemNumber} — {l.description}</p>
                  {l.unit && <p className="text-xs text-slate-500">{l.unit}</p>}
                </div>
                {contractAmt > 0 && (
                  <div className="grid grid-cols-3 gap-2 text-xs text-center">
                    <div className="bg-slate-50 rounded p-1.5"><p className="text-slate-500 mb-0.5">Qty</p><p className="font-semibold">{Number(l.contractQuantity)}</p></div>
                    <div className="bg-slate-50 rounded p-1.5"><p className="text-slate-500 mb-0.5">Rate</p><p className="font-semibold">{fmt$dec(l.contractRate)}</p></div>
                    <div className="bg-blue-50 rounded p-1.5"><p className="text-blue-600 mb-0.5">Amount</p><p className="font-semibold text-blue-800">{fmt$dec(contractAmt)}</p></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Schedule Payment tab ─────────────────────────────────────────────────────
function PaymentsTab({ projectId }) {
  const [claims, setClaims] = useState([]);
  const [payments, setPayments] = useState([]);
  const [claimItems, setClaimItems] = useState([]);
  const [directPaid, setDirectPaid] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.get(`/reports/qs/history?projectId=${projectId}`).catch(() => []),
      api.get(`/reports/qs/payments?projectId=${projectId}`).catch(() => []),
      api.get(`/dashboard/claim-items?projectId=${projectId}`).catch(() => []),
      api.get(`/dashboard/project-paid?projectId=${projectId}`).catch(() => null),
    ]).then(([c, p, items, paidInfo]) => {
      setClaims(c); setPayments(p); setClaimItems(items);
      setDirectPaid(paidInfo?.paidAmount ?? 0);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const rows = claims.map((c, i) => {
    const totalPaid = payments.filter((p) => p.reportId === c.id).reduce((s, p) => s + Number(p.amountPaid), 0);
    return { ...c, itemNo: i + 1, totalPaid };
  }).filter((r) => r.periodAmount > 0);

  const claimItemsTotal = claimItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const totalClaimed = rows.reduce((s, r) => s + r.periodAmount, 0) + claimItemsTotal;
  const totalPaid    = rows.reduce((s, r) => s + r.totalPaid, 0) + directPaid;
  const hasAnything  = rows.length > 0 || claimItemsTotal > 0;

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-400 text-center py-6">Loading…</p>}
      {!loading && !hasAnything && <p className="text-sm text-slate-400 text-center py-6">No claims for this project yet.</p>}
      {!loading && hasAnything && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-4 bg-brand-600 text-white text-xs font-semibold px-3 py-2.5">
            <span>Item</span><span>Description</span><span className="text-right">Amount Claimed</span><span className="text-right">Amount Paid</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-4 px-3 py-3 border-b border-slate-100 items-center">
              <div>
                <p className="text-sm font-semibold text-slate-800">#{r.itemNo}</p>
                <p className="text-xs text-slate-400">{fmtDate(r.reportDate)}</p>
              </div>
              <div className="min-w-0 pr-2"><StatusPill status={r.status} /></div>
              <div className="text-right"><p className="text-sm font-semibold text-slate-900">{fmt$dec(r.periodAmount)}</p></div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${r.totalPaid >= r.periodAmount ? "text-green-700" : r.totalPaid > 0 ? "text-yellow-700" : "text-red-600"}`}>{fmt$dec(r.totalPaid)}</p>
                {r.totalPaid > 0 && r.totalPaid < r.periodAmount && <p className="text-xs text-slate-400">bal {fmt$dec(r.periodAmount - r.totalPaid)}</p>}
              </div>
            </div>
          ))}
          {claimItemsTotal > 0 && (
            <div className="grid grid-cols-4 px-3 py-3 border-b border-slate-100 items-center">
              <div>
                <p className="text-sm font-semibold text-slate-800">Direct</p>
                <p className="text-xs text-slate-400">{claimItems.length} item{claimItems.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="min-w-0 pr-2"><span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">CLAIMS TAB</span></div>
              <div className="text-right"><p className="text-sm font-semibold text-slate-900">{fmt$dec(claimItemsTotal)}</p></div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${directPaid >= claimItemsTotal ? "text-green-700" : directPaid > 0 ? "text-yellow-700" : "text-red-600"}`}>{fmt$dec(directPaid)}</p>
                {directPaid > 0 && directPaid < claimItemsTotal && <p className="text-xs text-slate-400">bal {fmt$dec(claimItemsTotal - directPaid)}</p>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 px-3 py-2.5 bg-slate-50 border-t-2 border-slate-200">
            <span className="text-xs font-bold text-slate-700 col-span-2">Total</span>
            <span className="text-right text-sm font-bold text-slate-900">{fmt$dec(totalClaimed)}</span>
            <span className={`text-right text-sm font-bold ${totalPaid >= totalClaimed ? "text-green-700" : "text-red-600"}`}>{fmt$dec(totalPaid)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Site Overview tab ────────────────────────────────────────────────────────
function SiteOverviewTab({ projectId }) {
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.get("/progress"),
      api.get(`/progress/log?projectId=${projectId}`),
    ]).then(([prog, l]) => { setRows(prog.rows ?? []); setLogs(l ?? []); }).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  const activities = rows.map((row) => {
    const rowLogs = logs.filter((l) => l.rowId === row.id);
    const sorted = [...rowLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const targeted = sorted.find((l) => l.targetPct != null)?.targetPct ?? null;
    const actual   = sorted.find((l) => l.percentage != null)?.percentage ?? null;
    let status = "No Data";
    if (actual != null && targeted != null) {
      if (actual >= 100) status = "Complete";
      else if (actual >= targeted) status = "On Track";
      else if (actual >= targeted - 15) status = "Near Target";
      else status = "Behind";
    } else if (actual != null) {
      status = actual >= 100 ? "Complete" : "In Progress";
    }
    return { label: row.label, targeted, actual, status };
  });

  const withData = activities.filter((a) => a.actual != null || a.targeted != null);
  const avgTargeted = withData.filter((a) => a.targeted != null).length
    ? Math.round(withData.filter((a) => a.targeted != null).reduce((s, a) => s + a.targeted, 0) / withData.filter((a) => a.targeted != null).length)
    : null;
  const avgActual = withData.filter((a) => a.actual != null).length
    ? Math.round(withData.filter((a) => a.actual != null).reduce((s, a) => s + a.actual, 0) / withData.filter((a) => a.actual != null).length)
    : null;

  const counts = { Complete: 0, "On Track": 0, "Near Target": 0, Behind: 0 };
  activities.forEach((a) => { if (counts[a.status] != null) counts[a.status]++; });

  const statusColor = { Complete: "bg-green-100 text-green-800", "On Track": "bg-blue-100 text-blue-800", "Near Target": "bg-amber-100 text-amber-700", Behind: "bg-red-100 text-red-700", "In Progress": "bg-slate-100 text-slate-600", "No Data": "bg-slate-100 text-slate-400" };
  const barColor = (a) => a.actual == null ? "bg-slate-200" : a.actual >= 100 ? "bg-green-500" : a.actual >= (a.targeted ?? 0) ? "bg-blue-500" : a.actual >= (a.targeted ?? 0) - 15 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
              <p className="text-xs text-blue-600 font-semibold mb-1">Overall Targeted</p>
              <p className="text-3xl font-black text-blue-700">{avgTargeted != null ? `${avgTargeted}%` : "—"}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <p className="text-xs text-green-700 font-semibold mb-1">Overall Actual</p>
              <p className="text-3xl font-black text-green-700">{avgActual != null ? `${avgActual}%` : "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[["Complete", "bg-green-100 text-green-800"], ["On Track", "bg-blue-100 text-blue-800"], ["Near Target", "bg-amber-100 text-amber-700"], ["Behind", "bg-red-100 text-red-700"]].map(([label, cls]) => (
              <div key={label} className={`rounded-xl p-3 text-center ${cls}`}>
                <p className="text-xl font-black">{counts[label]}</p>
                <p className="text-xs font-semibold leading-tight">{label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">Activity Breakdown</p>
              <p className="text-xs text-slate-400 mt-0.5">Blue = Targeted · Coloured = Actual</p>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No activities yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activities.map((a, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-800 truncate flex-1 mr-2">{a.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[a.status]}`}>{a.status}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-blue-500 w-14 shrink-0">Target</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className="bg-blue-400 h-2 rounded-full transition-all" style={{ width: `${a.targeted ?? 0}%` }} />
                      </div>
                      <span className="text-xs font-bold text-blue-600 w-8 text-right">{a.targeted != null ? `${a.targeted}%` : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-14 shrink-0">Actual</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${barColor(a)}`} style={{ width: `${a.actual ?? 0}%` }} />
                      </div>
                      <span className={`text-xs font-black w-8 text-right ${a.actual == null ? "text-slate-300" : a.actual >= (a.targeted ?? 0) ? "text-green-600" : "text-red-500"}`}>{a.actual != null ? `${a.actual}%` : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stock Report tab (read-only view of Stores data) ────────────────────────
function StockReportTab({ projectId }) {
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/reports/stores?projectId=${projectId}`)
      .then((reports) => {
        const itemMap = {};
        const allLines = reports
          .flatMap((r) => (r.storesDetail?.lines || []).map((l) => ({ ...l, reportDate: r.reportDate })))
          .sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));
        for (const line of allLines) {
          const key = line.itemName.trim().toLowerCase();
          if (!itemMap[key]) itemMap[key] = { itemName: line.itemName, received: 0, issued: 0, returned: 0, damaged: 0, balance: 0, lastDate: line.reportDate };
          const e = itemMap[key];
          e.lastDate = line.reportDate;
          if (line.direction === "RECEIVED")     e.received  += Number(line.quantity) || 0;
          if (line.direction === "ISSUED")       e.issued    += Number(line.quantity) || 0;
          if (line.direction === "RETURNED")     e.returned  += Number(line.quantity) || 0;
          if (line.direction === "DAMAGED_LOST") e.damaged   += Number(line.quantity) || 0;
          e.balance = e.received + e.returned - e.issued - e.damaged;
        }
        setStockItems(Object.values(itemMap));
      })
      .catch(() => setStockItems([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = stockItems.filter((s) => s.itemName.toLowerCase().includes(search.toLowerCase()));
  const outOfStock = filtered.filter((s) => s.balance <= 0).length;
  const lowStock   = filtered.filter((s) => s.balance > 0 && s.balance <= 10).length;

  return (
    <div className="space-y-4">
      {/* read-only notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
        <span className="text-blue-500 text-base">🔒</span>
        <p className="text-xs text-blue-700 font-medium">Read-only · Data recorded by Stores department</p>
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-8">Loading stock data…</p>}

      {!loading && stockItems.length > 0 && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-xl font-black text-slate-800">{filtered.length}</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Total Items</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${lowStock > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-xl font-black ${lowStock > 0 ? "text-amber-700" : "text-slate-400"}`}>{lowStock}</p>
              <p className={`text-xs font-semibold mt-0.5 ${lowStock > 0 ? "text-amber-600" : "text-slate-400"}`}>Low Stock</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${outOfStock > 0 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-200"}`}>
              <p className={`text-xl font-black ${outOfStock > 0 ? "text-red-700" : "text-green-700"}`}>{outOfStock}</p>
              <p className={`text-xs font-semibold mt-0.5 ${outOfStock > 0 ? "text-red-600" : "text-green-600"}`}>Out of Stock</p>
            </div>
          </div>

          {/* Alerts */}
          {outOfStock > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-700 mb-1">⚠ Out of stock — order immediately</p>
              {filtered.filter((s) => s.balance <= 0).map((s) => (
                <div key={s.itemName} className="flex justify-between text-xs text-red-700 py-0.5">
                  <span>{s.itemName}</span><span className="font-bold">{s.balance} left</span>
                </div>
              ))}
            </div>
          )}
          {lowStock > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 mb-1">⚠ Running low — consider reordering</p>
              {filtered.filter((s) => s.balance > 0 && s.balance <= 10).map((s) => (
                <div key={s.itemName} className="flex justify-between text-xs text-amber-700 py-0.5">
                  <span>{s.itemName}</span><span className="font-bold">{s.balance} left</span>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <input type="text" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">Current Stock Levels</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    <th className="border border-slate-200 px-3 py-2.5 text-left">Item</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center text-green-700">Received</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center text-blue-700">Issued</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center text-amber-600">Returned</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center text-red-600">Damaged</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center font-black text-slate-800">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No items match your search.</td></tr>
                  ) : filtered.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 ${item.balance <= 0 ? "bg-red-50/60" : ""}`}>
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800">
                        {item.itemName}
                        <span className="block text-xs text-slate-400 font-normal">Last updated: {new Date(item.lastDate).toLocaleDateString()}</span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-center text-green-700 font-semibold">{item.received}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center text-blue-700 font-semibold">{item.issued}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center text-amber-600 font-semibold">{item.returned}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center text-red-600 font-semibold">{item.damaged}</td>
                      <td className={`border border-slate-200 px-3 py-2 text-center font-black text-base ${item.balance > 0 ? "text-slate-800" : "text-red-600"}`}>
                        {item.balance}
                        {item.balance <= 0 && <span className="block text-[10px] font-normal text-red-500">Out of stock</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && stockItems.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No stock data for this project yet.</p>
          <p className="text-xs text-slate-400 mt-1">Stores department needs to submit reports first.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function QsDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [returnedReports, setReturnedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const handleProjectChange = (id) => {
    setSelectedProjectId(id);
    try { localStorage.setItem("qs_projectId", id); } catch {}
  };

  const refreshSummary = () => api.get("/dashboard/qs-summary").then(setData).catch(() => {});

  useEffect(() => {
    Promise.all([api.get("/dashboard/qs-summary"), api.get("/reports/mine/returned")])
      .then(([summary, returned]) => {
        setData(summary);
        setReturnedReports(returned);
        if (summary.projects?.length > 0) {
          const saved = (() => { try { return localStorage.getItem("qs_projectId"); } catch { return null; } })();
          const valid = saved && summary.projects.find(p => p.id === saved);
          setSelectedProjectId(valid ? saved : summary.projects[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedProject = data?.projects?.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="One Touch" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shadow" />
          <div>
            <p className="text-white font-bold text-sm leading-tight">One Touch Electrical</p>
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5"
              style={{ background: "rgba(255,255,255,0.12)", color: "#93c5fd" }}>
              Quantity Surveyor
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/settings")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">⚙️ Settings</button>
          <button onClick={logout} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">Log out</button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Returned reports banner */}
        {returnedReports.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <h2 className="font-medium text-amber-900">{returnedReports.length} report{returnedReports.length > 1 ? "s" : ""} returned for correction</h2>
            {returnedReports.map((r) => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-md p-2 text-sm space-y-1">
                <div className="font-medium">{r.project.name} · {fmtDate(r.reportDate)}</div>
                <div className="text-amber-800">Reason: {r.returnReason}</div>
                <button type="button" onClick={() => navigate(`/reports/qs?edit=${r.id}`)} className="text-blue-600 font-medium">Edit &amp; resubmit</button>
              </div>
            ))}
          </div>
        )}

        {/* Greeting */}
        <div className="rounded-2xl overflow-hidden shadow-sm relative" style={{ background: "linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 100%)" }}>
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"rgba(59,130,246,0.15)", filter:"blur(30px)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-20, left:"30%", width:80, height:80, borderRadius:"50%", background:"rgba(245,158,11,0.1)", filter:"blur(20px)", pointerEvents:"none" }} />
          <div className="px-5 py-4 relative">
            <p className="text-xs font-semibold tracking-wide" style={{ color: "#60a5fa" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="text-xl font-bold text-white mt-0.5">Welcome, {user?.name} 👋</p>
            <p className="text-sm mt-1" style={{ color: "#93c5fd" }}>Quantity Surveyor · One Touch Electrical</p>
          </div>
        </div>

        {loading && <div className="text-center text-slate-400 py-10 text-sm">Loading dashboard...</div>}

        {!loading && data && (
          <>
            {/* Project switcher and action buttons — only on Overview */}
            {tab === 0 && (
              <>
                {data.projects.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-0.5">Active Project</p>
                    <ProjectSwitcher projects={data.projects} value={selectedProjectId} onChange={(id) => { handleProjectChange(id); setTab(0); }} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: "📝", label: "Submit QS Report", path: `/reports/qs${selectedProjectId ? `?projectId=${selectedProjectId}` : ""}` },
                    { icon: "📊", label: "Site Progress",    path: `/site-progress${selectedProjectId ? `?projectId=${selectedProjectId}` : ""}` },
                    { icon: "📦", label: "Procurement / Stores", path: `/procurement${selectedProjectId ? `?projectId=${selectedProjectId}` : ""}` },
                    { icon: "💰", label: "Invoice & Expenditure", path: `/invoice-chart${selectedProjectId ? `?projectId=${selectedProjectId}` : ""}` },
                  ].map(({ icon, label, path }) => (
                    <button key={label} onClick={() => navigate(path)}
                      className="text-white rounded-xl py-4 text-sm font-semibold flex flex-col items-center gap-1.5 transition-all active:scale-95"
                      style={{ background: "linear-gradient(135deg,#1a56db,#1743b0)", boxShadow: "0 4px 14px rgba(26,86,219,0.35)" }}>
                      <span style={{ fontSize: "1.375rem", lineHeight: 1 }}>{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Navigation buttons (only shown on Overview) */}
            {tab === 0 && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: "🧾", label: "Claims",           idx: 1 },
                  { icon: "📐", label: "BOQ",              idx: 2 },
                  { icon: "🗓️", label: "Schedule Payment", idx: 3 },
                  { icon: "🏗️", label: "Site Overview",    idx: 4 },
                ].map(({ icon, label, idx }) => (
                  <button key={label} onClick={() => setTab(idx)}
                    className="bg-white border border-slate-300 hover:border-brand-400 hover:bg-brand-50 text-slate-700 rounded-xl py-4 text-sm font-semibold shadow-sm flex flex-col items-center gap-1 transition-colors">
                    <span className="text-xl">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Overview content */}
            {tab === 0 && <OverviewTab key={selectedProjectId} project={selectedProject} onUpdate={refreshSummary} />}

            {/* Full-page section views */}
            {tab > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setTab(0)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg">← Back</button>
                  <h2 className="font-bold text-slate-900 text-base">{TABS[tab]}</h2>
                </div>
                {tab === 1 && <ClaimsTab key={selectedProjectId} projectId={selectedProjectId} navigate={navigate} />}
                {tab === 2 && <BoqTab key={selectedProjectId} projectId={selectedProjectId} projectName={selectedProject?.name ?? ""} />}
                {tab === 3 && <PaymentsTab key={selectedProjectId} projectId={selectedProjectId} />}
                {tab === 4 && <SiteOverviewTab key={selectedProjectId} projectId={selectedProjectId} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
