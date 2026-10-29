import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const ACTION_LABELS = {
  LOGIN_SUCCESS: "Logged in",
  LOGIN_FAILED: "Login failed",
  LOGOUT: "Logged out",
  PASSWORD_CHANGED: "Changed password",
  USER_CREATED: "User created",
  PROJECT_CREATED: "Project created",
  REPORT_SUBMITTED: "Report submitted",
  REPORT_APPROVED: "Report approved",
  REPORT_RETURNED: "Report returned",
  REQUISITION_CREATED: "Requisition created",
  REQUISITION_APPROVED: "Requisition approved",
  REQUISITION_REJECTED: "Requisition rejected",
  REQUISITION_RESOLVED: "Requisition resolved",
  REQUISITION_ARCHIVED: "Requisition archived",
  ACTION_CREATED: "Action created",
  ACTION_UPDATED: "Action updated",
  ACTION_ARCHIVED: "Action archived",
  INSTRUCTION_CREATED: "Instruction created",
  INSTRUCTION_ARCHIVED: "Instruction archived",
  PROJECT_ARCHIVED: "Project archived",
  BOM_ITEM_ADDED: "BOM item added",
};

const ACTION_COLORS = {
  LOGIN_SUCCESS: "bg-green-100 text-green-700",
  LOGIN_FAILED: "bg-red-100 text-red-700",
  LOGOUT: "bg-slate-100 text-slate-600",
  REPORT_APPROVED: "bg-green-100 text-green-700",
  REPORT_RETURNED: "bg-amber-100 text-amber-700",
  REPORT_SUBMITTED: "bg-blue-100 text-blue-700",
  REQUISITION_APPROVED: "bg-green-100 text-green-700",
  REQUISITION_REJECTED: "bg-red-100 text-red-700",
  REQUISITION_RESOLVED: "bg-green-100 text-green-700",
  PROJECT_ARCHIVED: "bg-red-100 text-red-700",
  ACTION_ARCHIVED: "bg-red-100 text-red-700",
};

function badge(action) {
  const cls = ACTION_COLORS[action] || "bg-slate-100 text-slate-700";
  const label = ACTION_LABELS[action] || action.replace(/_/g, " ");
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

export default function AuditLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ actions: [], entityTypes: [] });
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const openedAtRef = useRef(0);
  const blockOverlayRef = useRef(false);

  useEffect(() => {
    api.get("/audit/filters").then(setFilters).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    api
      .get(`/audit?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load audit log"));
  }, [action, entityType, page]);

  async function openDetail(log) {
    openedAtRef.current = Date.now();
    blockOverlayRef.current = true;
    setTimeout(() => { blockOverlayRef.current = false; }, 800);
    setSelected(log);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const h = await api.get(`/audit/entity/${log.entityId}`);
      setHistory(h);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeDetail() {
    if (blockOverlayRef.current) return;
    setSelected(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-400">Audit Log</p>
          <p className="font-semibold text-white">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <select
            value={action}
            onChange={(e) => { setPage(1); setAction(e.target.value); }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All actions</option>
            {filters.actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(e) => { setPage(1); setEntityType(e.target.value); }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All entity types</option>
            {filters.entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Log list */}
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {data && data.logs.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">No audit entries match these filters.</div>
          )}
          {data?.logs.map((log) => (
            <button
              key={log.id}
              onClick={() => openDetail(log)}
              className="w-full text-left p-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                {badge(log.action)}
                <span className="text-xs text-slate-400 shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-slate-600 text-sm mt-1">
                {log.user ? `${log.user.name} (${log.user.role})` : "System"} · {log.entityType}
                {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
              </div>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(log.metadata).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
                    <span key={k} className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                      {k}: {String(v).slice(0, 40)}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border border-slate-300 rounded-md px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span className="text-slate-500">Page {data.page} of {data.totalPages} · {data.total} entries</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="border border-slate-300 rounded-md px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        )}
      </main>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeDetail}>
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Panel header */}
            <div className="px-4 py-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                {badge(selected.action)}
                <p className="text-xs text-slate-400 mt-1">{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {/* Who did it */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Who</p>
                <p className="text-sm font-medium text-slate-800">{selected.user?.name || "System"}</p>
                {selected.user && <p className="text-xs text-slate-500">{selected.user.email} · {selected.user.role}</p>}
              </div>

              {/* What record */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Record</p>
                <p className="text-sm font-medium text-slate-800">{selected.entityType}</p>
                <p className="text-xs font-mono text-slate-500">{selected.entityId}</p>
              </div>

              {/* Metadata */}
              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Details</p>
                  {Object.entries(selected.metadata).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                      <span className="text-xs font-medium text-slate-800 text-right max-w-[60%] break-words">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Full history of this record */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Full history of this record</p>
                {historyLoading && <p className="text-sm text-slate-400">Loading...</p>}
                {!historyLoading && history.length === 0 && <p className="text-sm text-slate-400">No history found.</p>}
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={h.id} className={`flex gap-3 ${h.id === selected.id ? "opacity-100" : "opacity-70"}`}>
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${h.id === selected.id ? "bg-blue-500" : "bg-slate-300"}`} />
                        {i < history.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-3 min-w-0">
                        {badge(h.action)}
                        <p className="text-xs text-slate-500 mt-0.5">
                          {h.user?.name || "System"} · {new Date(h.createdAt).toLocaleString()}
                        </p>
                        {h.metadata && Object.keys(h.metadata).length > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {Object.entries(h.metadata).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
