import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function StockReport() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projectId] = useState(() => { try { return localStorage.getItem("stores_active_project") || ""; } catch { return ""; } });
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");


  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/reports/stores?projectId=${projectId}`)
      .then((reports) => {
        // Aggregate all lines — latest closing balance per item
        const itemMap = {};
        const allLines = reports
          .flatMap((r) => (r.storesDetail?.lines || []).map((l) => ({ ...l, reportDate: r.reportDate })))
          .sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));

        for (const line of allLines) {
          const key = line.itemName.trim().toLowerCase();
          if (!itemMap[key]) {
            itemMap[key] = { itemName: line.itemName, received: 0, issued: 0, returned: 0, damaged: 0, balance: 0, lastDate: line.reportDate };
          }
          const entry = itemMap[key];
          entry.lastDate = line.reportDate;
          if (line.direction === "RECEIVED")      entry.received  += Number(line.quantity) || 0;
          if (line.direction === "ISSUED")        entry.issued    += Number(line.quantity) || 0;
          if (line.direction === "RETURNED")      entry.returned  += Number(line.quantity) || 0;
          if (line.direction === "DAMAGED_LOST")  entry.damaged   += Number(line.quantity) || 0;
          entry.balance = entry.received + entry.returned - entry.issued - entry.damaged;
        }
        setStockItems(Object.values(itemMap));
      })
      .catch(() => setStockItems([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = stockItems.filter((s) =>
    s.itemName.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = filtered.length;
  const lowStock = filtered.filter((s) => s.balance <= 0).length;

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">Stock Report</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-4">

        {/* Summary tiles */}
        {!loading && stockItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
              <p className="text-2xl font-black text-slate-800">{totalItems}</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Total Items</p>
            </div>
            <div className={`rounded-2xl border shadow-sm p-4 text-center ${lowStock > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <p className={`text-2xl font-black ${lowStock > 0 ? "text-red-700" : "text-green-700"}`}>{lowStock}</p>
              <p className={`text-xs font-semibold mt-0.5 ${lowStock > 0 ? "text-red-600" : "text-green-600"}`}>Out of Stock / Negative</p>
            </div>
          </div>
        )}

        {/* Search */}
        {stockItems.length > 0 && (
          <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Current Stock Levels</p>
          </div>

          {loading && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading stock data...</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              {stockItems.length === 0 ? "No stock data found for this project." : "No items match your search."}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    <th className="border border-slate-200 px-3 py-2.5 text-left">Item</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-24 text-green-700">Received</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-20 text-blue-700">Issued</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-24 text-amber-600">Returned</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-24 text-red-600">Damaged</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-24 font-black text-slate-800">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 ${item.balance <= 0 ? "bg-red-50/60" : ""}`}>
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800">
                        {item.itemName}
                        <span className="block text-xs text-slate-400 font-normal">
                          Last updated: {new Date(item.lastDate).toLocaleDateString()}
                        </span>
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
          )}
        </div>
      </div>
    </div>
  );
}
