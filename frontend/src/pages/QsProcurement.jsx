import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

function fmt$(v) {
  if (v == null || isNaN(v)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
function fmtN(v, unit = "") {
  if (v == null || isNaN(v)) return "—";
  return `${Number(v).toLocaleString()}${unit ? " " + unit : ""}`;
}

export default function QsProcurement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlProjectId = searchParams.get("projectId");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(urlProjectId ?? "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0); // 0=Stock Report 1=Cost
  // Stock report state
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (!urlProjectId && data.length > 0) setProjectId(data[0].id);
    }).catch(() => {});
  }, []);

  const loadItems = (pid) => {
    if (!pid) return;
    setLoading(true);
    api.get(`/procurement?projectId=${pid}`).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  const loadStock = (pid) => {
    if (!pid) return;
    setStockLoading(true);
    api.get(`/reports/stores?projectId=${pid}`)
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
      .finally(() => setStockLoading(false));
  };

  useEffect(() => { loadItems(projectId); loadStock(projectId); }, [projectId]);

  const totalBudget   = items.reduce((s, i) => s + i.budgetCost, 0);
  const totalActual   = items.reduce((s, i) => s + i.qtyDelivered * i.unitPrice, 0);
  const totalVariance = totalActual - totalBudget;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/dashboard/qs")}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg">
          ← Back
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Procurement / Stores</h1>
          <p className="text-xs text-slate-500">Bill of Materials — stock tracking &amp; cost control</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
        {/* Project selector — hidden when projectId came from dashboard URL */}
        {!urlProjectId && (
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm bg-white">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        )}

        {/* Cost Tracking navigation button — only on main view */}
        {tab === 0 && (
          <button onClick={() => setTab(1)}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-semibold shadow-sm hover:bg-slate-50">
            Cost Tracking
          </button>
        )}

        {/* Back button — only inside Cost Tracking */}
        {tab === 1 && (
          <div className="flex items-center gap-3">
            <button onClick={() => setTab(0)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg">← Back</button>
            <h2 className="font-bold text-slate-900 text-base">Cost Tracking</h2>
          </div>
        )}

        {/* ── MATERIALS & STOCK TAB ── */}
        {tab === 0 && (
          <div className="space-y-3">
            {stockLoading && <p className="text-sm text-slate-400 text-center py-8">Loading stock…</p>}

            {!stockLoading && (
              <>
                {/* Summary tiles */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Total Items</p>
                    <p className="text-xl font-bold text-slate-900">{stockItems.length}</p>
                  </div>
                  <div className={`rounded-xl border p-3 text-center ${stockItems.filter((i) => i.balance <= 0).length > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                    <p className={`text-xs mb-1 ${stockItems.filter((i) => i.balance <= 0).length > 0 ? "text-red-600" : "text-green-600"}`}>Out of Stock</p>
                    <p className={`text-xl font-bold ${stockItems.filter((i) => i.balance <= 0).length > 0 ? "text-red-900" : "text-green-900"}`}>
                      {stockItems.filter((i) => i.balance <= 0).length}
                    </p>
                  </div>
                </div>

                {/* Out-of-stock alert */}
                {stockItems.filter((i) => i.balance <= 0).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-red-700 mb-1">Out of Stock</p>
                    <p className="text-xs text-red-600">{stockItems.filter((i) => i.balance <= 0).map((i) => i.itemName).join(", ")}</p>
                  </div>
                )}

                {/* Low-stock alert */}
                {stockItems.filter((i) => i.balance > 0 && i.balance <= 10).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-amber-700 mb-1">Low Stock</p>
                    <p className="text-xs text-amber-600">{stockItems.filter((i) => i.balance > 0 && i.balance <= 10).map((i) => i.itemName).join(", ")}</p>
                  </div>
                )}

                {/* Search */}
                <input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Search items…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white" />

                {/* Table */}
                {stockItems.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📦</span>
                    <p className="font-semibold text-slate-500">No stock recorded yet</p>
                    <p>Stores department hasn't logged any materials for this project.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-6 bg-brand-600 text-white text-xs font-semibold px-3 py-2.5 gap-1">
                      <span className="col-span-2">Item</span>
                      <span className="text-right">Received</span>
                      <span className="text-right">Issued</span>
                      <span className="text-right">Returned</span>
                      <span className="text-right">Balance</span>
                    </div>
                    {stockItems
                      .filter((i) => !stockSearch || i.itemName.toLowerCase().includes(stockSearch.toLowerCase()))
                      .map((item, idx) => (
                        <div key={item.itemName} className={`grid grid-cols-6 px-3 py-2.5 gap-1 border-b border-slate-100 last:border-0 items-center ${idx % 2 === 1 ? "bg-slate-50" : ""}`}>
                          <div className="col-span-2 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{item.itemName}</p>
                            {item.balance <= 0 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">OUT</span>}
                            {item.balance > 0 && item.balance <= 10 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">LOW</span>}
                          </div>
                          <p className="text-right text-xs text-slate-700">{item.received}</p>
                          <p className="text-right text-xs text-slate-700">{item.issued}</p>
                          <p className="text-right text-xs text-slate-700">{item.returned}</p>
                          <p className={`text-right text-xs font-bold ${item.balance <= 0 ? "text-red-600" : item.balance <= 10 ? "text-amber-600" : "text-green-700"}`}>
                            {item.balance}
                          </p>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Read-only notice */}
                <p className="text-xs text-slate-400 text-center pb-2">Read-only · Data recorded by Stores department</p>
              </>
            )}
          </div>
        )}

        {/* ── COST TRACKING TAB ── */}
        {!loading && tab === 1 && (
          <div className="space-y-4">
            {/* Cost summary tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Total Budget</p>
                <p className="text-sm font-bold text-slate-900">{fmt$(totalBudget)}</p>
              </div>
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center">
                <p className="text-xs text-blue-600 mb-1">Actual Cost</p>
                <p className="text-sm font-bold text-slate-900">{fmt$(totalActual)}</p>
                <p className="text-blue-400 text-center" style={{fontSize:"9px"}}>from Stores</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${totalVariance > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                <p className={`text-xs mb-1 ${totalVariance > 0 ? "text-red-600" : "text-green-600"}`}>Variance</p>
                <p className={`text-sm font-bold ${totalVariance > 0 ? "text-red-900" : "text-green-900"}`}>
                  {totalVariance > 0 ? "+" : ""}{fmt$(totalVariance)}
                </p>
              </div>
            </div>

            {/* Cost table */}
            {items.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📐</span>
                <p className="font-semibold text-slate-500">No BOM items yet</p>
                <p>Upload a BOQ to auto-populate cost tracking.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-5 bg-brand-600 text-white text-xs font-semibold px-3 py-2.5 gap-1">
                  <span className="col-span-2">Material</span>
                  <span className="text-right">Actual Cost</span>
                  <span className="text-right">Budget</span>
                  <span className="text-right">Variance</span>
                </div>
                {items.map((item, idx) => {
                  const actualCost   = item.qtyDelivered * item.unitPrice;
                  const itemVariance = actualCost - item.budgetCost;
                  return (
                    <div key={item.id} className={`grid grid-cols-5 px-3 py-3 gap-1 border-b border-slate-100 last:border-0 items-center ${idx % 2 === 1 ? "bg-slate-50" : ""}`}>
                      <div className="col-span-2 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                        <p className="text-xs text-blue-500">{fmtN(item.qtyDelivered)} {item.unit} received × {fmt$(item.unitPrice)}</p>
                        {item.createdBy && <p className="text-xs text-slate-400">Added by {item.createdBy.name}</p>}
                      </div>
                      <p className="text-right text-sm font-semibold text-slate-900">{fmt$(actualCost)}</p>
                      <p className="text-right text-sm text-slate-600">{fmt$(item.budgetCost)}</p>
                      <p className={`text-right text-sm font-bold ${itemVariance > 0 ? "text-red-600" : itemVariance < 0 ? "text-green-700" : "text-slate-400"}`}>
                        {itemVariance > 0 ? "+" : ""}{fmt$(itemVariance)}
                      </p>
                    </div>
                  );
                })}
                <div className="grid grid-cols-5 px-3 py-2.5 bg-slate-50 border-t-2 border-slate-200 gap-1">
                  <span className="col-span-2 text-xs font-bold text-slate-700">Total</span>
                  <span className="text-right text-sm font-bold text-slate-900">{fmt$(totalActual)}</span>
                  <span className="text-right text-sm font-bold text-slate-700">{fmt$(totalBudget)}</span>
                  <span className={`text-right text-sm font-bold ${totalVariance > 0 ? "text-red-600" : "text-green-700"}`}>
                    {totalVariance > 0 ? "+" : ""}{fmt$(totalVariance)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
