import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { extractPdfText, parseDrawingText, renderPdfToCanvas, imageToCanvas, ocrCanvas } from "../lib/drawingExtract";

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function fileIcon(mime) {
  if (mime === "application/pdf") return "📕";
  if (mime?.startsWith("image/")) return "🖼️";
  if (mime?.includes("word")) return "📘";
  return "📐";
}
function fmtDate(d) {
  try { return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
// Gemini vision only reads these; Word/other drawings can still be stored & viewed,
// just not auto-counted.
const AI_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const confidenceStyle = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
};

// The AI-read / confirm panel for a single drawing. The AI describes the
// drawing and lists everything it can identify on it; the QS reviews, edits
// the list, and saves.
function DevicePanel({ projectId, drawing, canEdit, onSaved }) {
  const existing = drawing.devices;
  const [open, setOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null); // { summary, items:[{name,count}], confidence, notes, source }
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const canRead = AI_TYPES.has(drawing.mimeType);

  async function sendToBoq() {
    setErr(""); setSentMsg(""); setSending(true);
    try {
      const r = await api.post(`/projects/${projectId}/drawings/${drawing.id}/send-to-boq`);
      setSentMsg(`Added ${r.added} item${r.added === 1 ? "" : "s"} to the Tender BOQ ✓`);
    } catch (e) { setErr(e.message || "Couldn't send to BOQ"); }
    finally { setSending(false); }
  }

  // Read the PDF's embedded text and turn the labels into take-off items,
  // then open the editor so the QS reviews/adjusts before saving.
  async function extractFromPdf() {
    setErr(""); setExtractMsg(""); setExtracting(true);
    try {
      const blob = await api.blob(`/attachments/${drawing.id}/file`);
      const buf = await blob.arrayBuffer();
      let found = [];
      if (drawing.mimeType === "application/pdf") {
        found = parseDrawingText(await extractPdfText(buf));
      }
      // No usable text layer (graphics-only layout, or an image) → OCR the picture.
      if (found.length < 2) {
        setExtractMsg("No text layer — reading the image with OCR (slower; first run downloads the engine)…");
        const canvas = drawing.mimeType === "application/pdf"
          ? await renderPdfToCanvas(buf, 2.6)
          : await imageToCanvas(blob);
        const ocrText = await ocrCanvas(canvas, (p) => setExtractMsg(`Reading image with OCR… ${Math.round(p * 100)}%`));
        const ocrFound = parseDrawingText(ocrText);
        if (ocrFound.length > found.length) found = ocrFound;
      }
      if (!found.length) {
        setErr("Couldn't read components from this drawing — even with OCR the symbols are too graphical. Use Enter manually for this one.");
        return;
      }
      const base = existing
        ? (existing.items || []).map((o) => ({ name: o.name || "", qty: o.qty ?? o.count ?? "", rating: o.rating ?? "", unit: o.unit || "nr" }))
        : [];
      setDraft({ summary: existing?.summary || "", items: [...base, ...found], confidence: null, notes: "", source: "manual" });
      setOpen(true);
    } catch (e) {
      setErr(e?.message || "Could not read the drawing.");
    } finally { setExtracting(false); setExtractMsg(""); }
  }

  function startManual() {
    setErr("");
    const norm = (arr) => (arr || []).map((o) => ({ name: o.name || "", qty: o.qty ?? o.count ?? "", rating: o.rating ?? "", unit: o.unit || "nr" }));
    setDraft(existing
      ? { summary: existing.summary || "", items: norm(existing.items), confidence: existing.confidence, notes: existing.notes || "", source: "manual" }
      : { summary: "", items: [{ name: "", qty: "", rating: "", unit: "nr" }], confidence: null, notes: "", source: "manual" });
    setOpen(true);
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setErr("");
    try {
      const { devices } = await api.put(`/projects/${projectId}/drawings/${drawing.id}/devices`, {
        summary: draft.summary,
        items: (draft.items || []).filter((o) => o.name && o.name.trim()),
        notes: draft.notes, confidence: draft.confidence, source: draft.source,
      });
      onSaved?.(drawing.id, devices);
      setOpen(false); setDraft(null);
    } catch (e) { setErr(e.message || "Save failed"); }
    finally { setSaving(false); }
  }

  const qnum = (v) => (v === "" ? "" : Math.max(0, Number(v) || 0)); // qty may be decimal (e.g. metres)
  const setItem = (i, patch) => setDraft((d) => ({ ...d, items: d.items.map((x, j) => j === i ? { ...x, ...patch } : x) }));
  const savedItems = existing?.items || [];

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      {/* Saved read-out */}
      {existing && !open && (existing.summary || savedItems.length > 0) && (
        <div className="mb-2 space-y-1.5">
          {existing.summary && <p className="text-xs text-slate-600 italic">“{existing.summary}”</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {(showAll ? savedItems : savedItems.slice(0, 8)).map((o, i) => {
              const hasQty = o.qty !== null && o.qty !== undefined && o.qty !== "";
              return (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {o.name}{o.rating ? ` ${o.rating}` : ""} · <b>{hasQty ? o.qty : "—"} {o.unit || "nr"}</b>
                </span>
              );
            })}
            {savedItems.length > 8 && (
              <button onClick={() => setShowAll((s) => !s)} className="text-[11px] text-indigo-600 hover:underline">
                {showAll ? "show less" : `+${savedItems.length - 8} more`}
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-400">
            {existing.source === "ai" ? "read by AI" : "entered by QS"}{existing.savedBy ? ` · ${existing.savedBy}` : ""}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {canEdit && !open && (
        <div className="flex flex-wrap items-center gap-2">
          {canRead && (
            <button onClick={extractFromPdf} disabled={extracting}
              title="Read components from the drawing — PDF text if present, otherwise OCR the image"
              className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-brand-900 text-white disabled:opacity-50 hover:opacity-90">
              {extracting ? "Reading…" : "📄 Extract take-off"}
            </button>
          )}
          <button onClick={startManual} className="text-xs rounded-lg px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50">
            {existing ? "Edit list" : "Enter manually"}
          </button>
          {existing && (existing.items || []).length > 0 && (
            <button onClick={sendToBoq} disabled={sending}
              title="Add this take-off into the project's Tender BOQ to price"
              className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-green-600 text-white disabled:opacity-50 hover:bg-green-700">
              {sending ? "Sending…" : "📋 Send to BOQ"}
            </button>
          )}
          {!canRead && <span className="text-[10px] text-slate-400">reads PDF/image only</span>}
        </div>
      )}

      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      {extractMsg && <p className="text-xs text-blue-600 mt-2">{extractMsg}</p>}
      {sentMsg && <p className="text-xs text-green-700 mt-2 bg-green-50 border border-green-200 rounded px-2 py-1">{sentMsg} — open <b>Tender BOQ</b> to add rates.</p>}

      {/* Review / edit panel */}
      {open && draft && (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              {draft.source === "ai" ? "What the AI sees — check & correct before saving" : "Describe the drawing & list items"}
            </p>
            {draft.source === "ai" && draft.confidence && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${confidenceStyle[draft.confidence] || "bg-slate-100 text-slate-600"}`}>
                {draft.confidence} confidence
              </span>
            )}
          </div>

          {/* Summary / description */}
          <label className="block">
            <span className="text-[11px] text-slate-500">What this drawing is</span>
            <textarea rows={2} value={draft.summary}
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              placeholder="e.g. Single-line diagram of Feeder Pillars 1–4 and streetlight DBs"
              className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs resize-y" />
          </label>

          {/* Items list — each with quantity needed + unit of measure */}
          <div className="space-y-1.5">
            <datalist id="uom-list">
              {["nr", "m", "m²", "mm²", "kg", "set", "lot", "no", "pts"].map((u) => <option key={u} value={u} />)}
            </datalist>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Items — qty, size/rating &amp; unit</span>
              <span className="text-[10px] text-slate-400">{(draft.items || []).length} item(s)</span>
            </div>
            {(draft.items || []).length > 0 && (
              <div className="flex items-center gap-1 px-0.5">
                <span className="flex-1 text-[9px] uppercase tracking-wide text-slate-400">Item</span>
                <span className="w-10 text-[9px] uppercase tracking-wide text-slate-400 text-right">Qty</span>
                <span className="w-16 text-[9px] uppercase tracking-wide text-slate-400">Size/Rating</span>
                <span className="w-10 text-[9px] uppercase tracking-wide text-slate-400">Unit</span>
                <span className="w-4" />
              </div>
            )}
            {(draft.items || []).length === 0 && (
              <p className="text-[11px] text-slate-400">Nothing listed yet — add an item below.</p>
            )}
            {(draft.items || []).map((o, i) => (
              <div key={i} className="flex items-center gap-1">
                <input value={o.name} placeholder="Item"
                  onChange={(e) => setItem(i, { name: e.target.value })}
                  className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs" />
                <input type="number" min="0" step="any" value={o.qty ?? ""} placeholder="?" title="How many (count) — or metres for a cable (unit m)"
                  onChange={(e) => setItem(i, { qty: qnum(e.target.value) })}
                  className="w-10 rounded border border-slate-300 px-1 py-1 text-xs text-right tabular-nums" />
                <input value={o.rating ?? ""} placeholder="size?" title="Size / rating — how big it is (type it if blank)"
                  onChange={(e) => setItem(i, { rating: e.target.value.slice(0, 60) })}
                  className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs placeholder:text-amber-500" />
                <input value={o.unit} list="uom-list" placeholder="nr" title="Unit"
                  onChange={(e) => setItem(i, { unit: e.target.value.slice(0, 16) })}
                  className="w-10 rounded border border-slate-300 px-1 py-1 text-xs" />
                <button onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
                  className="text-red-400 hover:text-red-600 text-xs px-0.5">✕</button>
              </div>
            ))}
            <button onClick={() => setDraft((d) => ({ ...d, items: [...(d.items || []), { name: "", qty: 1, rating: "", unit: "nr" }] }))}
              className="text-[11px] text-indigo-600 hover:underline">+ add item</button>
          </div>

          {draft.notes && draft.source === "ai" && (
            <p className="text-[11px] text-slate-500 bg-white/70 border border-slate-200 rounded p-2">AI note: {draft.notes}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-green-600 text-white disabled:opacity-50 hover:bg-green-700">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setOpen(false); setDraft(null); setErr(""); }}
              className="text-xs rounded-lg px-3 py-1.5 border border-slate-300 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Drawings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "QS";

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!projectId) { setDrawings([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/drawings`)
      .then(setDrawings).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.upload(`/projects/${projectId}/drawings`, fd);
      setMsg("Drawing uploaded ✓");
      load();
    } catch (err) {
      setMsg(err.message || "Upload failed");
    } finally { setUploading(false); }
  }

  async function openFile(d, download = false) {
    try {
      const blob = await api.blob(`/attachments/${d.id}/file`);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement("a");
        a.href = url; a.download = d.fileName;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setMsg("Could not open the file.");
    }
  }

  async function remove(d) {
    if (!window.confirm(`Delete "${d.fileName}"? This version can't be recovered.`)) return;
    try {
      await api.delete(`/projects/${projectId}/drawings/${d.id}`);
      load();
    } catch (err) { setMsg(err.message || "Delete failed"); }
  }

  function onDevicesSaved(id, devices) {
    setDrawings((list) => list.map((d) => d.id === id ? { ...d, devices } : d));
  }

  return (
    <div className="p-4 max-w-[800px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Drawings</h1>
          <p className="text-xs text-slate-500">Upload the project drawings (PDF or image). Every version is kept — newest shows as Current. Count a symbol with OpenCV, or list items manually, then send to the BOQ.</p>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to manage its drawings.</p>}

      {projectId && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {canEdit && (
            <label className={`inline-flex items-center gap-2 text-sm bg-brand-900 text-white rounded-lg px-4 py-2 cursor-pointer hover:opacity-90 mb-4 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              📤 {uploading ? "Uploading…" : drawings.length ? "Upload new version" : "Upload drawing"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,.doc,.docx" onChange={onFile} className="hidden" />
            </label>
          )}

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && drawings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              {canEdit ? "No drawings uploaded yet. Upload a PDF or image above." : "No drawings uploaded for this project yet."}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {drawings.map((d, i) => (
              <div key={d.id} className={`rounded-lg border p-3 ${i === 0 ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{fileIcon(d.mimeType)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 truncate">{d.fileName}</span>
                      {i === 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">{fmtSize(d.fileSize)} · {fmtDate(d.createdAt)}{d.uploadedBy?.name ? ` · ${d.uploadedBy.name}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => openFile(d, false)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">View</button>
                    <button onClick={() => openFile(d, true)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">⬇️</button>
                    {canEdit && <button onClick={() => remove(d)} className="text-xs text-red-400 hover:text-red-600 px-1.5">✕</button>}
                  </div>
                </div>

                <DevicePanel projectId={projectId} drawing={d} canEdit={canEdit} onSaved={onDevicesSaved} />
              </div>
            ))}
          </div>

          {canEdit && drawings.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-3">
              📄 Extract take-off reads the components from the drawing (PDF text, or OCR for scanned ones) — always check the list before you save. Upload a new version any time; the old ones stay traceable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
