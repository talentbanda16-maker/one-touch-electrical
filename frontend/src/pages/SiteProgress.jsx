import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SiteProgress() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlProjectId = searchParams.get("projectId");
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(urlProjectId ?? null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [loggingRowId, setLoggingRowId] = useState(null);
  const [logForm, setLogForm] = useState({ date: new Date().toISOString().slice(0, 10), percentage: "", targetPct: "", note: "" });
  const [newLabel, setNewLabel] = useState("");
  const [addingRow, setAddingRow] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const newLabelRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.get("/progress").then(({ rows: r, projects: p }) => {
      setRows(r);
      setProjects(p);
      if (p.length > 0) setSelectedProjectId((prev) => prev ?? p[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const loadLogs = (pid) => {
    if (!pid) return;
    api.get(`/progress/log?projectId=${pid}`).then(setLogs).catch(() => setLogs([]));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadLogs(selectedProjectId); }, [selectedProjectId]);

  const submitLog = async (rowId) => {
    if (!logForm.percentage && !logForm.targetPct) return;
    await api.post("/progress/log", {
      rowId,
      projectId: selectedProjectId,
      date: logForm.date,
      percentage: logForm.percentage !== "" ? parseInt(logForm.percentage) : null,
      targetPct: logForm.targetPct !== "" ? parseInt(logForm.targetPct) : null,
      note: logForm.note,
    }).catch(() => {});
    setLoggingRowId(null);
    setLogForm({ date: new Date().toISOString().slice(0, 10), percentage: "", targetPct: "", note: "" });
    loadLogs(selectedProjectId);
  };

  const handleAddRow = async () => {
    if (!newLabel.trim()) return;
    try {
      const row = await api.post("/progress/rows", { label: newLabel.trim() });
      setRows((prev) => [...prev, { ...row, cells: [] }]);
      setNewLabel("");
      setAddingRow(false);
    } catch { /* ignore */ }
  };

  const handleRenameRow = async (id) => {
    if (!editLabel.trim()) return;
    try {
      await api.patch(`/progress/rows/${id}`, { label: editLabel.trim() });
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, label: editLabel.trim() } : r));
      setEditingRowId(null);
    } catch { /* ignore */ }
  };

  const handleDeleteRow = async (id) => {
    if (!window.confirm("Remove this row?")) return;
    await api.delete(`/progress/rows/${id}`).catch(() => {});
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-brand-900 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate("/dashboard/qs")}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900">Site Progress Matrix</h1>
          </div>
          <button
            onClick={() => { setAddingRow(true); setTimeout(() => newLabelRef.current?.focus(), 50); }}
            className="shrink-0 bg-brand-600 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            + Add Row
          </button>
        </div>
        {!urlProjectId && projects.length > 1 && (
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code || p.name})</option>
            ))}
          </select>
        )}
      </div>

      <div className="px-2 pt-4">
        {loading && <p className="text-sm text-slate-400 text-center py-12">Loading…</p>}

        {!loading && projects.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12">No active projects found.</p>
        )}

        {!loading && projects.length > 0 && selectedProjectId && (() => {
          const allDates = [...new Set(logs.map((l) => l.date.slice(0, 10)))].sort();
          const totalCols = 2 + allDates.length + 1;
          return (
          <div className="rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="border-collapse bg-white" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th className="bg-brand-900 text-white text-left px-4 py-3 text-xs font-bold border-r border-slate-600 whitespace-nowrap">
                    ACTIVITY
                  </th>
                  <th className="bg-brand-900 text-white text-center px-4 py-3 text-xs font-bold border-l border-slate-600 w-28 whitespace-nowrap">
                    PROGRESS
                  </th>
                  {allDates.map((d) => (
                    <th key={d} className="bg-brand-900 text-white text-center px-4 py-3 text-xs font-bold border-l border-slate-600 whitespace-nowrap">
                      {fmtDate(d)}
                    </th>
                  ))}
                  <th className="bg-brand-900 border-l border-slate-600 w-8"></th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 && !addingRow && (
                  <tr>
                    <td colSpan={totalCols} className="text-center text-slate-400 py-12 text-sm bg-white">
                      No activities yet — click &quot;+ Add Row&quot; to start
                    </td>
                  </tr>
                )}

                {rows.map((row, idx) => {
                  const bg = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
                  const rowLogs = logs.filter((l) => l.rowId === row.id);
                  // Merge multiple entries per date — keep the latest non-null value for each field
                  const logByDate = {};
                  [...rowLogs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach((l) => {
                    const d = l.date.slice(0, 10);
                    if (!logByDate[d]) { logByDate[d] = { ...l }; }
                    else {
                      if (l.targetPct != null) logByDate[d].targetPct = l.targetPct;
                      if (l.percentage != null) logByDate[d].percentage = l.percentage;
                      if (l.note) logByDate[d].note = l.note;
                    }
                  });
                  const sortedLogs = [...rowLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
                  const latest = sortedLogs[0];
                  const pct = latest?.percentage ?? null;
                  const pctColor = pct == null ? "text-slate-400" : pct >= 100 ? "text-green-700" : pct >= 50 ? "text-blue-700" : "text-slate-800";
                  const isLogging = loggingRowId === row.id;
                  return (
                    <>
                      <tr key={row.id} className={bg}>
                        <td className={`px-4 py-2 border-r border-slate-200 border-b border-b-slate-100 ${bg}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                            {editingRowId === row.id ? (
                              <div className="flex gap-1 flex-1">
                                <input
                                  autoFocus
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameRow(row.id); if (e.key === "Escape") setEditingRowId(null); }}
                                  className="flex-1 rounded border border-green-400 px-2 py-0.5 text-xs"
                                />
                                <button onClick={() => handleRenameRow(row.id)} className="text-green-700 font-bold text-xs">✓</button>
                                <button onClick={() => setEditingRowId(null)} className="text-slate-400 text-xs">✕</button>
                              </div>
                            ) : (
                              <span
                                className="text-xs font-semibold text-slate-800 cursor-pointer hover:text-green-700 leading-tight whitespace-nowrap"
                                onDoubleClick={() => { setEditingRowId(row.id); setEditLabel(row.label); }}
                                title="Double-click to rename"
                              >
                                {row.label}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Targeted / Actual labels + update */}
                        <td className={`border-l border-b border-b-slate-100 px-3 py-2 w-28 ${bg}`}>
                          <div className="text-xs font-bold text-blue-600 leading-snug">Targeted</div>
                          <div className="text-xs font-bold text-slate-700 leading-snug">Actual</div>
                          <button
                            onClick={() => { setLoggingRowId(isLogging ? null : row.id); setLogForm({ date: new Date().toISOString().slice(0, 10), percentage: "", targetPct: "", note: "" }); }}
                            className="block mt-1 text-xs text-green-700 font-semibold hover:underline"
                          >
                            + Update
                          </button>
                        </td>

                        {/* One cell per date — targeted on top (blue), actual below */}
                        {allDates.map((d) => {
                          const entry = logByDate[d];
                          const actual = entry?.percentage ?? null;
                          const tgt = entry?.targetPct ?? null;
                          const c = actual == null ? "text-slate-300" : actual >= 100 ? "text-green-700" : actual >= 50 ? "text-blue-700" : "text-slate-800";
                          return (
                            <td key={d} className={`border-l border-b border-b-slate-100 text-center px-3 py-2 ${actual >= 100 ? "bg-green-50" : bg}`}>
                              <div className="text-xs font-bold text-blue-600 leading-snug">{tgt != null ? `${tgt}%` : "—"}</div>
                              <div className={`text-xs font-black leading-snug ${c}`}>{actual != null ? `${actual}%` : "—"}</div>
                              {entry?.note && <p className="text-xs text-slate-400 italic mt-0.5 whitespace-nowrap">{entry.note}</p>}
                            </td>
                          );
                        })}

                        <td className={`border-l border-slate-200 border-b border-b-slate-100 px-2 text-center ${bg}`}>
                          <button
                            onClick={() => handleDeleteRow(row.id)}
                            className="text-red-300 hover:text-red-600 text-xs font-bold transition-colors"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>

                      {/* Inline log form */}
                      {isLogging && (
                        <tr className="bg-green-50 border-b border-green-100">
                          <td colSpan={totalCols} className="px-4 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Date</p>
                                <input type="date" value={logForm.date}
                                  onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
                                  className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <p className="text-xs text-blue-600 font-semibold mb-1">Targeted %</p>
                                <input type="number" min="0" max="100" placeholder="e.g. 80"
                                  value={logForm.targetPct}
                                  onChange={(e) => setLogForm((f) => ({ ...f, targetPct: e.target.value }))}
                                  className="w-24 rounded border border-slate-300 px-2 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 font-semibold mb-1">Actual %</p>
                                <input type="number" min="0" max="100" placeholder="e.g. 60"
                                  value={logForm.percentage}
                                  onChange={(e) => setLogForm((f) => ({ ...f, percentage: e.target.value }))}
                                  className="w-24 rounded border border-slate-300 px-2 py-1.5 text-xs"
                                />
                              </div>
                              <div className="flex-1 min-w-[140px]">
                                <p className="text-xs text-slate-500 mb-1">Note (optional)</p>
                                <input placeholder="e.g. Completed floor wiring"
                                  value={logForm.note}
                                  onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
                                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                                />
                              </div>
                              <button onClick={() => submitLog(row.id)}
                                className="bg-brand-600 hover:bg-green-800 text-white text-xs font-bold px-4 py-1.5 rounded">
                                Save
                              </button>
                              <button onClick={() => setLoggingRowId(null)} className="text-slate-400 text-xs">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {addingRow ? (
                  <tr className="bg-green-50">
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 w-5">{rows.length + 1}</span>
                        <div className="flex gap-1 flex-1">
                          <input
                            ref={newLabelRef}
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddRow(); if (e.key === "Escape") setAddingRow(false); }}
                            placeholder="Enter activity name…"
                            className="flex-1 rounded border border-green-400 px-2 py-1 text-xs"
                          />
                          <button onClick={handleAddRow} className="text-green-700 font-bold text-sm px-1">✓</button>
                          <button onClick={() => { setAddingRow(false); setNewLabel(""); }} className="text-slate-400 text-sm px-1">✕</button>
                        </div>
                      </div>
                    </td>
                    <td className="border-l border-slate-100" />
                    {allDates.map((d) => <td key={d} className="border-l border-slate-100" />)}
                    <td className="border-l border-slate-100" />
                  </tr>
                ) : (
                  <tr>
                    <td
                      colSpan={totalCols}
                      className="px-4 py-3 border-t border-slate-100 cursor-pointer hover:bg-green-50 transition-colors"
                      onClick={() => { setAddingRow(true); setTimeout(() => newLabelRef.current?.focus(), 50); }}
                    >
                      <span className="text-xs font-semibold text-green-700">+ Add Activity</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          );
        })()}

        {!loading && (
          <p className="text-xs text-slate-400 text-center mt-3">
            Double-click an activity name to rename · Click + Update to log progress
          </p>
        )}
      </div>
    </div>
  );
}
