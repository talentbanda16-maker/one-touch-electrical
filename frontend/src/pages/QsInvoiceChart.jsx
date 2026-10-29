import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, ReferenceLine,
} from "recharts";

function fmt$(v) {
  if (v == null || isNaN(v)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export default function QsInvoiceChart() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0=Overview 1=Per Project 2=Outstanding
  const [outstanding, setOutstanding] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/qs-summary"),
      api.get("/procurement/timeline").catch(() => []),
      api.get("/dashboard/qs-outstanding").catch(() => []),
    ]).then(async ([summary, expTimeline, outstandingData]) => {
      setOutstanding(outstandingData);
      const activeProjects = summary.projects;
      const expenditures = await Promise.all(
        activeProjects.map((p) =>
          api.get(`/procurement?projectId=${p.id}`)
            .then((items) => ({ projectId: p.id, totalSpent: items.reduce((s, i) => s + i.totalCost, 0) }))
            .catch(() => ({ projectId: p.id, totalSpent: 0 }))
        )
      );
      const expMap = new Map(expenditures.map((e) => [e.projectId, e.totalSpent]));
      const enriched = activeProjects.map((p) => ({
        ...p,
        expenditure: expMap.get(p.id) ?? 0,
        profit: p.claimedToDate - (expMap.get(p.id) ?? 0),
      }));
      setData({ ...summary, projects: enriched, expTimeline });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  );

  const projects = data?.projects ?? [];
  const totals = projects.reduce((acc, p) => ({
    invoiced:    acc.invoiced + p.claimedToDate,
    paid:        acc.paid + (p.totalPaid ?? 0),
    expenditure: acc.expenditure + p.expenditure,
    contract:    acc.contract + p.contractValue,
  }), { invoiced: 0, paid: 0, expenditure: 0, contract: 0 });

  totals.outstanding = totals.invoiced - totals.paid;
  totals.profit = totals.invoiced - totals.expenditure;

  const barData = projects.map((p) => ({
    name: p.code || p.name.slice(0, 10),
    fullName: p.name,
    "Invoiced": p.claimedToDate,
    "Expenditure": p.expenditure,
    "Paid": p.totalPaid ?? 0,
  }));

  // Merge invoiced + expenditure timelines by month, both cumulative
  const invoicedMap = new Map((data?.timeline ?? []).map((t) => [t.month, t.amount]));
  const expMap2 = new Map((data?.expTimeline ?? []).map((t) => [t.month, t.amount]));
  const allMonths = [...new Set([...invoicedMap.keys(), ...expMap2.keys()])].sort();
  let cumInvoiced = 0, cumExp = 0;
  const timelineData = allMonths.map((m) => {
    cumInvoiced += invoicedMap.get(m) ?? 0;
    cumExp      += expMap2.get(m) ?? 0;
    const [yr, mo] = m.split("-");
    const label = new Date(Number(yr), Number(mo) - 1, 1)
      .toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return { month: label, "Invoiced": cumInvoiced, "Expenditure": cumExp };
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/dashboard/qs")}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg">
          ← Back
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Invoice &amp; Expenditure</h1>
          <p className="text-xs text-slate-500">All projects — invoiced vs materials spent</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">

        {/* Navigation buttons — only on Overview */}
        {tab === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTab(1)} className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-semibold shadow-sm hover:bg-slate-50">
              Per Project
            </button>
            <button onClick={() => setTab(2)} className="relative bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-semibold shadow-sm hover:bg-slate-50">
              Outstanding
              {outstanding.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: 9 }}>
                  {outstanding.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Back button — inside sections */}
        {tab > 0 && (
          <div className="flex items-center gap-3">
            <button onClick={() => setTab(0)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg">← Back</button>
            <h2 className="font-bold text-slate-900 text-base">{["", "Per Project", "Outstanding"][tab]}</h2>
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {tab === 0 && (
          <div className="space-y-4">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Total Invoiced</p>
                <p className="text-sm font-bold text-slate-900">{fmt$(totals.invoiced)}</p>
              </div>
              <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center">
                <p className="text-xs text-green-600 mb-1">Total Paid</p>
                <p className="text-sm font-bold text-green-900">{fmt$(totals.paid)}</p>
              </div>
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center">
                <p className="text-xs text-blue-600 mb-1">Materials Spent</p>
                <p className="text-sm font-bold text-blue-900">{fmt$(totals.expenditure)}</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${totals.profit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <p className={`text-xs mb-1 ${totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>Net Profit</p>
                <p className={`text-sm font-bold ${totals.profit >= 0 ? "text-emerald-900" : "text-red-900"}`}>{fmt$(totals.profit)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center col-span-2">
                <p className="text-xs text-amber-600 mb-1">Outstanding (Invoiced but not yet paid)</p>
                <p className="text-sm font-bold text-amber-900">{fmt$(totals.outstanding)}</p>
              </div>
            </div>

            {/* Bar chart — Invoice vs Expenditure vs Paid */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-800 mb-0.5">Invoice vs Expenditure</p>
              <p className="text-xs text-slate-400 mb-3">All projects side by side</p>
              <div className="flex flex-wrap gap-4 mb-3">
                {[["Invoiced","#15803d"],["Expenditure","#2563eb"],["Paid","#f97316"]].map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }}></span>{label}
                  </span>
                ))}
              </div>
              {barData.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No data yet.</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} barCategoryGap="25%" barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }}
                        tickFormatter={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 10000 ? `$${(v/1000).toFixed(0)}k` : `$${v.toLocaleString()}`}
                        axisLine={false} tickLine={false} width={70} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v, name) => [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v), name]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                        labelStyle={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}
                      />
                      <Bar dataKey="Invoiced"    fill="#15803d" radius={[4,4,0,0]} />
                      <Bar dataKey="Expenditure" fill="#2563eb" radius={[4,4,0,0]} />
                      <Bar dataKey="Paid"        fill="#f97316" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PER PROJECT TAB ── */}
        {tab === 1 && (
          <div className="space-y-3">
            {projects.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No projects yet.</p>}
            {projects.map((p) => {
              const invoicePct = p.contractValue > 0 ? Math.min(100, Math.round((p.claimedToDate / p.contractValue) * 100)) : 0;
              const isProfit = p.profit >= 0;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Project header */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.code} · Contract: {fmt$(p.contractValue)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isProfit ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                      {isProfit ? "▲" : "▼"} {isProfit ? "Profit" : "Loss"}
                    </span>
                  </div>

                  {/* Invoice progress bar */}
                  <div className="px-4 py-3 space-y-1 border-b border-slate-100">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Invoice progress</span>
                      <span className="font-semibold">{invoicePct}% of contract</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-600 rounded-full" style={{ width: `${Math.min(invoicePct, 100)}%` }} />
                    </div>
                  </div>

                  {/* Financial breakdown */}
                  <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">
                    <div className="p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Invoiced</p>
                      <p className="text-sm font-bold text-slate-900">{fmt$(p.claimedToDate)}</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xs text-green-600 mb-0.5">Paid</p>
                      <p className="text-sm font-bold text-green-900">{fmt$(p.totalPaid ?? 0)}</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xs text-blue-600 mb-0.5">Materials Spent</p>
                      <p className="text-sm font-bold text-blue-900">{fmt$(p.expenditure)}</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className={`text-xs mb-0.5 ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                        {isProfit ? "Profit" : "Loss"}
                      </p>
                      <p className={`text-sm font-bold ${isProfit ? "text-emerald-900" : "text-red-900"}`}>
                        {fmt$(Math.abs(p.profit))}
                      </p>
                    </div>
                  </div>

                  {/* Outstanding */}
                  {p.claimedToDate > (p.totalPaid ?? 0) && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                      <p className="text-xs text-amber-700 font-semibold">
                        Outstanding: {fmt$(p.claimedToDate - (p.totalPaid ?? 0))} not yet paid
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── OUTSTANDING TAB ── */}
        {tab === 2 && (
          <div className="space-y-3">
            {/* Summary */}
            {outstanding.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-red-900">{outstanding.length} unpaid claim{outstanding.length > 1 ? "s" : ""}</p>
                  <p className="text-xs text-red-600">Client still owes you money on these</p>
                </div>
                <p className="text-lg font-black text-red-900">
                  {fmt$(outstanding.reduce((s, r) => s + r.outstanding, 0))}
                </p>
              </div>
            )}

            {outstanding.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                <p className="text-2xl mb-2">✓</p>
                <p className="text-sm font-bold text-green-800">All claims fully paid</p>
                <p className="text-xs text-green-600 mt-1">No outstanding balances on any project</p>
              </div>
            )}

            {outstanding.map((r) => {
              const age = r.daysSince;
              const ageBg    = age >= 60 ? "bg-red-50 border-red-300"    : age >= 30 ? "bg-amber-50 border-amber-300"    : "bg-white border-slate-200";
              const ageBadge = age >= 60 ? "bg-red-100 text-red-800"     : age >= 30 ? "bg-amber-100 text-amber-800"     : "bg-slate-100 text-slate-600";
              const ageLabel = age >= 60 ? `${age} days — OVERDUE`       : age >= 30 ? `${age} days — Follow up`         : `${age} days`;
              const paidPct  = r.periodAmount > 0 ? Math.round((r.paidAmount / r.periodAmount) * 100) : 0;

              return (
                <div key={r.claimId} className={`rounded-xl border ${ageBg} overflow-hidden`}>
                  {/* Header */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{r.project.name}</p>
                      <p className="text-xs text-slate-400">{r.project.code} · Claim #{r.claimNumber}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ageBadge}`}>{ageLabel}</span>
                  </div>

                  {/* Amounts */}
                  <div className="grid grid-cols-3 divide-x divide-slate-100">
                    <div className="p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Invoiced</p>
                      <p className="text-sm font-bold text-slate-900">{fmt$(r.periodAmount)}</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xs text-green-600 mb-0.5">Paid</p>
                      <p className="text-sm font-bold text-green-900">{fmt$(r.paidAmount)}</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xs text-red-600 mb-0.5">Still Owed</p>
                      <p className="text-sm font-bold text-red-900">{fmt$(r.outstanding)}</p>
                    </div>
                  </div>

                  {/* Payment progress bar */}
                  <div className="px-4 pb-3 space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Payment progress</span>
                      <span className="font-medium">{paidPct}% paid</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${paidPct >= 100 ? "bg-green-500" : paidPct > 0 ? "bg-amber-400" : "bg-red-300"}`}
                        style={{ width: `${Math.min(paidPct, 100)}%` }} />
                    </div>
                  </div>

                  {/* Submitted date */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      Submitted: {new Date(r.reportDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                      {r.status === "APPROVED" && <span className="ml-2 text-green-700 font-semibold">· Approved</span>}
                      {r.status === "PENDING"  && <span className="ml-2 text-amber-600 font-semibold">· Pending approval</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
