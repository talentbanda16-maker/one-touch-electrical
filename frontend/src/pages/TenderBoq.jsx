import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

/* ---------- Smart Excel parser for the client (unpriced) BOQ ---------- */
// Reads every sheet, finds the header row (columns move around between
// sheets), groups wrapped description rows into one item, and picks up
// Unit/Qty. Existing rates are ignored — the QS re-prices.
function parseBoqWorkbook(wb) {
  const lines = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });

    // Find the header row + column positions.
    let headerIdx = -1;
    let cols = null;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const cells = rows[r].map((c) => String(c).toLowerCase().trim());
      const find = (re) => cells.findIndex((c) => re.test(c));
      const descC = find(/^desc/);
      const unitC = find(/^unit/);
      const qtyC = find(/^qty|^quantity/);
      const itemC = find(/^item/);
      if (descC !== -1 && unitC !== -1 && qtyC !== -1) {
        headerIdx = r;
        cols = { item: itemC, desc: descC, unit: unitC, qty: qtyC };
        break;
      }
    }
    if (headerIdx === -1) continue; // not a BOQ sheet — skip

    // Bill title: a row containing "BILL No." else the sheet name.
    let bill = sheetName.trim();
    for (let r = 0; r < Math.min(14, rows.length); r++) {
      const joined = rows[r].map((c) => String(c)).join(" ");
      if (/bill\s*no/i.test(joined)) { bill = joined.replace(/\s+/g, " ").trim(); break; }
    }

    let current = null;
    const closeCurrent = () => { if (current) { lines.push(current); current = null; } };

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const cell = (i) => (i >= 0 && i < row.length ? row[i] : "");
      const itemNo = String(cell(cols.item)).trim();
      const desc = String(cell(cols.desc)).trim();
      const unit = String(cell(cols.unit)).trim();
      const qtyRaw = String(cell(cols.qty)).replace(/[, ]/g, "").trim();
      const qtyNum = parseFloat(qtyRaw);
      const hasQty = qtyRaw !== "" && !isNaN(qtyNum);

      if (itemNo) {
        closeCurrent();
        current = { bill, isHeading: false, itemNumber: itemNo, description: desc, unit: unit || null, quantity: hasQty ? qtyNum : null, rate: null };
        continue;
      }
      if (hasQty) {
        if (current && current.quantity == null) {
          current.unit = current.unit || unit || null;
          current.quantity = qtyNum;
          if (desc) current.description += (current.description ? " " : "") + desc;
        } else {
          closeCurrent();
          current = { bill, isHeading: false, itemNumber: null, description: desc, unit: unit || null, quantity: qtyNum, rate: null };
        }
      } else if (desc) {
        if (current && current.quantity == null) {
          current.description += (current.description ? " " : "") + desc; // wrapped line
        } else {
          closeCurrent();
          lines.push({ bill, isHeading: true, itemNumber: null, description: desc, unit: null, quantity: null, rate: null });
        }
      }
    }
    closeCurrent();
  }
  return lines;
}

function money(n) {
  return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TenderBoq() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "QS";

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // parsed lines awaiting save
  const [view, setView] = useState("priced"); // priced | client
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!projectId) { setItems([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/tender-boq`)
      .then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const lines = parseBoqWorkbook(wb);
        if (lines.length === 0) { setMsg("Couldn't find any BOQ items in that file."); return; }
        setPreview(lines);
      } catch {
        setMsg("Could not read that Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  async function saveImport() {
    setSaving(true); setMsg("");
    try {
      const r = await api.post(`/projects/${projectId}/tender-boq/import`, { lines: preview });
      setPreview(null);
      load();
      setMsg(`BOQ imported ✓ ${r.materials ?? 0} materials added to your database automatically. Now fill in the rates.`);
    } catch (err) {
      setMsg(err.message || "Import failed");
    } finally { setSaving(false); }
  }

  function setRate(id, value) {
    setItems((its) => its.map((it) => (it.id === id ? { ...it, rate: value === "" ? null : Number(value) } : it)));
  }

  async function saveRates() {
    setSaving(true); setMsg("");
    try {
      const rates = items.filter((i) => !i.isHeading).map((i) => ({ id: i.id, rate: i.rate != null ? Number(i.rate) : null }));
      await api.put(`/projects/${projectId}/tender-boq/rates`, { rates });
      setMsg("Rates saved ✓");
    } catch (err) {
      setMsg(err.message || "Save failed");
    } finally { setSaving(false); }
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "Project";

  // Build the priced BOQ as an Excel file and download it.
  function downloadExcel() {
    const aoa = [[`TENDER BOQ — ${projectName}`], [], ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]];
    let curBill = null;
    for (const it of items) {
      if ((it.bill || "BOQ") !== curBill) { curBill = it.bill || "BOQ"; aoa.push([curBill]); }
      if (it.isHeading) { aoa.push(["", it.description]); continue; }
      const amount = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
      aoa.push([it.itemNumber || "", it.description, it.unit || "", it.quantity ?? "", it.rate ?? "", it.rate != null ? amount : ""]);
    }
    aoa.push([], ["", "", "", "", "GRAND TOTAL", grandTotal]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 8 }, { wch: 60 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    const safe = projectName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    XLSX.writeFile(wb, `Tender_BOQ_${safe || "project"}.xlsx`);
  }

  // Group items by bill for display.
  const grouped = useMemo(() => {
    const g = [];
    const map = new Map();
    for (const it of items) {
      const key = it.bill || "BOQ";
      if (!map.has(key)) { map.set(key, []); g.push({ bill: key, rows: map.get(key) }); }
      map.get(key).push(it);
    }
    return g;
  }, [items]);

  const grandTotal = useMemo(
    () => items.reduce((s, i) => s + (i.isHeading ? 0 : (Number(i.quantity) || 0) * (Number(i.rate) || 0)), 0),
    [items]
  );
  const pricedCount = items.filter((i) => !i.isHeading && i.rate != null).length;
  const itemCount = items.filter((i) => !i.isHeading).length;
  const status = itemCount === 0 ? null : pricedCount === 0 ? "Unpriced" : pricedCount >= itemCount ? "Priced" : "Pricing…";

  return (
    <div className="p-4 max-w-[1100px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Tender BOQ</h1>
          <p className="text-xs text-slate-500">Upload the client's BOQ, then fill in your rates.</p>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to begin.</p>}

      {/* Preview after upload */}
      {preview && (
        <div className="bg-white rounded-xl border border-brand-300 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">
              Preview — {preview.filter((l) => !l.isHeading).length} items across {new Set(preview.map((l) => l.bill)).size} bills
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="text-sm border border-slate-300 rounded px-3 py-1">Cancel</button>
              <button onClick={saveImport} disabled={saving} className="text-sm bg-brand-900 text-white rounded px-4 py-1 disabled:opacity-50">{saving ? "Saving…" : "Save BOQ"}</button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">Check it looks right, then Save. (Rates come in empty — you'll add them next.)</p>
          <div className="max-h-96 overflow-y-auto border border-slate-100 rounded">
            <table className="w-full text-xs">
              <tbody>
                {preview.map((l, i) => (
                  l.isHeading ? (
                    <tr key={i} className="bg-slate-100"><td colSpan={4} className="px-2 py-1 font-semibold text-slate-600">{l.description}</td></tr>
                  ) : (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-2 py-1 font-mono text-slate-400 w-16">{l.itemNumber}</td>
                      <td className="px-2 py-1">{l.description}</td>
                      <td className="px-2 py-1 text-slate-500 w-12">{l.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums w-20">{l.quantity ?? ""}</td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state — upload */}
      {projectId && !preview && items.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700 mb-1">No BOQ yet</p>
          {canEdit ? (
            <>
              <p className="text-xs text-slate-500 mb-3">Upload the client's BOQ Excel file to get started.</p>
              <label className="inline-block bg-brand-900 text-white rounded-lg px-4 py-2 text-sm cursor-pointer hover:opacity-90">
                📤 Upload BOQ
                <input type="file" accept=".xls,.xlsx" onChange={onFile} className="hidden" />
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-500">The QS hasn't uploaded a BOQ for this project yet.</p>
          )}
        </div>
      )}

      {/* The BOQ */}
      {projectId && !preview && items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              {status && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  status === "Priced" ? "bg-green-100 text-green-700" : status === "Unpriced" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                }`}>{status}</span>
              )}
              <span className="text-xs text-slate-400">{pricedCount}/{itemCount} priced</span>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
                <button onClick={() => setView("priced")} className={`px-2.5 py-1 ${view === "priced" ? "bg-brand-900 text-white" : "text-slate-600"}`}>Priced</button>
                <button onClick={() => setView("client")} className={`px-2.5 py-1 ${view === "client" ? "bg-brand-900 text-white" : "text-slate-600"}`}>Client</button>
              </div>
              {canEdit && (
                <>
                  <label className="text-xs border border-slate-300 rounded px-2 py-1 cursor-pointer hover:bg-slate-50">
                    Re-upload
                    <input type="file" accept=".xls,.xlsx" onChange={onFile} className="hidden" />
                  </label>
                  {view === "priced" && (
                    <button onClick={saveRates} disabled={saving} className="text-xs bg-brand-900 text-white rounded px-3 py-1 disabled:opacity-50">{saving ? "Saving…" : "Save rates"}</button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2 w-16">Item</th>
                  <th className="py-1.5 pr-2">Description</th>
                  <th className="py-1.5 pr-2 w-12">Unit</th>
                  <th className="py-1.5 pr-2 text-right w-20">Qty</th>
                  {view === "priced" && <th className="py-1.5 pr-2 text-right w-28">Rate</th>}
                  {view === "priced" && <th className="py-1.5 pr-2 text-right w-28">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <GroupBlock key={g.bill} bill={g.bill} rows={g.rows} view={view} canEdit={canEdit} setRate={setRate} />
                ))}
              </tbody>
              {view === "priced" && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={5} className="py-2 text-right text-xs font-semibold text-slate-600">GRAND TOTAL</td>
                    <td className="py-2 text-right font-bold tabular-nums">{money(grandTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Done? Download the BOQ / extract materials */}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">Done editing?</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadExcel} className="inline-flex items-center gap-1.5 text-sm bg-brand-900 text-white rounded-lg px-4 py-2 hover:opacity-90">
                ⬇️ Download BOQ (Excel)
              </button>
              <button onClick={() => navigate(`/materials?projectId=${projectId}`)} className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-700 rounded-lg px-4 py-2 hover:bg-slate-50">
                🧱 View Materials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupBlock({ bill, rows, view, canEdit, setRate }) {
  const subtotal = rows.reduce((s, i) => s + (i.isHeading ? 0 : (Number(i.quantity) || 0) * (Number(i.rate) || 0)), 0);
  const cols = view === "priced" ? 6 : 4;
  return (
    <>
      <tr className="bg-brand-900/90">
        <td colSpan={cols} className="px-2 py-1.5 text-xs font-bold text-white uppercase tracking-wide">{bill}</td>
      </tr>
      {rows.map((it) => {
        if (it.isHeading) {
          return (
            <tr key={it.id} className="bg-slate-100">
              <td colSpan={cols} className="px-2 py-1 text-xs font-semibold text-slate-600">{it.description}</td>
            </tr>
          );
        }
        const amount = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
        return (
          <tr key={it.id} className="border-b border-slate-100">
            <td className="py-1.5 pr-2 font-mono text-xs text-slate-400 align-top">{it.itemNumber}</td>
            <td className="py-1.5 pr-2 align-top">{it.description}</td>
            <td className="py-1.5 pr-2 text-slate-500 align-top">{it.unit}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums align-top">{it.quantity != null ? Number(it.quantity).toLocaleString() : ""}</td>
            {view === "priced" && (
              <td className="py-1 pr-2 text-right align-top">
                {canEdit ? (
                  <input
                    type="number" step="0.01" min="0"
                    value={it.rate ?? ""}
                    onChange={(e) => setRate(it.id, e.target.value)}
                    placeholder="0.00"
                    className="w-24 border border-slate-300 rounded px-1 py-0.5 text-right"
                  />
                ) : (
                  <span className="tabular-nums">{it.rate != null ? money(it.rate) : "—"}</span>
                )}
              </td>
            )}
            {view === "priced" && (
              <td className="py-1.5 pr-2 text-right tabular-nums font-medium align-top">{it.rate != null ? money(amount) : "—"}</td>
            )}
          </tr>
        );
      })}
      {view === "priced" && (
        <tr className="border-b border-slate-200">
          <td colSpan={5} className="py-1.5 pr-2 text-right text-[11px] font-semibold text-slate-500">Subtotal — {bill.length > 40 ? bill.slice(0, 40) + "…" : bill}</td>
          <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-slate-700">{money(subtotal)}</td>
        </tr>
      )}
    </>
  );
}
