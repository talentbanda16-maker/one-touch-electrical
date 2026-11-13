import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const VIEWS = [
  { key: "list", label: "List", icon: "📋" },
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "charts", label: "Charts", icon: "📊" },
];

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [view, setView] = useState("list");
  const [project, setProject] = useState(null);

  useEffect(() => {
    api.get(`/projects/${projectId}`).then(setProject).catch(() => {});
  }, [projectId]);

  return (
    <div className="p-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate("/board")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-800 truncate">
            {project ? project.name : "Project"}
          </h1>
          {project?.code && <p className="text-xs text-slate-500 font-mono">{project.code}</p>}
        </div>

        {/* View switcher — top corner */}
        <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white shrink-0">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                view === v.key ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{v.icon}</span>{v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "list" && <BoqList projectId={projectId} canEdit={user?.role === "QS"} />}
      {view === "calendar" && (
        <CalendarView
          projectId={projectId}
          canBook={user?.role === "TECHNICAL_MANAGER" || user?.role === "ENGINEER"}
        />
      )}
      {view === "charts" && <ChartsView projectId={projectId} />}
    </div>
  );
}

/* ---------------- List view: BOQ ---------------- */
function BoqList({ projectId, canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get(`/projects/${projectId}/boq`)
      .then((data) => setRows(data.map((r) => ({ ...r }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  function update(i, field, value) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: `new-${Date.now()}`, boqItemNumber: "", description: "", unit: "", contractQuantity: 0, contractRate: 0 }]);
  }
  function removeRow(i) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }
  async function save() {
    setSaving(true); setMsg("");
    try {
      const payload = rows.map((r) => ({
        boqItemNumber: String(r.boqItemNumber || ""),
        description: String(r.description || ""),
        unit: String(r.unit || ""),
        contractQuantity: Number(r.contractQuantity) || 0,
        contractRate: Number(r.contractRate) || 0,
      }));
      await api.put(`/projects/${projectId}/boq`, payload);
      setMsg("Saved ✓");
      const fresh = await api.get(`/projects/${projectId}/boq`);
      setRows(fresh.map((r) => ({ ...r })));
    } catch (e) {
      setMsg(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const total = rows.reduce((s, r) => s + (Number(r.contractQuantity) || 0) * (Number(r.contractRate) || 0), 0);

  if (loading) return <p className="text-sm text-slate-400">Loading BOQ…</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Bill of Quantities</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
            <button onClick={addRow} className="text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">+ Row</button>
            <button onClick={save} disabled={saving} className="text-xs bg-brand-900 text-white rounded px-3 py-1 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2">Unit</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Rate</th>
              <th className="py-1.5 pr-2 text-right">Amount</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={canEdit ? 7 : 6} className="py-4 text-center text-slate-400 text-xs">No BOQ items yet.</td></tr>
            )}
            {rows.map((r, i) => {
              const amount = (Number(r.contractQuantity) || 0) * (Number(r.contractRate) || 0);
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  {canEdit ? (
                    <>
                      <td className="py-1 pr-2"><input className="w-16 border border-slate-200 rounded px-1 py-0.5" value={r.boqItemNumber} onChange={(e) => update(i, "boqItemNumber", e.target.value)} /></td>
                      <td className="py-1 pr-2"><input className="w-full border border-slate-200 rounded px-1 py-0.5" value={r.description} onChange={(e) => update(i, "description", e.target.value)} /></td>
                      <td className="py-1 pr-2"><input className="w-14 border border-slate-200 rounded px-1 py-0.5" value={r.unit} onChange={(e) => update(i, "unit", e.target.value)} /></td>
                      <td className="py-1 pr-2"><input type="number" className="w-20 border border-slate-200 rounded px-1 py-0.5 text-right" value={r.contractQuantity} onChange={(e) => update(i, "contractQuantity", e.target.value)} /></td>
                      <td className="py-1 pr-2"><input type="number" className="w-24 border border-slate-200 rounded px-1 py-0.5 text-right" value={r.contractRate} onChange={(e) => update(i, "contractRate", e.target.value)} /></td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{amount.toLocaleString()}</td>
                      <td className="py-1 text-right"><button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button></td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 font-mono text-xs text-slate-500">{r.boqItemNumber}</td>
                      <td className="py-1.5 pr-2">{r.description}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{r.unit}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{Number(r.contractQuantity).toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{Number(r.contractRate).toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{amount.toLocaleString()}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td colSpan={canEdit ? 5 : 5} className="py-2 text-right text-xs font-semibold text-slate-600">Contract total</td>
              <td className="py-2 text-right font-bold tabular-nums">{total.toLocaleString()}</td>
              {canEdit && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {!canEdit && <p className="text-[11px] text-slate-400 mt-2">View only — the QS edits the BOQ.</p>}
    </div>
  );
}

/* ---------------- Calendar view: site visits ---------------- */
const VISIT_TYPES = {
  SITE_VISIT: { label: "Site Visit", color: "#2563eb", bg: "#dbeafe" },
  TESTING: { label: "Testing", color: "#d97706", bg: "#fef3c7" },
};
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function firstName(n) { return (n || "").split(" ")[0]; }

function CalendarView({ projectId, canBook }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [visits, setVisits] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null); // date key being viewed
  const [booking, setBooking] = useState(false);
  const [form, setForm] = useState({ type: "SITE_VISIT", title: "", assignedToId: "", notes: "" });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get(`/projects/${projectId}/site-visits`).then(setVisits).catch(() => {});
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/users/engineers").then(setEngineers).catch(() => {}); }, []);

  const byDay = {};
  visits.forEach((v) => {
    const k = new Date(v.date).toISOString().slice(0, 10);
    (byDay[k] = byDay[k] || []).push(v);
  });

  const first = new Date(cursor.y, cursor.m, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthName = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function openDay(k) {
    setSelectedDay(k);
    setBooking(false);
    setForm({ type: "SITE_VISIT", title: "", assignedToId: "", notes: "" });
    setError("");
  }

  async function book() {
    if (!form.title.trim()) { setError("Add a title"); return; }
    try {
      await api.post(`/projects/${projectId}/site-visits`, {
        date: selectedDay,
        type: form.type,
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        assignedToId: form.assignedToId || null,
      });
      setBooking(false);
      setForm({ type: "SITE_VISIT", title: "", assignedToId: "", notes: "" });
      load();
    } catch (e) {
      setError(e.message || "Could not book");
    }
  }

  async function removeVisit(id) {
    try { await api.delete(`/projects/${projectId}/site-visits/${id}`); load(); } catch { /* ignore */ }
  }

  const selectedVisits = selectedDay ? (byDay[selectedDay] || []) : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">{monthName}</h2>
        <div className="flex gap-1">
          <button onClick={() => setCursor((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { ...c, m }; })} className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50">←</button>
          <button onClick={() => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); }} className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50">Today</button>
          <button onClick={() => setCursor((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { ...c, m }; })} className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50">→</button>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mb-2">Tap a day to see everyone booked{canBook ? " or to add a visit" : ""}.</p>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => <div key={w} className="text-[10px] font-semibold text-slate-400 py-1">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const k = dateKey(cursor.y, cursor.m, d);
          const dayVisits = byDay[k] || [];
          const isToday = k === todayKey;
          const isSelected = k === selectedDay;
          return (
            <div
              key={k}
              onClick={() => openDay(k)}
              className={`min-h-[64px] rounded-lg border p-1 text-left align-top cursor-pointer hover:border-brand-500 ${
                isSelected ? "border-brand-600 ring-1 ring-brand-500" : isToday ? "border-brand-500 bg-brand-50" : "border-slate-100"
              }`}
            >
              <div className="text-[11px] text-slate-500">{d}</div>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {dayVisits.slice(0, 3).map((v) => {
                  const t = VISIT_TYPES[v.type] || VISIT_TYPES.SITE_VISIT;
                  return (
                    <div
                      key={v.id}
                      title={`${t.label}: ${v.title}${v.assignedTo ? " · " + v.assignedTo.name : ""}`}
                      className="text-[9px] leading-tight rounded px-1 py-0.5 truncate"
                      style={{ background: t.bg, color: t.color }}
                    >
                      {v.assignedTo ? `👤 ${firstName(v.assignedTo.name)}` : v.title}
                    </div>
                  );
                })}
                {dayVisits.length > 3 && (
                  <div className="text-[9px] text-slate-500 font-medium">+{dayVisits.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 text-[11px]">
        {Object.entries(VISIT_TYPES).map(([k, t]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded" style={{ background: t.color }} /> {t.label}
          </span>
        ))}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">
              {new Date(selectedDay).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <button onClick={() => { setSelectedDay(null); setBooking(false); }} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>

          {/* Full list of everyone booked that day */}
          {selectedVisits.length === 0 ? (
            <p className="text-xs text-slate-400 mb-2">Nothing booked yet.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-3">
              {selectedVisits.map((v) => {
                const t = VISIT_TYPES[v.type] || VISIT_TYPES.SITE_VISIT;
                return (
                  <div key={v.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.color }}>{t.label}</span>
                        <p className="text-sm font-semibold text-slate-800 mt-1">{v.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          👤 <span className="font-medium">{v.assignedTo ? v.assignedTo.name : "Unassigned"}</span>
                        </p>
                        {v.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{v.notes}"</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">Booked by {v.createdBy?.name || "—"}</p>
                      </div>
                      {canBook && (
                        <button
                          onClick={() => { if (window.confirm(`Remove "${v.title}"?`)) removeVisit(v.id); }}
                          className="text-red-400 hover:text-red-600 text-xs shrink-0"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add-a-visit */}
          {canBook && !booking && (
            <button onClick={() => { setBooking(true); setError(""); }} className="text-sm bg-brand-900 text-white rounded-lg px-4 py-1.5">
              + Book a visit
            </button>
          )}

          {canBook && booking && (
            <div className="border border-slate-200 rounded-lg p-3 mt-1">
              <p className="text-xs font-semibold text-slate-600 mb-2">New booking</p>
              {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                  <option value="SITE_VISIT">Site Visit</option>
                  <option value="TESTING">Testing</option>
                </select>
                <select value={form.assignedToId} onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                  <option value="">Assign to (optional)</option>
                  {engineers.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role === "QS" ? "QS" : "Engineer"})</option>)}
                </select>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title (e.g. Earthing inspection)" className="border border-slate-300 rounded px-2 py-1.5 text-sm sm:col-span-2" />
                <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="border border-slate-300 rounded px-2 py-1.5 text-sm sm:col-span-2" />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={book} className="text-sm bg-brand-900 text-white rounded px-4 py-1.5">Book</button>
                <button onClick={() => setBooking(false)} className="text-sm border border-slate-300 rounded px-4 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Charts view: pies ---------------- */
function ChartsView({ projectId }) {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/projects/${projectId}/workspace-metrics`)
      .then(setM).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <p className="text-sm text-slate-400">Loading charts…</p>;
  if (!m) return <p className="text-sm text-slate-400">No data.</p>;

  const actual = Math.max(0, Math.min(100, Math.round(m.completion)));
  const planned = m.plannedProgress != null ? Math.max(0, Math.min(100, Math.round(m.plannedProgress))) : null;
  const spent = Math.round(m.actualCost);
  const budget = Math.round(m.budgetCost);
  const remainingBudget = Math.max(0, budget - spent);
  const overBudget = spent > budget;

  const actualData = [
    { name: "Done", value: actual },
    { name: "Remaining", value: 100 - actual },
  ];
  const plannedData = planned != null ? [
    { name: "Planned", value: planned },
    { name: "Remaining", value: 100 - planned },
  ] : null;
  const budgetData = [
    { name: "Spent / ordered", value: spent },
    { name: "Remaining", value: remainingBudget },
  ];

  const DONE = ["#16a34a", "#e2e8f0"];
  const PLAN = ["#2563eb", "#e2e8f0"];
  const COST = [overBudget ? "#dc2626" : "#d97706", "#e2e8f0"];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ChartCard title="Progress — Actual" center={`${actual}%`}>
        <Donut data={actualData} colors={DONE} />
      </ChartCard>

      {plannedData && (
        <ChartCard title="Progress — Planned" center={`${planned}%`}>
          <Donut data={plannedData} colors={PLAN} />
        </ChartCard>
      )}

      <ChartCard
        title="Budget — Spent vs Remaining"
        center={budget > 0 ? `${Math.round((spent / budget) * 100)}%` : "—"}
        sub={overBudget ? `Over budget by R${(spent - budget).toLocaleString()}` : `R${spent.toLocaleString()} of R${budget.toLocaleString()}`}
      >
        <Donut data={budgetData} colors={COST} money />
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, center, sub, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      <div className="relative" style={{ height: 220 }}>
        {children}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-slate-800">{center}</span>
        </div>
      </div>
      {sub && <p className="text-xs text-slate-500 text-center mt-1">{sub}</p>}
    </div>
  );
}

function Donut({ data, colors, money }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} startAngle={90} endAngle={-270}>
          {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
        </Pie>
        <Tooltip formatter={(v) => (money ? `R${Number(v).toLocaleString()}` : `${v}%`)} />
        <Legend verticalAlign="bottom" height={24} iconSize={9} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
