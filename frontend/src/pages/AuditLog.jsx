import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function AuditLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ actions: [], entityTypes: [] });
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Audit Log</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <select
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All actions</option>
            {filters.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(e) => {
              setPage(1);
              setEntityType(e.target.value);
            }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All entity types</option>
            {filters.entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {data && data.logs.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">No audit entries match these filters.</div>
          )}
          {data?.logs.map((log) => (
            <div key={log.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{log.action}</span>
                <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-slate-500 mt-0.5">
                {log.user ? `${log.user.name} (${log.user.role})` : "System"} · {log.entityType}
                {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
              </div>
              {log.metadata && (
                <pre className="mt-1 text-xs text-slate-400 whitespace-pre-wrap break-all">
                  {JSON.stringify(log.metadata)}
                </pre>
              )}
            </div>
          ))}
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border border-slate-300 rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {data.page} of {data.totalPages} · {data.total} entries
            </span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="border border-slate-300 rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
