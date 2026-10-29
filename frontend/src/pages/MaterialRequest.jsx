import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { isNetworkFailure } from "../lib/offlineQueue";

const newRow = () => ({ id: crypto.randomUUID(), itemName: "", description: "", quantity: "", unit: "", dateNeeded: "" });

const inputCls =
  "w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded bg-transparent";

export default function MaterialRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projectId] = useState(() => { try { return localStorage.getItem("stores_active_project") || localStorage.getItem("active_project") || ""; } catch { return ""; } });
  const [rows, setRows] = useState(() => [newRow(), newRow()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);


  function updateRow(id, field, val) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const items = rows.filter((r) => r.itemName.trim() !== "");
    if (items.length === 0) return setError("Add at least one item.");

    setSubmitting(true);
    try {
      for (const r of items) {
        await api.post(`/projects/${projectId}/requisitions`, {
          itemName: r.itemName,
          quantityRequested: Number(r.quantity) || 0,
          unit: r.unit || undefined,
          urgency: "MEDIUM",
          notes: [r.description, r.dateNeeded ? `Needed by: ${r.dateNeeded}` : ""].filter(Boolean).join(" | ") || undefined,
        });
      }
      setSuccess("Material request submitted successfully.");
      setRows([newRow(), newRow()]);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setSuccess("Saved offline — will sync when back online.");
      } else {
        setError(err.message || "Failed to submit.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top bar */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">Material Request</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Requested by */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Requested By</label>
            <div className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-slate-50 text-slate-700">{user?.name}</div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">Items Requested</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse table-auto">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    <th className="border border-slate-200 px-2 py-2.5 text-center w-8">#</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left min-w-[160px]">Item</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left min-w-[140px]">Description</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center w-24">Quantity</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left w-24">Unit</th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left w-36">Date Needed By</th>
                    <th className="border border-slate-200 px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500 font-semibold">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input
                          type="text"
                          placeholder="Item name"
                          value={row.itemName}
                          onChange={(e) => updateRow(row.id, "itemName", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input
                          type="text"
                          placeholder="Description"
                          value={row.description}
                          onChange={(e) => updateRow(row.id, "description", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                          className={`${inputCls} text-center`}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input
                          type="text"
                          placeholder="e.g. m, pcs"
                          value={row.unit}
                          onChange={(e) => updateRow(row.id, "unit", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input
                          type="date"
                          value={row.dateNeeded}
                          onChange={(e) => updateRow(row.id, "dateNeeded", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="text-slate-400 hover:text-red-500 text-xl leading-none"
                          >×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={addRow}
                className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
              >
                + Add row
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !projectId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
