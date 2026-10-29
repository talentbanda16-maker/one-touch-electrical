import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { isNetworkFailure } from "../lib/offlineQueue";

const newRow = () => ({ id: crypto.randomUUID(), itemName: "", date: "", goodQty: "", damagedQty: "", receivedQty: "", invoiceNo: "", supplier: "", bomItemId: "" });


export default function MaterialReceived() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projectId] = useState(() => { try { return localStorage.getItem("stores_active_project") || ""; } catch { return ""; } });
  const [bomItems, setBomItems] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState(() => [newRow(), newRow()]);

  useEffect(() => {
    const load = async () => {
      let pid = projectId;
      if (!pid) {
        const projects = await api.get("/projects").catch(() => []);
        pid = projects[0]?.id || "";
      }
      if (!pid) return;
      const items = await api.get(`/procurement?projectId=${pid}`).catch(() => []);
      if (items.length === 0) {
        const projects = await api.get("/projects").catch(() => []);
        const all = await Promise.all(projects.map(p => api.get(`/procurement?projectId=${p.id}`).catch(() => [])));
        setBomItems(all.flat());
      } else {
        setBomItems(items);
      }
    };
    load();
  }, [projectId]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());


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

    const lines = [];
    for (const r of rows) {
      if (!r.itemName.trim()) continue;
      const base = { itemName: r.itemName, deliveryReference: r.invoiceNo || undefined, supplier: r.supplier || undefined, notes: r.date || undefined, bomItemId: r.bomItemId || undefined };
      if (Number(r.receivedQty) > 0) lines.push({ ...base, direction: "RECEIVED",     quantity: Number(r.receivedQty) });
      if (Number(r.goodQty) > 0)     lines.push({ ...base, direction: "RECEIVED",     quantity: Number(r.goodQty),    notes: [r.date, "Good condition"].filter(Boolean).join(" | ") });
      if (Number(r.damagedQty) > 0)  lines.push({ ...base, direction: "DAMAGED_LOST", quantity: Number(r.damagedQty) });
    }

    if (lines.length === 0) {
      return setError("Add at least one item with a description.");
    }

    setSubmitting(true);
    try {
      await api.post("/reports/stores", {
        projectId,
        reportDate,
        submissionId,
        lines,
        shortagesAndRequirements: "",
        comments: "",
      });
      setSuccess("Material received report submitted.");
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
          <h1 className="text-base font-bold text-slate-800">Material Received</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date only */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
            <input
              type="date"
              required
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Row cards */}
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-brand-900 text-white flex items-center justify-between">
                  <p className="text-sm font-bold">Item {idx + 1}</p>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-xs text-red-300 hover:text-red-100 font-semibold">✕ Remove</button>
                  )}
                </div>
                <div className="px-4 py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                      <input type="date" value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice No.</label>
                      <input type="text" placeholder="INV-0001" value={row.invoiceNo} onChange={(e) => updateRow(row.id, "invoiceNo", e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                    <input type="text" placeholder="Item description" value={row.itemName} onChange={(e) => updateRow(row.id, "itemName", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-blue-700 mb-1">Link to BOM Material (for Cost Tracking)</label>
                    <select value={row.bomItemId} onChange={(e) => updateRow(row.id, "bomItemId", e.target.value)}
                      className="w-full rounded-xl border border-blue-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50">
                      <option value="">— None —</option>
                      {bomItems.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.unit})</option>)}
                    </select>
                    {bomItems.length === 0 && <p className="text-xs text-slate-400 mt-1">No materials set up for this project yet</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier</label>
                    <input type="text" placeholder="Supplier name" value={row.supplier} onChange={(e) => updateRow(row.id, "supplier", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-green-700 mb-1">Good Qty</label>
                      <input type="number" min="0" step="0.01" placeholder="0" value={row.goodQty} onChange={(e) => updateRow(row.id, "goodQty", e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400 bg-green-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-red-600 mb-1">Damaged</label>
                      <input type="number" min="0" step="0.01" placeholder="0" value={row.damagedQty} onChange={(e) => updateRow(row.id, "damagedQty", e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Received</label>
                      <input type="number" min="0" step="0.01" placeholder="0" value={row.receivedQty} onChange={(e) => updateRow(row.id, "receivedQty", e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addRow}
              className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-2xl py-4 text-sm font-bold transition-colors">
              + Add Item
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting || !projectId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
