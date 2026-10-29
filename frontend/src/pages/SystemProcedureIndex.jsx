import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PROCEDURES = [
  {
    no: "SHEQMSP01", title: "Documented Information Control Procedure",
    forms: [
      { no: "SHEQMSP01-F01", title: "Safety Health Policy" },
      { no: "SHEQMSP01-F02", title: "Environment Policy" },
      { no: "SHEQMSP01-F03", title: "Quality Policy" },
      { no: "SHEQMSP01-F05", title: "Document Distribution List" },
      { no: "SHEQMSP01-F06", title: "File Contents List" },
      { no: "SHEQMSP01-F07", title: "Register of Documented Information" },
      { no: "SHEQMSP01-F08", title: "Register of Documented Information of External Origin" },
      { no: "SHEQMSP01-F09", title: "Management of Change Control" },
      { no: "SHEQMSP01-F10", title: "Systems Procedure Index" },
    ],
  },
  {
    no: "SHEQMSP02", title: "Risk & Opportunity Identification and Assessment Procedure",
    forms: [
      { no: "SHEQMSP02-F01", title: "Pre-Task Risk Assessment Form" },
      { no: "SHEQMSP02-F02", title: "Issue Based Risk Assessments (IBRA) Form" },
      { no: "SHEQMSP02-F03", title: "Training Records" },
      { no: "SHEQMSP02-F04", title: "Process Flow Charts" },
      { no: "SHEQMSP02-F05", title: "Register of Risks and Opportunities" },
      { no: "SHEQMSP02-F06", title: "Management Programs" },
    ],
  },
  {
    no: "SHEQMSP03", title: "Accident / Incident Investigation and Reporting Procedure",
    forms: [
      { no: "SHEQMSP03-F01", title: "Accident/Incident Supervisor Preliminary Report" },
      { no: "SHEQMSP03-F02", title: "Incident Flash Report Form" },
      { no: "SHEQMSP03-F03", title: "Accident/Incident Investigation Report" },
      { no: "SHEQMSP03-F04", title: "Accident Closure Form" },
      { no: "SHEQMSP03-F05", title: "Accident Tracking Graphs" },
      { no: "SHEQMSP03-F06", title: "NSSA WCIF 14 Register" },
      { no: "SHEQMSP03-F07", title: "Cumulative Accident Statistics" },
      { no: "SHEQMSP03-F08", title: "Return of Casualty Report Form/Book" },
      { no: "SHEQMSP03-F09", title: "Incident/Accident Register" },
    ],
  },
  {
    no: "SHEQMSP04", title: "Legal and Other Requirements Procedure",
    forms: [
      { no: "SHEQMSP04-F01", title: "Permits and License Register" },
      { no: "SHEQMSP04-F02", title: "Legal Register" },
      { no: "SHEQMSP04-F03", title: "Training Records" },
    ],
  },
  {
    no: "SHEQMSP05", title: "Communication and Worker Consultation Procedure",
    forms: [
      { no: "SHEQMSP05-F01", title: "Monthly Reports" },
      { no: "SHEQMSP05-F02", title: "SHE Meeting Agenda" },
      { no: "SHEQMSP05-F03", title: "Safety Talk Form" },
      { no: "SHEQMSP05-F04", title: "SHE Meetings Schedule Form" },
      { no: "SHEQMSP05-F05", title: "SHE Meetings Minutes Form" },
      { no: "SHEQMSP05-F06", title: "Quarterly Environment Report" },
      { no: "SHEQMSP05-F07", title: "SHEQ Weekly Report" },
      { no: "SHEQMSP05-F08", title: "SHEQ Complaints Book" },
    ],
  },
  {
    no: "SHEQMSP06", title: "SHEQ Training and Awareness Procedure",
    forms: [
      { no: "SHEQMSP06-F01", title: "Generic SHEQ Induction" },
      { no: "SHEQMSP06-F02", title: "Training Needs Analysis" },
      { no: "SHEQMSP06-F03", title: "Training Matrix" },
      { no: "SHEQMSP06-F04", title: "Training Register" },
      { no: "SHEQMSP06-F05", title: "Visitors SHEQ Induction" },
      { no: "SHEQMSP06-F06", title: "Course Nomination Form" },
    ],
  },
  {
    no: "SHEQMSP07", title: "Control of Retained Documented Information",
    forms: [],
  },
  {
    no: "SHEQMSP08", title: "Roles and Responsibility Procedure",
    forms: [
      { no: "SHEQMSP08-F01", title: "Legal Appointment Form" },
      { no: "SHEQMSP08-F02", title: "SHE Representative Appointment Form" },
      { no: "SHEQMSP08-F03", title: "Hazardous Substance Controller Appointment" },
      { no: "SHEQMSP08-F04", title: "General Employee Legal Appointments" },
    ],
  },
  {
    no: "SHEQMSP09", title: "Waste Management Procedure",
    forms: [
      { no: "SHEQMSP09-F01", title: "Waste Inventory Form" },
    ],
  },
  {
    no: "SHEQMSP10", title: "Internal Audit Procedure",
    forms: [
      { no: "SHEQMSP10-F01", title: "Internal Audit Assessment Form" },
      { no: "SHEQMSP10-F02", title: "Internal Audit Notification Form" },
      { no: "SHEQMSP10-F03", title: "Internal Audit Checklist Form" },
      { no: "SHEQMSP10-F04", title: "Internal Audit Report" },
      { no: "SHEQMSP10-F05", title: "Master Schedule of Internal Audit" },
    ],
  },
  {
    no: "SHEQMSP11", title: "Breathalyzer Use and Maintenance Procedure",
    forms: [
      { no: "SHEQMSP11-F01", title: "Refusal to Access Entry Form" },
    ],
  },
  {
    no: "SHEQMSP12", title: "Site Entry Procedure",
    forms: [
      { no: "SHEQMSP12-F01", title: "Commercial Trucks Register" },
      { no: "SHEQMSP12-F02", title: "OTECS Register" },
      { no: "SHEQMSP12-F03", title: "Contractors Register" },
      { no: "SHEQMSP12-F04", title: "Visitors Register" },
    ],
  },
  {
    no: "SHEQMSP13", title: "Monitoring & Measurement Procedure",
    forms: [
      { no: "SHEQMSP13-F01", title: "SHE Inspection" },
      { no: "SHEQMSP13-F02", title: "Fire Extinguisher Register Form" },
      { no: "SHEQMSP13-F03", title: "VFL Form" },
      { no: "SHEQMSP13-F04", title: "SHE Violation Fees Schedule" },
      { no: "SHEQMSP13-F05", title: "Planned Task Observation — Blast Guard" },
    ],
  },
  {
    no: "SHEQMSP14", title: "Personal Protective Equipment Procedure",
    forms: [
      { no: "SHEQMSP14-F01", title: "PPE Sample Comments Form" },
      { no: "SHEQMSP14-F02", title: "PPE Matrix" },
      { no: "SHEQMSP14-F03", title: "Training Register" },
      { no: "SHEQMSP14-F04", title: "Fair Wear & Tear Form" },
      { no: "SHEQMSP14-F05", title: "PPE Issue Record" },
      { no: "SHEQMSP14-F06", title: "PPE Requisition" },
    ],
  },
  {
    no: "SHEQMSP15", title: "Emergency Preparedness and Response Procedure",
    forms: [],
  },
  {
    no: "SHEQMSP16", title: "Contractor Management Procedure",
    forms: [
      { no: "SHEQMSP16-F01", title: "Contractor Appraisal" },
      { no: "SHEQMSP16-F02", title: "Contractor Register" },
    ],
  },
  {
    no: "SHEQMSP17", title: "Driving and Vehicle Driving Procedure",
    forms: [
      { no: "SHEQMSP17-F01", title: "Light Vehicle Checklist Form" },
      { no: "SHEQMSP17-F02", title: "Vehicle Driver Authorisation Form" },
    ],
  },
  {
    no: "SHEQMSP18", title: "SHE Promotion and Awards Procedure",
    forms: [
      { no: "SHEQMSP18-F01", title: "Nomination Form" },
    ],
  },
];

export default function SystemProcedureIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [openIdx, setOpenIdx] = useState(null);

  const filtered = PROCEDURES.filter(
    (p) =>
      p.no.toLowerCase().includes(search.toLowerCase()) ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.forms.some(
        (f) =>
          f.no.toLowerCase().includes(search.toLowerCase()) ||
          f.title.toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">System Procedure Index</h1>
          <p className="text-xs text-slate-500">{user?.name} · SHEQ Department</p>
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
                  SYSTEMS PROCEDURE INDEX
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-700 align-middle">Department/Section: SHEQ</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle w-24">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-3xl font-black text-slate-800">{PROCEDURES.length}</p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">Procedures</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-3xl font-black text-green-700">{PROCEDURES.reduce((s, p) => s + p.forms.length, 0)}</p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">Forms</p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-2">
          <span className="text-slate-400 text-lg">🔍</span>
          <input
            type="text"
            placeholder="Search procedures or forms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm focus:outline-none text-slate-700 placeholder-slate-300"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 text-lg leading-none">×</button>
          )}
        </div>

        {/* Procedure list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-8 text-center text-slate-400 text-sm">
            No procedures match "{search}"
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((proc, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div key={proc.no} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="flex-shrink-0 bg-brand-900 text-white text-[10px] font-black px-2 py-1 rounded-lg leading-none">
                      {proc.no}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-slate-800 leading-snug">{proc.title}</span>
                    <span className="flex-shrink-0 flex items-center gap-1.5">
                      {proc.forms.length > 0 && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          {proc.forms.length} form{proc.forms.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-slate-300 text-base">{isOpen ? "▲" : "▼"}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      {proc.forms.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No corresponding forms listed.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {proc.forms.map((form) => (
                            <li key={form.no} className="flex items-start gap-2">
                              <span className="flex-shrink-0 font-mono text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-0.5">
                                {form.no}
                              </span>
                              <span className="text-sm text-slate-700">{form.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
