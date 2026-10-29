import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { isNetworkFailure } from "../lib/offlineQueue";

const newRow = () => ({ id: crypto.randomUUID(), itemName: "", expectedQty: "", actualQty: "", damagedQty: "" });

const inputCls = "w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded bg-transparent";

export default function StockCount() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [projectId] = useState(() => { try { return localStorage.getItem("stores_active_project") || ""; } catch { return ""; } });
  const [countDate, setCountDate] = useState(today);
  const [rows, setRows] = useState(() => [newRow(), newRow(), newRow()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());


  function updateRow(id, field, val) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }
  function addRow() { setRows((rs) => [...rs, newRow()]); }
  function removeRow(id) { setRows((rs) => rs.filter((r) => r.id !== id)); }

  function discrepancy(row) {
    const exp = Number(row.expectedQty);
    const act = Number(row.actualQty);
    if (row.expectedQty === "" || row.actualQty === "") return null;
    return act - exp;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    const items = rows.filter((r) => r.itemName.trim() !== "");
    if (items.length === 0) return setError("Add at least one item.");

    // Stock count does NOT add to stock — it's audit only.
    // Only DAMAGED_LOST lines are submitted (damage found during count reduces stock).
    const damagedLines = items
      .filter((r) => Number(r.damagedQty) > 0)
      .map((r) => ({
        itemName: r.itemName,
        direction: "DAMAGED_LOST",
        quantity: Number(r.damagedQty),
        notes: "Damaged found during stock count",
      }));

    setSubmitting(true);
    try {
      if (damagedLines.length > 0) {
        await api.post("/reports/stores", {
          projectId,
          reportDate: countDate,
          submissionId,
          lines: damagedLines,
          shortagesAndRequirements: "",
          comments: `Physical stock count — ${countDate}`,
        });
      }
      setSuccess("Stock count recorded. Only damaged items have been deducted from stock.");
      setRows([newRow(), newRow()]);
    } catch (err) {
      if (isNetworkFailure(err)) setSuccess("Saved offline — will sync when back online.");
      else setError(err.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">Stock Count</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Count Date</label>
            <input type="date" required value={countDate} onChange={(e) => setCountDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">Physical Stock Count</p>
              <p className="text-xs text-slate-500 mt-0.5">Enter what you physically counted — discrepancy is calculated automatically.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    <th className="border border-slate-200 px-2 py-2.5 text-center w-8">#</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left">Item</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-28">Expected Qty</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-28">Actual Count</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-28">Discrepancy</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-28 text-red-600">Damaged</th>
                    <th className="border border-slate-200 px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const diff = discrepancy(row);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500 font-semibold">{idx + 1}</td>
                        <td className="border border-slate-200 px-1 py-1">
                          <input type="text" placeholder="Item name" value={row.itemName}
                            onChange={(e) => updateRow(row.id, "itemName", e.target.value)} className={inputCls} />
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <input type="number" min="0" step="0.01" placeholder="0" value={row.expectedQty}
                            onChange={(e) => updateRow(row.id, "expectedQty", e.target.value)} className={`${inputCls} text-center`} />
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <input type="number" min="0" step="0.01" placeholder="0" value={row.actualQty}
                            onChange={(e) => updateRow(row.id, "actualQty", e.target.value)} className={`${inputCls} text-center`} />
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-bold text-sm">
                          {diff === null ? (
                            <span className="text-slate-300">—</span>
                          ) : diff === 0 ? (
                            <span className="text-green-600">0</span>
                          ) : diff > 0 ? (
                            <span className="text-blue-600">+{diff}</span>
                          ) : (
                            <span className="text-red-600">{diff}</span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-1 py-1 bg-red-50/40">
                          <input type="number" min="0" step="0.01" placeholder="0" value={row.damagedQty}
                            onChange={(e) => updateRow(row.id, "damagedQty", e.target.value)} className={`${inputCls} text-center`} />
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          {rows.length > 1 && (
                            <button type="button" onClick={() => removeRow(row.id)} className="text-slate-400 hover:text-red-500 text-xl leading-none">×</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100">
              <button type="button" onClick={addRow} className="text-sm text-blue-600 hover:text-blue-800 font-semibold">+ Add row</button>
            </div>
          </div>

          <button type="submit" disabled={submitting || !projectId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
            {submitting ? "Submitting..." : "Submit Stock Count"}
          </button>
        </form>
      </div>
    </div>
  );
}
