import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import CommentThread from "../components/CommentThread";

function qty(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

const STATUS_COLORS = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  FULFILLED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const URGENCY_COLORS = {
  HIGH: "text-red-600 font-semibold",
  MEDIUM: "text-amber-600",
  LOW: "text-slate-500",
};

export default function StoresAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [error, setError] = useState("");
  const isTM = user?.role === "TECHNICAL_MANAGER";

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Bulk actions
  const [selected, setSelected] = useState(new Set());
  const [commentsOpen, setCommentsOpen] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  useEffect(() => {
    api.get("/projects").then((list) => {
      setProjects(list);
      if (list.length > 0) setProjectId(list[0].id);
    });
  }, []);

  const loadRequisitions = useCallback(() => {
    if (!projectId) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (urgencyFilter) params.set("urgency", urgencyFilter);
    if (search) params.set("search", search);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    api.get(`/projects/${projectId}/requisitions?${params}`).then(setRequisitions).catch(() => setRequisitions([]));
  }, [projectId, statusFilter, urgencyFilter, search, fromDate, toDate]);

  useEffect(() => {
    if (!projectId) return;
    setError("");
    setSelected(new Set());
    api.get(`/projects/${projectId}/stores-analytics`).then(setData).catch((err) => setError(err.message || "Failed to load"));
    loadRequisitions();
  }, [projectId]);

  useEffect(() => {
    setSelected(new Set());
    loadRequisitions();
  }, [statusFilter, urgencyFilter, fromDate, toDate]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(loadRequisitions, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleApproveReq(id, approved, reason) {
    try {
      await api.patch(`/requisitions/${id}/approve`, { approved, rejectionReason: reason });
      loadRequisitions();
    } catch (err) {
      setError(err.message || "Failed to update requisition");
    }
  }

  async function handleBulkAction(action) {
    if (selected.size === 0) return;
    if (action === "REJECTED" && !rejectReason.trim()) {
      setShowRejectInput(true);
      return;
    }
    setBulkLoading(true);
    try {
      const res = await api.post("/requisitions/bulk-action", {
        ids: [...selected],
        action,
        rejectionReason: action === "REJECTED" ? rejectReason || undefined : undefined,
      });
      setSelected(new Set());
      setRejectReason("");
      setShowRejectInput(false);
      loadRequisitions();
      alert(`${res.updated} requisition(s) ${action === "APPROVED" ? "approved" : "rejected"}.`);
    } catch (err) {
      setError(err.message || "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pending = requisitions.filter((r) => r.status === "PENDING");
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((r) => r.id)));
  }

  const pendingReqs = requisitions.filter((r) => r.status === "PENDING");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Stores — Material Tracking</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors">Back</button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Project selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-3 text-base">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

        {/* Search & Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Search & Filters</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="FULFILLED">Fulfilled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="">All urgency</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" title="From date" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" title="To date" />
          </div>
          {(statusFilter || urgencyFilter || search || fromDate || toDate) && (
            <button onClick={() => { setStatusFilter(""); setUrgencyFilter(""); setSearch(""); setFromDate(""); setToDate(""); }} className="text-xs text-blue-600 hover:underline">Clear all filters</button>
          )}
        </div>

        {/* Bulk action bar for TM */}
        {isTM && selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-blue-900">{selected.size} selected</span>
            <button onClick={() => handleBulkAction("APPROVED")} disabled={bulkLoading} className="text-xs font-semibold text-white bg-green-600 rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-50">Bulk Approve</button>
            <button onClick={() => { setShowRejectInput((v) => !v); }} className="text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700">Bulk Reject</button>
            <button onClick={() => { setSelected(new Set()); setShowRejectInput(false); setRejectReason(""); }} className="text-xs text-slate-500 hover:underline ml-auto">Clear selection</button>
            {showRejectInput && (
              <div className="w-full flex gap-2 mt-1">
                <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (optional)" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <button onClick={() => handleBulkAction("REJECTED")} disabled={bulkLoading} className="text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50">Confirm Reject</button>
              </div>
            )}
          </div>
        )}

        {/* Requisitions list */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-sm">Requisitions</span>
            <span className="ml-auto text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{requisitions.length}</span>
            {isTM && pendingReqs.length > 0 && (
              <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:underline ml-2">
                {selected.size === pendingReqs.length ? "Deselect all" : "Select all pending"}
              </button>
            )}
          </div>
          {requisitions.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No requisitions match these filters.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requisitions.map((r) => (
                <li key={r.id} className={`px-4 py-3 flex items-start gap-3 ${selected.has(r.id) ? "bg-blue-50" : ""}`}>
                  {isTM && r.status === "PENDING" && (
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="mt-1 accent-blue-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      {r.refNumber && <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">{r.refNumber}</span>}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                      <span className={`text-xs ${URGENCY_COLORS[r.urgency] || ""}`}>{r.urgency}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{r.itemName} <span className="text-slate-500 font-normal">× {r.quantityRequested}{r.unit ? ` ${r.unit}` : ""}</span></p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      By {r.requestedBy?.name} · {new Date(r.requestedAt).toLocaleDateString()}
                      {r.approvedBy && ` · ${r.status === "APPROVED" ? "Approved" : "Rejected"} by ${r.approvedBy.name}`}
                    </p>
                    {r.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{r.notes}"</p>}
                    {r.rejectionReason && <p className="text-xs text-red-600 mt-1 bg-red-50 border border-red-100 rounded px-2 py-1">Reason: {r.rejectionReason}</p>}
                    <button
                      type="button"
                      onClick={() => setCommentsOpen((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                      className="text-xs text-blue-600 hover:underline mt-1"
                    >
                      {commentsOpen[r.id] ? "Hide comments" : "Comments"}
                    </button>
                    {commentsOpen[r.id] && <CommentThread entityType="MaterialRequisition" entityId={r.id} />}
                  </div>
                  {isTM && r.status === "PENDING" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleApproveReq(r.id, true)} className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 hover:bg-green-100">Approve</button>
                      <button onClick={() => { const reason = window.prompt("Reason (optional):"); if (reason !== null) handleApproveReq(r.id, false, reason || undefined); }} className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 hover:bg-red-100">Reject</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stock analytics */}
        {data && (
          <>
            {data.shortages.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-red-900">Shortages / urgent requirements</h2>
                {data.shortages.map((s, i) => <p key={i} className="text-sm text-red-800">{new Date(s.date).toLocaleDateString()} — {s.note}</p>)}
              </div>
            )}
            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Movement over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="received" name="Received" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="issued" name="Issued" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {data.items.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
                <h2 className="font-medium text-slate-900 mb-3">Stock balance by item</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1 pr-2">Item</th>
                      <th className="py-1 pr-2">Received</th>
                      <th className="py-1 pr-2">Issued</th>
                      <th className="py-1 pr-2">Returned</th>
                      <th className="py-1 pr-2">Damaged/lost</th>
                      <th className="py-1 pr-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((i) => (
                      <tr key={i.itemName} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-2">{i.itemName}</td>
                        <td className="py-1 pr-2">{qty(i.received)}</td>
                        <td className="py-1 pr-2">{qty(i.issued)}</td>
                        <td className="py-1 pr-2">{qty(i.returned)}</td>
                        <td className="py-1 pr-2">{qty(i.damagedLost)}</td>
                        <td className={`py-1 pr-2 font-medium ${i.balance < 0 ? "text-red-600" : "text-slate-900"}`}>{qty(i.balance)} {i.unit || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
