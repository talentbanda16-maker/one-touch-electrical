import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function SectionCard({ number, title, color = "slate", children }) {
  const header = {
    slate: "bg-brand-900 text-white",
    blue:  "bg-blue-700 text-white",
    green: "bg-brand-600 text-white",
    amber: "bg-amber-600 text-white",
    red:   "bg-red-700 text-white",
  }[color];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 ${header} flex items-center gap-2`}>
        {number && <span className="w-6 h-6 rounded-full bg-white/20 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{number}</span>}
        <p className="text-sm font-bold">{title}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export default function SheWeeklyReport() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);

  // Header fields
  const [projectName, setProjectName] = useState("");
  const [weekEnding, setWeekEnding]   = useState(today);
  const [preparedBy, setPreparedBy]   = useState("");
  const [position, setPosition]       = useState("SHE Officer");
  const [reportDate, setReportDate]   = useState(today);

  // Sections
  const [executive, setExecutive]       = useState("");
  const [focusNext, setFocusNext]       = useState("");
  const [keyActivities, setKeyActivities] = useState([
    "Coordinating with the supervisor in managing work activities.",
    "Coordinating and enforcing housekeeping activities at different workstations.",
    "Work monitoring.",
    "Work inspections.",
    "Daily SHE talks.",
    "Enforcing SHE standards and wearing of PPE.",
  ]);
  const [incidents, setIncidents]       = useState("");
  const [inspections, setInspections]   = useState("");
  const [training, setTraining]         = useState("");
  const [hazards, setHazards]           = useState("");
  const [submittedBy, setSubmittedBy]   = useState("");
  const [submitDate, setSubmitDate]     = useState(today);

  // KPI rows
  const [kpiRows, setKpiRows] = useState([
    { kpi: "Fatalities",                   value: "0" },
    { kpi: "LTIs (Lost Time Injuries)",    value: "0" },
    { kpi: "Medical Treatment Cases",      value: "0" },
    { kpi: "Near Misses Reported",         value: "0" },
    { kpi: "Unsafe Acts and Conditions",   value: "0" },
    { kpi: "Property Damage",              value: "0" },
  ]);
  function updateKpi(i, field, val) {
    setKpiRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  useEffect(() => {
    const id = (() => { try { return localStorage.getItem("active_project") || ""; } catch { return ""; } })();
    if (!id) return;
    api.get("/projects").then((list) => {
      const p = list.find((x) => x.id === id);
      if (p) setProjectName(p.name);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">SHE Performance Weekly Report</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Document header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <tbody>
              <tr>
                <td rowSpan={3} className="border border-slate-300 p-2 text-center align-middle w-28">
                  <img src="/logo.png" alt="One Touch" className="w-24 mx-auto" />
                </td>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-black text-base text-slate-800 text-center align-middle">
                  SHEQ MANAGEMENT SYSTEM
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-green-600 text-center align-middle">
                  SHE PERFORMANCE WEEKLY REPORT
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-700 align-middle">Department: SHEQ</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle w-24">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Report info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Week Ending</label>
              <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Project / Site</label>
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Prepared By</label>
              <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Position</label>
              <input type="text" value={position} onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <SectionCard number="1" title="Executive Summary" color="slate">
          <textarea value={executive} onChange={(e) => setExecutive(e.target.value)} rows={4}
            placeholder="Summarise the week's SHE activities and observations…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          <p className="text-xs font-semibold text-slate-500 mt-3 mb-1">Focus Area Next Week</p>
          <textarea value={focusNext} onChange={(e) => setFocusNext(e.target.value)} rows={2}
            placeholder="What will be prioritised next week…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </SectionCard>

        {/* Key Activities */}
        <SectionCard number="2" title="Key Activities Conducted" color="blue">
          <div className="space-y-2">
            {keyActivities.map((act, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-1">{i + 1}</span>
                <input type="text" value={act}
                  onChange={(e) => setKeyActivities((a) => a.map((x, idx) => idx === i ? e.target.value : x))}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button onClick={() => setKeyActivities((a) => a.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-600 text-xs font-bold mt-1.5">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setKeyActivities((a) => [...a, ""])}
            className="mt-3 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Activity
          </button>
        </SectionCard>

        {/* KPI Table */}
        <SectionCard number="3" title="Key SHE Statistics" color="amber">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="border border-amber-200 px-3 py-2 text-left font-bold text-amber-800">Key Performance Indicator</th>
                  <th className="border border-amber-200 px-3 py-2 text-center font-bold text-amber-800">Performance</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                    <td className="border border-amber-100 px-2 py-1">
                      <input type="text" value={row.kpi} onChange={(e) => updateKpi(i, "kpi", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-amber-100 px-2 py-1 w-28">
                      <input type="text" value={row.value} onChange={(e) => updateKpi(i, "value", e.target.value)}
                        className="w-full text-center rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setKpiRows((r) => [...r, { kpi: "", value: "0" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
        </SectionCard>

        {/* Incidents */}
        <SectionCard number="4" title="Incidents and Investigations" color="red">
          <textarea value={incidents} onChange={(e) => setIncidents(e.target.value)} rows={5}
            placeholder="Describe any incidents, near misses or investigations for the week…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </SectionCard>

        {/* Inspections */}
        <SectionCard number="5" title="Inspections and Audits" color="blue">
          <textarea value={inspections} onChange={(e) => setInspections(e.target.value)} rows={5}
            placeholder="Detail inspections conducted, findings and corrective actions…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </SectionCard>

        {/* Training */}
        <SectionCard number="6" title="Training and Meetings" color="green">
          <textarea value={training} onChange={(e) => setTraining(e.target.value)} rows={3}
            placeholder="Toolbox talks, training sessions, SHE meetings held this week…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </SectionCard>

        {/* Top Hazards */}
        <SectionCard number="7" title="Top Hazards Identified This Week" color="red">
          <textarea value={hazards} onChange={(e) => setHazards(e.target.value)} rows={3}
            placeholder="List the main hazards observed on site this week…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </SectionCard>

        {/* Submission */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <p className="text-sm font-bold text-slate-800">Submitted By</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
              <input type="text" value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input type="date" value={submitDate} onChange={(e) => setSubmitDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
