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

export default function InterimPaymentClaim() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "QS" || user?.role === "TECHNICAL_MANAGER";

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const projectName = projects.find((p) => p.id === projectId)?.name || "Project";

  const load = useCallback(() => {
    if (!projectId) { setClaims([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/interim-claims`)
      .then(setClaims).catch(() => {}).finally(() => setLoading(false));
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
      await api.upload(`/projects/${projectId}/interim-claims`, fd);
      setMsg("Claim uploaded ✓");
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

  function shareText(c) {
    return `Interim Payment Claim — ${projectName}\n${c.fileName}\n\n(Please find the claim attached.)`;
  }
  function shareWhatsApp(c) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText(c))}`, "_blank");
  }
  function shareEmail(c) {
    window.location.href = `mailto:?subject=${encodeURIComponent(`Interim Payment Claim — ${projectName}`)}&body=${encodeURIComponent(shareText(c))}`;
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.fileName}"?`)) return;
    try {
      await api.delete(`/projects/${projectId}/interim-claims/${c.id}`);
      load();
    } catch (err) { setMsg(err.message || "Delete failed"); }
  }

  return (
    <div className="p-4 max-w-[820px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Interim Payment Claim</h1>
          <p className="text-xs text-slate-500">Upload a claim (Word or PDF), download it, and send it on WhatsApp or email.</p>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to manage its claims.</p>}

      {projectId && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {canEdit && (
            <label className={`inline-flex items-center gap-2 text-sm bg-brand-900 text-white rounded-lg px-4 py-2 cursor-pointer hover:opacity-90 mb-4 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              📤 {uploading ? "Uploading…" : "Upload claim"}
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="hidden" />
            </label>
          )}

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && claims.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              {canEdit ? "No claim uploaded yet. Upload a Word or PDF above." : "No claim uploaded for this project yet."}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {claims.map((c, i) => (
              <div key={c.id} className={`rounded-lg border p-3 ${i === 0 ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{fileIcon(c.mimeType)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 truncate">{c.fileName}</span>
                      {i === 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Latest</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">{fmtSize(c.fileSize)} · {fmtDate(c.createdAt)}{c.uploadedBy?.name ? ` · ${c.uploadedBy.name}` : ""}</p>
                  </div>
                  {canEdit && <button onClick={() => remove(c)} className="text-xs text-red-400 hover:text-red-600 px-1.5 shrink-0">✕</button>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <button onClick={() => openFile(c, false)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">👁 View</button>
                  <button onClick={() => openFile(c, true)} className="text-xs border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50">⬇️ Download</button>
                  <button onClick={() => shareWhatsApp(c)} className="text-xs text-white rounded px-2.5 py-1.5" style={{ background: "#25d366" }}>💬 WhatsApp</button>
                  <button onClick={() => shareEmail(c)} className="text-xs bg-slate-700 text-white rounded px-2.5 py-1.5">✉️ Email</button>
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <p className="text-[11px] text-slate-400 mt-3">
              To edit a claim: <b>⬇️ Download</b> it, edit it in Word, then <b>Upload claim</b> again (newest shows as <b>Latest</b>).
              To send: <b>Download</b> first, then tap <b>WhatsApp</b> or <b>Email</b> — it opens a ready message and you attach the downloaded file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
