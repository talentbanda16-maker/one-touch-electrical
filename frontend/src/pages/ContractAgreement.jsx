import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function fileIcon(mime) {
  if (mime === "application/pdf") return "📕";
  if (mime?.includes("word")) return "📘";
  return "📄";
}
function fmtDate(d) {
  try { return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function ContractAgreement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "QS" || user?.role === "TECHNICAL_MANAGER";

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!projectId) { setContracts([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/contracts`)
      .then(setContracts).catch(() => {}).finally(() => setLoading(false));
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
      await api.upload(`/projects/${projectId}/contracts`, fd);
      setMsg("Contract uploaded ✓");
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
      await api.delete(`/projects/${projectId}/contracts/${c.id}`);
      load();
    } catch (err) { setMsg(err.message || "Delete failed"); }
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
          <h1 className="text-xl font-semibold text-slate-800">Contract Agreement</h1>
          <p className="text-xs text-slate-500">Upload the project contract (Word or PDF), view it, or upload an updated version.</p>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to manage its contract.</p>}

      {projectId && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {canEdit && (
            <label className={`inline-flex items-center gap-2 text-sm bg-brand-900 text-white rounded-lg px-4 py-2 cursor-pointer hover:opacity-90 mb-4 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              📤 {uploading ? "Uploading…" : contracts.length ? "Upload updated contract" : "Upload contract"}
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="hidden" />
            </label>
          )}

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && contracts.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              {canEdit ? "No contract uploaded yet. Upload the Word or PDF above." : "No contract uploaded for this project yet."}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {contracts.map((c, i) => (
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
                  <button onClick={() => openFile(c, false)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">View</button>
                  <button onClick={() => openFile(c, true)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">⬇️</button>
                  {canEdit && <button onClick={() => remove(c)} className="text-xs text-red-400 hover:text-red-600 px-1.5">✕</button>}
                </div>
              </div>
            ))}
          </div>

          {canEdit && contracts.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-3">
              To edit the contract: tap <b>⬇️</b> to download it, edit it in Word, then <b>Upload updated contract</b> — the newest one shows as <b>Current</b>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
