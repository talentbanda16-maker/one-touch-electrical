import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

// Project pipeline board for the Engineer + Technical Manager. Each column is
// a stage of the project lifecycle; dragging a card (or picking a column on
// mobile) sets the project's real status on the server straight away.
// DELAYED is not a column — a delayed project stays in "Active" with a red dot.
const COLUMNS = [
  { key: "planning",  label: "Planning",  accent: "#64748b", tint: "#f1f5f9" },
  { key: "active",    label: "Active",    accent: "#2563eb", tint: "#eff6ff" },
  { key: "completed", label: "Completed", accent: "#d97706", tint: "#fffbeb" },
  { key: "closed",    label: "Closed",    accent: "#16a34a", tint: "#f0fdf4" },
];

function fmtMoney(v) {
  const n = Number(v) || 0;
  if (n >= 1e6) return `R${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `R${(n / 1e3).toFixed(0)}k`;
  return `R${n.toFixed(0)}`;
}

export default function SiteBoard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canMove = user?.role === "TECHNICAL_MANAGER" || user?.role === "ENGINEER";

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/projects/board")
      .then((data) => { setCards(data); setError(""); })
      .catch((e) => setError(e.message || "Failed to load board"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function move(card, toColumn) {
    if (!canMove || card.column === toColumn) return;
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, column: toColumn } : c)));
    try {
      const updated = await api.patch(`/projects/${card.id}/board`, { column: toColumn });
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, ...updated } : c)));
    } catch (e) {
      setCards(prev);
      setError(e.message || "Could not move project");
    }
  }

  const byColumn = (key) => cards.filter((c) => c.column === key);

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-800">Project Pipeline</h1>
          <p className="text-xs text-slate-500">
            {canMove ? "Drag a project between stages, or use the menu on each card." : "View only."}
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = byColumn(col.key);
          const isDropTarget = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (canMove && dragId) { e.preventDefault(); setDragOverCol(col.key); } }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const card = cards.find((c) => c.id === dragId);
                if (card) move(card, col.key);
                setDragId(null);
                setDragOverCol(null);
              }}
              className={`rounded-xl border p-2 min-h-[140px] transition-colors ${
                isDropTarget ? "border-dashed border-2" : "border-slate-200"
              }`}
              style={{ background: col.tint, borderColor: isDropTarget ? col.accent : undefined }}
            >
              <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-slate-200/70">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.accent }} />
                  <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No projects</p>
                )}
                {items.map((card) => {
                  const overBudget = card.variance > 0;
                  return (
                    <div
                      key={card.id}
                      draggable={canMove}
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                      onClick={() => navigate(`/workspace/${card.id}`)}
                      className={`bg-white rounded-lg border border-slate-200 shadow-sm p-3 cursor-pointer hover:border-brand-400 ${
                        dragId === card.id ? "opacity-50" : ""
                      }`}
                      title="Click to open · drag to move"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono text-slate-400">{card.code}</span>
                          <p className="text-sm font-semibold text-slate-800 leading-snug break-words">{card.name}</p>
                        </div>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                          title={card.isDelayed ? "Delayed / behind schedule" : "On schedule"}
                          style={{ background: card.isDelayed ? "#dc2626" : "#16a34a" }}
                        />
                      </div>

                      {card.client && <p className="text-[11px] text-slate-500 truncate">{card.client}</p>}

                      {/* Completion bar */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                          <span>Progress</span>
                          <span className="font-semibold">{card.completion}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, card.completion))}%`,
                              background: card.isDelayed ? "#dc2626" : "#16a34a",
                            }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1 mt-2 text-[11px]">
                        <span className="text-slate-500">
                          Spend:{" "}
                          <span className={overBudget ? "text-red-600 font-medium" : "text-slate-700"}>
                            {fmtMoney(card.actualCost)}
                          </span>
                          <span className="text-slate-400"> / {fmtMoney(card.budgetCost)}</span>
                        </span>
                        <span className="text-slate-500 text-right">
                          {card.daysRemaining != null ? `${card.daysRemaining}d left` : "No end date"}
                        </span>
                      </div>

                      {card.projectManager?.name && (
                        <p className="text-[11px] text-slate-500 mt-1 truncate">👤 {card.projectManager.name}</p>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/actions?projectId=${card.id}`); }}
                            className="text-blue-600 hover:underline"
                            title="Open actions"
                          >
                            ⚡ {card.openActions}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/analytics/stores?projectId=${card.id}&status=PENDING`); }}
                            className="text-amber-600 hover:underline"
                            title="Pending requisitions"
                          >
                            📦 {card.pendingReqs}
                          </button>
                        </div>
                        {canMove && (
                          <select
                            value={card.column}
                            onChange={(e) => move(card, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600"
                            title="Move to…"
                          >
                            {COLUMNS.map((c) => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p className="text-sm text-slate-400 mt-4">Loading…</p>}
    </div>
  );
}
