import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { isNetworkFailure } from "../lib/offlineQueue";

const inputCls = "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

function AutoTextarea({ value, onChange, placeholder, minRows = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={minRows}
      className={`${inputCls} resize-none overflow-hidden`}
    />
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionCard({ number, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2.5 border-b border-slate-100 flex items-center gap-2">
        {number && (
          <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {number}
          </span>
        )}
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

const EMPTY_PERSON = { name: "", nationalId: "", jobTitle: "", dateOfEngagement: "" };
const EMPTY_WITNESS = { name: "", jobTitle: "" };

export default function SheIncidentReport() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);

  const [projects, setProjects]         = useState([]);
  const [projectId, setProjectId]       = useState("");
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [submissionId]                  = useState(() => crypto.randomUUID());
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [submittedBy,  setSubmittedBy]  = useState("");
  const [submittedDate, setSubmittedDate] = useState(today);
  const [docNumber, setDocNumber] = useState("");

  // Header
  const [reportVariant, setReportVariant]       = useState("PRELIMINARY");
  const [incidentDateTime, setIncidentDateTime] = useState("");
  const [reportedDateTime, setReportedDateTime] = useState("");
  const [placeOfAccident, setPlaceOfAccident]   = useState("");

  // People involved
  const [involvedPersons, setInvolvedPersons] = useState([{ ...EMPTY_PERSON }]);

  // Supervisor
  const [supervisorName,  setSupervisorName]  = useState("");
  const [supervisorTitle, setSupervisorTitle] = useState("");

  // Witnesses
  const [witnesses, setWitnesses] = useState([{ ...EMPTY_WITNESS }]);

  // Sections
  const [incidentDescription, setIncidentDescription] = useState("");
  const [natureOfInjury,      setNatureOfInjury]      = useState("");
  const [incidentCosts,       setIncidentCosts]        = useState("");
  const [immediateCause,      setImmediateCause]       = useState("");
  const [basicCause,          setBasicCause]           = useState("");
  const [otherObservations,   setOtherObservations]    = useState("");

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (user?.name && !submittedBy) setSubmittedBy(user.name);
  }, [user]);

  // ── People involved helpers ──
  function updatePerson(idx, field, val) {
    setInvolvedPersons((ps) => ps.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  }
  function addPerson()       { setInvolvedPersons((ps) => [...ps, { ...EMPTY_PERSON }]); }
  function removePerson(idx) { setInvolvedPersons((ps) => ps.filter((_, i) => i !== idx)); }

  // ── Witness helpers ──
  function updateWitness(idx, field, val) {
    setWitnesses((ws) => ws.map((w, i) => i === idx ? { ...w, [field]: val } : w));
  }
  function addWitness()       { setWitnesses((ws) => [...ws, { ...EMPTY_WITNESS }]); }
  function removeWitness(idx) { setWitnesses((ws) => ws.filter((_, i) => i !== idx)); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!projectId)           return setError("Please select a project.");
    if (!incidentDateTime)    return setError("Date and time of incident is required.");
    if (!placeOfAccident)     return setError("Place of accident is required.");
    if (!incidentDescription) return setError("Description of incident is required.");

    const periodReportData = {
      isIncidentReport: true,
      reportVariant,
      incidentDateTime,
      reportedDateTime,
      placeOfAccident,
      involvedPersons,
      supervisorName,
      supervisorTitle,
      witnesses,
      incidentDescription,
      natureOfInjury,
      incidentCosts,
      immediateCause,
      basicCause,
      otherObservations,
      submittedBy,
      submittedDate,
      docNumber,
    };

    setSubmitting(true);
    try {
      const report = await api.post("/reports/she", {
        projectId,
        reportDate: today,
        periodType: "DAILY",
        submissionId,
        periodReportData,
        toolboxTalksConducted: "Incident report — see description",
        incidentCount: 1,
        nearMissCount: 0,
        incidentsDescription: incidentDescription,
        hazardsIdentified: immediateCause,
      });

      // Upload photos if any
      if (stagedPhotos.length > 0) {
        for (const photo of stagedPhotos) {
          const fd = new FormData();
          fd.append("file", photo.file);
          fd.append("reportId", report.id);
          fd.append("label", "Incident Evidence");
          await api.upload("/attachments", fd).catch(() => {});
        }
      }

      setSuccess("Incident report submitted successfully.");
    } catch (err) {
      if (isNetworkFailure(err)) {
        setSuccess("Saved offline — will sync when back online.");
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top bar */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">Incident Report</h1>
          <p className="text-xs text-slate-500">Safety, Health &amp; Environment</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Document header — exact layout match */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {/* Row 1: logo | SHEQ title | All Departments */}
                <tr>
                  <td rowSpan={4} className="border border-slate-300 p-2 text-center align-middle w-28">
                    <img src="/logo.png" alt="One Touch Electrical & Construction Services" className="w-24 mx-auto" />
                  </td>
                  <td className="border border-slate-300 px-3 py-2 font-black text-sm text-slate-800 text-center align-middle">
                    SHEQ MANAGEMENT SYSTEM
                  </td>
                  <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-slate-700 text-center align-middle">
                    All Departments
                  </td>
                </tr>
                {/* Row 2: Initializing Dept (rowspan 2) | Document Number | input */}
                <tr>
                  <td rowSpan={2} className="border border-slate-300 px-3 py-2 align-top text-slate-700">
                    <span className="font-semibold">Initializing Department:</span>
                    <br /><span className="font-bold">SHEQ Department</span>
                  </td>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 whitespace-nowrap align-middle">
                    Document<br/>Number
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-middle w-32">
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="e.g. OT-001"
                      className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
                {/* Row 3: (initializing dept continues) | Revision Date | N/A */}
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 whitespace-nowrap align-middle">
                    Revision Date
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-slate-500 align-middle">N/A</td>
                </tr>
                {/* Row 4: Document Title | Revision No. | Page */}
                <tr>
                  <td className="border border-slate-300 px-3 py-2 text-slate-700 align-top">
                    <span className="font-semibold">Document Title:</span>
                    <br />
                    <span className="font-bold">
                      SHE Incident Investigation {reportVariant === "FINAL" ? "Final" : "Preliminary"} Report
                    </span>
                  </td>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 whitespace-nowrap align-middle">
                    Revision No.
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-slate-500 align-middle">Page 1 of 3</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Report Type + Header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
            {/* PRELIMINARY / FINAL toggle */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Report Type</p>
              <div className="flex gap-3">
                {["PRELIMINARY", "FINAL"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setReportVariant(v)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                      reportVariant === v
                        ? "bg-red-600 border-red-600 text-white"
                        : "bg-white border-slate-300 text-slate-600 hover:border-red-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Project" required>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date &amp; Time of Incident" required>
                <input type="datetime-local" value={incidentDateTime} onChange={(e) => setIncidentDateTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Date &amp; Time Reported">
                <input type="datetime-local" value={reportedDateTime} onChange={(e) => setReportedDateTime(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <Field label="Place of Accident" required>
              <input type="text" value={placeOfAccident} onChange={(e) => setPlaceOfAccident(e.target.value)} className={inputCls} placeholder="e.g. Chiremba Drive, Puma Service Station area" />
            </Field>
          </div>

          {/* People Involved */}
          <SectionCard number="1" title="People Involved">
            <div className="space-y-4">
              {involvedPersons.map((p, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Person {idx + 1}</span>
                    {involvedPersons.length > 1 && (
                      <button type="button" onClick={() => removePerson(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Full Name">
                      <input type="text" value={p.name} onChange={(e) => updatePerson(idx, "name", e.target.value)} className={inputCls} placeholder="Full name" />
                    </Field>
                    <Field label="National ID">
                      <input type="text" value={p.nationalId} onChange={(e) => updatePerson(idx, "nationalId", e.target.value)} className={inputCls} placeholder="ID number" />
                    </Field>
                    <Field label="Job Title">
                      <input type="text" value={p.jobTitle} onChange={(e) => updatePerson(idx, "jobTitle", e.target.value)} className={inputCls} placeholder="Job title" />
                    </Field>
                    <Field label="Date of Engagement">
                      <input type="text" value={p.dateOfEngagement} onChange={(e) => updatePerson(idx, "dateOfEngagement", e.target.value)} className={inputCls} placeholder="e.g. 2022" />
                    </Field>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addPerson} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">+ Add person</button>
            </div>

            <hr className="border-slate-100" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name of Supervisor">
                <input type="text" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Supervisor's Job Title">
                <input type="text" value={supervisorTitle} onChange={(e) => setSupervisorTitle(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Witnesses</p>
              {witnesses.map((w, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <Field label={idx === 0 ? "Name" : ""}>
                    <input type="text" value={w.name} onChange={(e) => updateWitness(idx, "name", e.target.value)} className={inputCls} placeholder="Witness name" />
                  </Field>
                  <Field label={idx === 0 ? "Job Title" : ""}>
                    <input type="text" value={w.jobTitle} onChange={(e) => updateWitness(idx, "jobTitle", e.target.value)} className={inputCls} placeholder="Job title" />
                  </Field>
                  {witnesses.length > 1 && (
                    <button type="button" onClick={() => removeWitness(idx)} className="mb-0.5 text-slate-400 hover:text-red-500 text-xl leading-none">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addWitness} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">+ Add witness</button>
            </div>
          </SectionCard>

          {/* Description */}
          <SectionCard number="2" title="Description of the Incident">
            <AutoTextarea
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              placeholder="Describe exactly what happened, when, where, and who was involved..."
              minRows={4}
            />
          </SectionCard>

          {/* Consequences */}
          <SectionCard number="3" title="Consequences">
            <Field label="Nature of Injury / Damage">
              <AutoTextarea
                value={natureOfInjury}
                onChange={(e) => setNatureOfInjury(e.target.value)}
                placeholder="e.g. Property damage only, No injuries..."
                minRows={2}
              />
            </Field>
            <Field label="Incident Costs (Medical, Production Loss, Repairs)">
              <input type="text" value={incidentCosts} onChange={(e) => setIncidentCosts(e.target.value)} className={inputCls} placeholder="e.g. TBA, $500 repair costs..." />
            </Field>
          </SectionCard>

          {/* Causes */}
          <SectionCard number="4" title="Causes">
            <Field label="Immediate Cause(s) of Accident">
              <AutoTextarea
                value={immediateCause}
                onChange={(e) => setImmediateCause(e.target.value)}
                placeholder="What directly caused the incident?"
                minRows={2}
              />
            </Field>
            <Field label="Basic Cause of Accident">
              <AutoTextarea
                value={basicCause}
                onChange={(e) => setBasicCause(e.target.value)}
                placeholder="What was the underlying root cause?"
                minRows={2}
              />
            </Field>
          </SectionCard>

          {/* Other Observations */}
          <SectionCard number="5" title="Other Observations">
            <AutoTextarea
              value={otherObservations}
              onChange={(e) => setOtherObservations(e.target.value)}
              placeholder="Any other observations or recommendations..."
              minRows={3}
            />
          </SectionCard>

          {/* Pictorial Evidence */}
          <SectionCard number="6" title="Pictorial Evidence">
            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 transition-colors">
                <span className="text-2xl">📷</span>
                <span className="text-sm text-slate-500">Tap to add photos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    const newPhotos = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
                    setStagedPhotos((prev) => [...prev, ...newPhotos]);
                  }}
                />
              </label>
              {stagedPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {stagedPhotos.map((p, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img src={p.previewUrl} className="w-full h-full object-cover rounded-xl" alt="" />
                      <button
                        type="button"
                        onClick={() => setStagedPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Submitted by */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Submission</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Submitted By">
                <input
                  type="text"
                  value={submittedBy}
                  onChange={(e) => setSubmittedBy(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={submittedDate}
                  onChange={(e) => setSubmittedDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors"
          >
            {submitting ? "Submitting..." : `Submit ${reportVariant} Incident Report`}
          </button>
        </form>
      </div>
    </div>
  );
}
