import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const TYPE = {
  SITE_VISIT: { label: "Site Visit", color: "#2563eb", bg: "#dbeafe" },
  TESTING: { label: "Testing", color: "#d97706", bg: "#fef3c7" },
};

function fmt(d) {
  try { return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

export default function MySiteVisits() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/users/me/site-visits").then(setVisits).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = visits.filter((v) => new Date(v.date).toISOString().slice(0, 10) >= todayKey);
  const past = visits.filter((v) => new Date(v.date).toISOString().slice(0, 10) < todayKey);

  function Card({ v }) {
    const t = TYPE[v.type] || TYPE.SITE_VISIT;
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-start gap-3">
        <div className="shrink-0 w-14 text-center">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: t.color }}>
            {new Date(v.date).toLocaleDateString(undefined, { month: "short" })}
          </div>
          <div className="text-2xl font-bold text-slate-800 leading-none">{new Date(v.date).getDate()}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.color }}>{t.label}</span>
            <span className="text-sm font-semibold text-slate-800">{v.title}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{fmt(v.date)}</p>
          <p className="text-xs text-slate-500">📁 {v.project?.name}{v.project?.code ? ` (${v.project.code})` : ""}</p>
          {v.notes && <p className="text-xs text-slate-600 mt-1 italic">"{v.notes}"</p>}
          <p className="text-[11px] text-slate-400 mt-1">Booked by {v.createdBy?.name || "—"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-[760px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-xl font-semibold text-slate-800 mb-1">My Site Visits</h1>
      <p className="text-xs text-slate-500 mb-4">Visits and testing dates the manager has booked for you.</p>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && visits.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">
          No site visits booked for you yet.
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Upcoming</h2>
          <div className="flex flex-col gap-2 mb-5">
            {upcoming.map((v) => <Card key={v.id} v={v} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Past</h2>
          <div className="flex flex-col gap-2 opacity-70">
            {past.map((v) => <Card key={v.id} v={v} />)}
          </div>
        </>
      )}
    </div>
  );
}
