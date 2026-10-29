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

function StatusBadge({ status }) {
  const cls = status === "Compliant" || status === "Valid certificate"
    ? "bg-green-100 text-green-700"
    : status === "Closed"
    ? "bg-slate-100 text-slate-600"
    : "bg-amber-100 text-amber-700";
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

export default function SheMonthlyReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [securityRows, setSecurityRows] = useState([
    { item: "Security Company",               measure: "Northern Deep Security",                                 status: "Closed"  },
    { item: "Site Access",                    measure: "Security guards stationed at all access points",         status: "Ongoing" },
    { item: "Site Induction",                 measure: "Compulsory site inductions done",                       status: "Ongoing" },
    { item: "Safeguarding of Materials",      measure: "Daily stock count and recording",                       status: "Ongoing" },
    { item: "Visitor and Personnel Management", measure: "Visitors log book available at security checkpoint",  status: "Ongoing" },
  ]);
  function updateSecurity(i, field, val) {
    setSecurityRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [insuranceRows, setInsuranceRows] = useState([
    { item: "Contractors All Risks",  status: "Valid certificate" },
    { item: "Worker's Compensation",  status: "Valid certificate" },
    { item: "Public Liability",       status: "Valid certificate" },
    { item: "Plant and Equipment",    status: "Valid certificate" },
  ]);
  function updateInsurance(i, field, val) {
    setInsuranceRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [incidentRows, setIncidentRows] = useState([
    { type: "Near Miss",                    count: "0" },
    { type: "FAC (First Aid Case)",         count: "0" },
    { type: "Property Damage",              count: "0" },
    { type: "MTC (Medical Treatment Case)", count: "0" },
    { type: "LTI (Lost Time Injury)",       count: "0" },
    { type: "RTA (Road Traffic Accident)",  count: "0" },
    { type: "Fatality",                     count: "0" },
    { type: "Security Incidents",           count: "0" },
  ]);
  function updateIncident(i, field, val) {
    setIncidentRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [regulatoryRows, setRegulatoryRows] = useState([
    { body: "EMA",   requirement: "Proper waste management",               status: "Compliant" },
    { body: "NSSA",  requirement: "Safety on site",                        status: "Compliant" },
    { body: "ZETDC", requirement: "Transformer and RMU Test certificate",  status: "Compliant" },
    { body: "ZETDC", requirement: "185mm² × 3core 11kV MV cable clearance",status: "Compliant" },
    { body: "NEC",   requirement: "Registration",                          status: "Compliant" },
  ]);
  function updateRegulatory(i, field, val) {
    setRegulatoryRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [inspectionRows, setInspectionRows] = useState([
    { body: "EMA",   purpose: "Inspection",           visits: "4", issues: "Dust suppression",                       status: "Ongoing" },
    { body: "ZETDC", purpose: "Inspection",           visits: "6", issues: "Transformer and RMU inspection",          status: "Closed"  },
    { body: "ZETDC", purpose: "",                     visits: "",  issues: "185mm² × 3core 11kV cable inspection",    status: "Ongoing" },
    { body: "NSSA",  purpose: "Site safety inspection",visits: "7", issues: "Site safety",                            status: "Ongoing" },
    { body: "NEC",   purpose: "Site inspection",      visits: "3", issues: "Site safety",                            status: "Ongoing" },
  ]);
  function updateInspection(i, field, val) {
    setInspectionRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [safetyRows, setSafetyRows] = useState([
    { item: "Working at Height",                    measure: "Safety belts issued to employees working at height", status: "Ongoing" },
    { item: "Personal Protective Equipment (PPE)",  measure: "All employees issued full PPE",                      status: "Ongoing" },
    { item: "",                                     measure: "PPE Issue register updated and signed",              status: "Ongoing" },
    { item: "Tools and Equipment",                  measure: "All equipment inspected and serviced",               status: "Ongoing" },
    { item: "Routine SHEQ Inspections",             measure: "Inspections done and documented",                    status: "Ongoing" },
  ]);

  function updateSafety(i, field, val) {
    setSafetyRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const [manpower, setManpower] = useState({
    foreman: "", electricians: "", assistants: "", sheq: "", stores: "",
    male: "", female: "", total: "",
  });

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
          <h1 className="text-base font-bold text-slate-800">Monthly SHEQ Report</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Report header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-4 flex items-start gap-4">
            <img src="/logo.png" alt="One Touch" className="w-16 flex-shrink-0" />
            <div>
              <p className="text-sm font-black text-slate-800 leading-snug">{projectName ? projectName.toUpperCase() : "—"}</p>
              <p className="text-sm font-bold text-green-700 mt-0.5">SHEQ REPORT – ONE TOUCH ELECTRICAL SERVICES</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-slate-600 flex-shrink-0">Reporting Period:</p>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <span className="text-xs text-slate-400 font-semibold">to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 1 */}
        <SectionCard number="1" title="Health and Fitness for Work" color="blue">
          <textarea
            value={healthNotes}
            onChange={(e) => setHealthNotes(e.target.value)}
            rows={4}
            placeholder="Enter health and fitness observations for this reporting period…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </SectionCard>

        {/* Section 2.1 */}
        <SectionCard number="2" title="Site Safety and Compliance" color="slate">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">2.1 Manpower Breakdown</p>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Item</th>
                  <th className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-700">No.</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Foreman",                "foreman",      false],
                  ["Electricians",           "electricians", false],
                  ["Assistant Electricians", "assistants",   false],
                  ["SHEQ",                   "sheq",         false],
                  ["Stores",                 "stores",       false],
                  ["Male",                   "male",         true],
                  ["Female",                 "female",       true],
                ].map(([label, key, bold], i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className={`border border-slate-200 px-3 py-2 ${bold ? "font-bold text-slate-800" : "text-slate-700"}`}>{label}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">
                      <input
                        type="number" min="0"
                        value={manpower[key]}
                        onChange={(e) => setManpower((m) => ({ ...m, [key]: e.target.value }))}
                        className={`w-16 text-center rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${bold ? "font-bold" : ""}`}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100">
                  <td className="border border-slate-200 px-3 py-2 font-bold text-slate-800">Total Manpower</td>
                  <td className="border border-slate-200 px-2 py-2 text-center font-black text-slate-800 text-sm">
                    {["foreman","electricians","assistants","sheq","stores"].reduce((s, k) => s + (parseInt(manpower[k]) || 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">2.2 Safety Compliance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Safety Compliance Item</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Control Measure</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {safetyRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="border border-slate-200 px-2 py-1 align-top">
                      <textarea value={row.item} onChange={(e) => updateSafety(i, "item", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-slate-200 px-2 py-1 align-top">
                      <textarea value={row.measure} onChange={(e) => updateSafety(i, "measure", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-slate-200 px-2 py-1 align-top w-28">
                      <select value={row.status} onChange={(e) => updateSafety(i, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option>Ongoing</option>
                        <option>Closed</option>
                        <option>Compliant</option>
                        <option>Non-Compliant</option>
                      </select>
                      <button onClick={() => setSafetyRows((r) => r.filter((_, idx) => idx !== i))}
                        className="mt-1 w-full text-xs text-red-400 hover:text-red-600 font-semibold">✕ Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setSafetyRows((r) => [...r, { item: "", measure: "", status: "Ongoing" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
        </SectionCard>

        {/* Section 3 */}
        <SectionCard number="3" title="Security and Surveillance" color="slate">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Security Item</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Control Measure</th>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {securityRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="border border-slate-200 px-2 py-1 align-top">
                      <textarea value={row.item} onChange={(e) => updateSecurity(i, "item", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-slate-200 px-2 py-1 align-top">
                      <textarea value={row.measure} onChange={(e) => updateSecurity(i, "measure", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-slate-200 px-2 py-1 align-top w-28">
                      <select value={row.status} onChange={(e) => updateSecurity(i, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option>Ongoing</option>
                        <option>Closed</option>
                        <option>Compliant</option>
                        <option>Non-Compliant</option>
                      </select>
                      <button onClick={() => setSecurityRows((r) => r.filter((_, idx) => idx !== i))}
                        className="mt-1 w-full text-xs text-red-400 hover:text-red-600 font-semibold">✕ Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setSecurityRows((r) => [...r, { item: "", measure: "", status: "Ongoing" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
        </SectionCard>

        {/* Section 4 */}
        <SectionCard number="4" title="Insurance Compliance" color="green">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-green-50">
                  <th className="border border-green-200 px-3 py-2 text-left font-bold text-green-800">Insurance</th>
                  <th className="border border-green-200 px-3 py-2 text-left font-bold text-green-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {insuranceRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-green-50/40"}>
                    <td className="border border-green-100 px-2 py-1 align-top">
                      <input type="text" value={row.item} onChange={(e) => updateInsurance(i, "item", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-green-100 px-2 py-1 align-top w-40">
                      <select value={row.status} onChange={(e) => updateInsurance(i, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option>Valid certificate</option>
                        <option>Expired</option>
                        <option>Pending</option>
                        <option>Not applicable</option>
                      </select>
                      <button onClick={() => setInsuranceRows((r) => r.filter((_, idx) => idx !== i))}
                        className="mt-1 w-full text-xs text-red-400 hover:text-red-600 font-semibold">✕ Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setInsuranceRows((r) => [...r, { item: "", status: "Valid certificate" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
        </SectionCard>

        {/* Section 5.1 */}
        <SectionCard number="5" title="Incidents and Corrective Actions" color="amber">
          <p className="text-sm text-slate-700 mb-3 flex gap-2">
            <span className="text-green-600 font-black">✓</span>
            No accident/incident was recorded during the period under review.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="border border-amber-200 px-3 py-2 text-left font-bold text-amber-800">Type of Incident</th>
                  <th className="border border-amber-200 px-3 py-2 text-center font-bold text-amber-800">Cumulative</th>
                  <th className="border border-amber-200 px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {incidentRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                    <td className="border border-amber-100 px-2 py-1 align-top">
                      <input type="text" value={row.type} onChange={(e) => updateIncident(i, "type", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-amber-100 px-2 py-1 align-top w-24">
                      <input type="number" min="0" value={row.count} onChange={(e) => updateIncident(i, "count", e.target.value)}
                        className="w-full text-center rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-amber-100 px-2 py-1 align-top text-center">
                      <button onClick={() => setIncidentRows((r) => r.filter((_, idx) => idx !== i))}
                        className="text-xs text-red-400 hover:text-red-600 font-semibold">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setIncidentRows((r) => [...r, { type: "", count: "0" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
          <p className="text-sm text-slate-600 mt-3 flex gap-2">
            <span className="text-green-600 font-black">✓</span>
            No SHE breaches were recorded for the period under review.
          </p>
        </SectionCard>

        {/* Section 6.1 */}
        <SectionCard number="6" title="Regulatory Compliance" color="blue">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">6.1 Regulatory Compliance</p>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Regulatory Body</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Statutory Requirement</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {regulatoryRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}>
                    <td className="border border-blue-100 px-2 py-1 align-top w-24">
                      <input type="text" value={row.body} onChange={(e) => updateRegulatory(i, "body", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top">
                      <input type="text" value={row.requirement} onChange={(e) => updateRegulatory(i, "requirement", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top w-36">
                      <select value={row.status} onChange={(e) => updateRegulatory(i, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option>Compliant</option>
                        <option>Non-Compliant</option>
                        <option>Ongoing</option>
                        <option>Pending</option>
                      </select>
                      <button onClick={() => setRegulatoryRows((r) => r.filter((_, idx) => idx !== i))}
                        className="mt-1 w-full text-xs text-red-400 hover:text-red-600 font-semibold">✕ Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setRegulatoryRows((r) => [...r, { body: "", requirement: "", status: "Compliant" }])}
            className="mb-4 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>

          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">6.2 Regulatory Inspection Records</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Body</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Purpose</th>
                  <th className="border border-blue-200 px-3 py-2 text-center font-bold text-blue-800">Visits</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Issues</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {inspectionRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}>
                    <td className="border border-blue-100 px-2 py-1 align-top w-16">
                      <input type="text" value={row.body} onChange={(e) => updateInspection(i, "body", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top">
                      <textarea value={row.purpose} onChange={(e) => updateInspection(i, "purpose", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top w-14">
                      <input type="number" min="0" value={row.visits} onChange={(e) => updateInspection(i, "visits", e.target.value)}
                        className="w-full text-center rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top">
                      <textarea value={row.issues} onChange={(e) => updateInspection(i, "issues", e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    </td>
                    <td className="border border-blue-100 px-2 py-1 align-top w-32">
                      <select value={row.status} onChange={(e) => updateInspection(i, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option>Ongoing</option>
                        <option>Closed</option>
                        <option>Compliant</option>
                        <option>Non-Compliant</option>
                        <option>Pending</option>
                      </select>
                      <button onClick={() => setInspectionRows((r) => r.filter((_, idx) => idx !== i))}
                        className="mt-1 w-full text-xs text-red-400 hover:text-red-600 font-semibold">✕ Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setInspectionRows((r) => [...r, { body: "", purpose: "", visits: "", issues: "", status: "Ongoing" }])}
            className="mt-2 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-xl py-2 text-sm font-semibold transition-colors">
            + Add Row
          </button>
        </SectionCard>

      </div>
    </div>
  );
}
