import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import DocViewer from "../components/DocViewer";

function toWeek(v) {
  if (v == null) return null;
  const m = String(v).match(/\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0])) : null;
}

// Pull activities out of a table (array of row-arrays) by matching header labels.
function rowsToActivities(rows) {
  let headerIdx = -1;
  let cols = null;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const cells = rows[r].map((c) => String(c).toLowerCase());
    const find = (re) => cells.findIndex((c) => re.test(c));
    const nameC = find(/activity|task|work package/);
    if (nameC !== -1) {
      headerIdx = r;
      cols = { name: nameC, dur: find(/dur/), start: find(/start/), finish: find(/finish|end/), notes: find(/note|remark|depend/) };
      break;
    }
  }
  if (headerIdx === -1) return [];
  const acts = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i) => (i >= 0 && i < row.length ? String(row[i]).trim() : "");
    const name = cell(cols.name);
    if (!name || /^(total|grand|sub-?total)/i.test(name)) continue;
    acts.push({
      name,
      durationWeeks: toWeek(cell(cols.dur)),
      startWeek: toWeek(cell(cols.start)),
      finishWeek: toWeek(cell(cols.finish)),
      notes: cell(cols.notes) || null,
    });
  }
  return acts;
}

// Returns an array of activities, [] if none found, or null if the file type can't be read.
// `blob` is a File or Blob; `fileName` gives the extension.
async function parseContractFile(blob, fileName) {
  const name = (fileName || blob.name || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    for (const sheet of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" });
      const acts = rowsToActivities(rows);
      if (acts.length) return acts;
    }
    return [];
  }
  if (name.endsWith(".docx")) {
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const table of doc.querySelectorAll("table")) {
      const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((td) => td.textContent || "")
      );
      const acts = rowsToActivities(rows);
      if (acts.length) return acts;
    }
    return [];
  }
  return null; // PDF / MS Project / .doc — can't read reliably
}

const cellCls = "w-full min-w-[56px] rounded border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-transparent";
const STATUS_OPTS = [
  { v: "NOT_STARTED", l: "Not started" },
  { v: "IN_PROGRESS", l: "In progress" },
  { v: "DONE", l: "Done" },
  { v: "DELAYED", l: "Delayed" },
];

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function fileIcon(mime) {
  if (mime === "application/pdf") return "📕";
  if (mime?.includes("word")) return "📘";
  if (mime?.includes("spreadsheet") || mime?.includes("excel")) return "📗";
  if (mime?.includes("project")) return "📙";
  return "📄";
}
function fmtDate(d) {
  try { return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function ProgrammeOfWorks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "QS" || user?.role === "TECHNICAL_MANAGER";

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [programmeType, setProgrammeType] = useState("contract"); // contract | working
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [viewing, setViewing] = useState(null);
  const [activities, setActivities] = useState([]);
  const [savingAct, setSavingAct] = useState(false);

  const typeKey = programmeType === "working" ? "WORKING" : "CONTRACT";

  useEffect(() => {
    if (!projectId) { setActivities([]); return; }
    api.get(`/projects/${projectId}/programme-activities?type=${typeKey}`).then(setActivities).catch(() => setActivities([]));
  }, [projectId, typeKey]);

  const nOrNull = (v) => (v === "" || v == null ? null : Number(v));
  function updAct(i, field, val) { setActivities((a) => a.map((r, idx) => (idx === i ? { ...r, [field]: val } : r))); }

  // Auto-build the Working programme in the background from the uploaded
  // Contract file — runs once per project when the Working programme is empty.
  const autoTried = useRef({});
  async function autoBuildWorking() {
    try {
      const files = await api.get(`/projects/${projectId}/programmes?type=contract`);
      if (!files || files.length === 0) return;               // no contract yet
      const latest = files[0];
      const blob = await api.blob(`/attachments/${latest.id}/file`);
      const acts = await parseContractFile(blob, latest.fileName).catch(() => null);
      if (!acts || acts.length === 0) return;                 // can't read / empty — stay quiet
      await api.put(`/projects/${projectId}/programme-activities`, { type: "CONTRACT", activities: acts });
      await api.post(`/projects/${projectId}/programme-activities/generate-working`, {});
      const updated = await api.get(`/projects/${projectId}/programme-activities?type=WORKING`).catch(() => []);
      setActivities(updated);
      setMsg(`Working programme built automatically from "${latest.fileName}".`);
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!projectId || !canEdit || programmeType !== "working") return;
    if (activities.length > 0) return;
    if (autoTried.current[projectId]) return;
    autoTried.current[projectId] = true;
    autoBuildWorking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, programmeType, activities, canEdit]);

  async function saveActivities() {
    setSavingAct(true); setMsg("");
    try {
      const payload = activities.filter((a) => (a.name || "").trim()).map((a) => ({
        name: a.name, durationWeeks: nOrNull(a.durationWeeks), startWeek: nOrNull(a.startWeek), finishWeek: nOrNull(a.finishWeek),
        notes: a.notes || null, actualStartWeek: nOrNull(a.actualStartWeek), actualFinishWeek: nOrNull(a.actualFinishWeek),
        percentComplete: nOrNull(a.percentComplete), status: a.status || null,
      }));
      await api.put(`/projects/${projectId}/programme-activities`, { type: typeKey, activities: payload });
      setMsg("Programme saved ✓");
    } catch (e) { setMsg(e.message || "Save failed"); } finally { setSavingAct(false); }
  }


  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!projectId) { setItems([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/programmes?type=${programmeType}`)
      .then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [projectId, programmeType]);

  useEffect(() => { load(); }, [load]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", programmeType);
      await api.upload(`/projects/${projectId}/programmes`, fd);

      if (programmeType === "contract") {
        // Read the contract file and auto-build the Working programme.
        const acts = await parseContractFile(file, file.name).catch(() => null);
        if (acts === null) {
          setMsg("Contract uploaded ✓ — couldn't auto-read this file type (use Word or Excel for auto-generation).");
        } else if (acts.length === 0) {
          setMsg("Contract uploaded ✓ — no activity table found in the file to generate from.");
        } else {
          await api.put(`/projects/${projectId}/programme-activities`, { type: "CONTRACT", activities: acts });
          const r = await api.post(`/projects/${projectId}/programme-activities/generate-working`, {});
          setMsg(`Contract uploaded ✓ — ${acts.length} activities read; Working programme generated automatically (${r.count}).`);
        }
      } else {
        setMsg("Working programme uploaded ✓");
      }
      load();
    } catch (err) {
      setMsg(err.message || "Upload failed");
    } finally { setUploading(false); }
  }

  async function openFile(c, download = false) {
    try {
      const blob = await api.blob(`/attachments/${c.id}/file`);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement("a");
        a.href = url; a.download = c.fileName;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setMsg("Could not open the file.");
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.fileName}"?`)) return;
    try {
      await api.delete(`/projects/${projectId}/programmes/${c.id}`);
      load();
    } catch (err) { setMsg(err.message || "Delete failed"); }
  }

  return (
    <div className="p-4 max-w-[820px] mx-auto">
      {viewing && <DocViewer attachment={viewing} onClose={() => setViewing(null)} />}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Programme of Works</h1>
          <p className="text-xs text-slate-500">Upload the project programme (Word, PDF, Excel or MS Project), view it, or upload an updated version.</p>
        </div>
        {!projectId && (
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to manage its programme.</p>}

      {projectId && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {/* Contract vs Working programme */}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden w-fit mb-4 text-sm">
            <button onClick={() => setProgrammeType("contract")} className={`px-4 py-1.5 ${programmeType === "contract" ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Contract Programme of Works</button>
            <button onClick={() => setProgrammeType("working")} className={`px-4 py-1.5 ${programmeType === "working" ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Working Programme of Works</button>
          </div>

          {/* Contract programme — read-only list of what was auto-read from the file */}
          {programmeType === "contract" && activities.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Contract programme — {activities.length} activities (read from the uploaded file)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[520px]">
                  <thead>
                    <tr className="bg-slate-100 text-xs text-slate-600 text-left">
                      <th className="border border-slate-200 px-2 py-1.5 w-8">#</th>
                      <th className="border border-slate-200 px-2 py-1.5">Activity</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-16">Dur</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-16">Start</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-16">Finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a, i) => (
                      <tr key={i}>
                        <td className="border border-slate-200 px-1 py-1 text-center text-xs text-slate-500">{i + 1}</td>
                        <td className="border border-slate-200 px-2 py-1">{a.name}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center">{a.durationWeeks ?? "—"}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center">{a.startWeek ?? "—"}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center">{a.finishWeek ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Working programme — generated from the Contract file; team updates actuals */}
          {programmeType === "working" && activities.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Working programme — progress</h3>
                {canEdit && <button onClick={saveActivities} disabled={savingAct} className="text-xs bg-brand-900 text-white rounded px-3 py-1 disabled:opacity-50">{savingAct ? "Saving…" : "Save"}</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-100 text-xs text-slate-600 text-left">
                      <th className="border border-slate-200 px-2 py-1.5 w-8">#</th>
                      <th className="border border-slate-200 px-2 py-1.5">Activity</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-14">Plan St</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-14">Plan Fin</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-14">Act St</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-14">Act Fin</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-12">%</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a, i) => (
                      <tr key={i}>
                        <td className="border border-slate-200 px-1 py-1 text-center text-xs text-slate-500">{i + 1}</td>
                        <td className="border border-slate-200 px-2 py-1 text-slate-800">{a.name}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center text-slate-600">{a.startWeek ?? "—"}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center text-slate-600">{a.finishWeek ?? "—"}</td>
                        <td className="border border-slate-200 px-1 py-1"><input disabled={!canEdit} type="number" value={a.actualStartWeek ?? ""} onChange={(e) => updAct(i, "actualStartWeek", e.target.value)} className={`${cellCls} text-center`} /></td>
                        <td className="border border-slate-200 px-1 py-1"><input disabled={!canEdit} type="number" value={a.actualFinishWeek ?? ""} onChange={(e) => updAct(i, "actualFinishWeek", e.target.value)} className={`${cellCls} text-center`} /></td>
                        <td className="border border-slate-200 px-1 py-1"><input disabled={!canEdit} type="number" value={a.percentComplete ?? ""} onChange={(e) => updAct(i, "percentComplete", e.target.value)} className={`${cellCls} text-center`} /></td>
                        <td className="border border-slate-200 px-1 py-1">
                          <select disabled={!canEdit} value={a.status || "NOT_STARTED"} onChange={(e) => updAct(i, "status", e.target.value)} className="w-full text-xs border-0 bg-transparent focus:outline-none">
                            {STATUS_OPTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Auto-generated from the Contract programme. Update Actual start/finish, % and Status as work progresses, then Save.</p>
            </div>
          )}

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Uploaded files</p>

          {canEdit && (
            <label className={`inline-flex items-center gap-2 text-sm bg-brand-900 text-white rounded-lg px-4 py-2 cursor-pointer hover:opacity-90 mb-4 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              📤 {uploading ? "Uploading…" : `Upload ${programmeType === "working" ? "working" : "contract"} programme`}
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.mpp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-project" onChange={onFile} className="hidden" />
            </label>
          )}

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && items.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              {canEdit ? "No programme uploaded yet. Upload a Word, PDF, Excel or MS Project file above." : "No programme uploaded for this project yet."}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {items.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-3 rounded-lg border p-3 ${i === 0 ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}>
                <span className="text-2xl shrink-0">{fileIcon(c.mimeType)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 truncate">{c.fileName}</span>
                    {i === 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">{fmtSize(c.fileSize)} · {fmtDate(c.createdAt)}{c.uploadedBy?.name ? ` · ${c.uploadedBy.name}` : ""}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setViewing(c)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">View</button>
                  <button onClick={() => openFile(c, true)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">⬇️</button>
                  {canEdit && <button onClick={() => remove(c)} className="text-xs text-red-400 hover:text-red-600 px-1.5">✕</button>}
                </div>
              </div>
            ))}
          </div>

          {canEdit && items.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-3">
              To update: tap <b>⬇️</b> to download it, edit it, then <b>Upload programme</b> — the newest shows as <b>Current</b>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
