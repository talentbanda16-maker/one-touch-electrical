import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";
import AttachmentThumb from "../components/AttachmentThumb";

const BLANK_EQUIP = { tool: "", qty: "", condition: "", remarks: "" };
const BLANK_MATERIAL = { material: "", qtyReceived: "", qtyUsed: "", supplier: "", remarks: "" };
const BLANK_PERSON = { category: "", company: "", workers: "", tasks: "" };
const WEATHER_OPTIONS = ["Sunny", "Cloudy", "Rain", "Windy"];
const PPE_OPTIONS = ["Good", "Fair", "Poor"];
const inputCls = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-base";
const cellCls = "w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded bg-transparent";

// The full paper "Electrical Site Foreman Daily Report" — 12 sections.
function addDays(dateStr, n) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  reportDate: new Date().toISOString().slice(0, 10),
  // Weekly range (weekly report only)
  weekStarting: "",
  weekEnding: "",
  // 1. Project information
  location: "",
  clientMainContractor: "",
  weather: "",
  temperature: "",
  // 2. Personnel on site
  personnel: [
    { category: "Electricians", company: "", workers: "", tasks: "" },
    { category: "Supervisors", company: "", workers: "", tasks: "" },
    { category: "Laborers", company: "", workers: "", tasks: "" },
    { category: "Subcontractors", company: "", workers: "", tasks: "" },
  ],
  // overall progress (drives KPIs/analytics)
  percentProgress: "",
  // 3. Work completed today
  workCompleted: "",
  // 4. Equipment & tools used
  equipment: [{ ...BLANK_EQUIP }],
  // 5. Material delivered / used
  materials: [{ ...BLANK_MATERIAL }],
  // 6. Inspections & testing
  inspectionsTesting: "",
  // 7. Safety report
  toolboxTalk: "",
  ppeCompliance: "",
  hazardsIdentified: "",
  correctiveActions: "",
  incidentsNearMisses: "",
  // 8. Coordination & communication
  coordinationCommunication: "",
  // 9. Problems / delays / constraints
  problemsDelaysConstraints: "",
  // 10. Plan for next day
  nextDayPlan: "",
  // 11. Foreman's comments
  foremanComments: "",
  // 12. Signatures (name + drawn signature image)
  foremanSignature: "",
  foremanSignatureImg: "",
  siteEngineerSignature: "",
  siteEngineerSignatureImg: "",
  signatureDate: "",
};

export default function ForemanReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const weekly = searchParams.get("period") === "weekly";
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]); // [{ file, previewUrl }]
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [editingReportId, setEditingReportId] = useState(null);
  // Generated once per form session rather than fresh inside handleSubmit
  // — a submissionId that changes on every call defeats its own purpose
  // (deduping a retried/double-fired submit) since two rapid submits of
  // the "same" report would carry two different ids.
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [hasDraft, setHasDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length === 0) return;
      let saved = "";
      try { saved = localStorage.getItem("active_project") || ""; } catch { /* ignore */ }
      const match = data.find((p) => p.id === saved);
      setProjectId((cur) => cur || (match ? match.id : data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/reports/foreman?projectId=${projectId}&periodType=${weekly ? "WEEKLY" : "DAILY"}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success, weekly]);

  // A saved draft only makes sense for a brand-new report — editing a
  // returned one already has its own in-progress state loaded via `edit=`.
  useEffect(() => {
    if (!projectId || editingReportId) return;
    api
      .get(`/drafts/FOREMAN?projectId=${projectId}`)
      .then((draft) => {
        if (draft) {
          setForm({ ...EMPTY_FORM, ...draft.data, reportDate: draft.reportDate.slice(0, 10) });
          setHasDraft(true);
        } else {
          setHasDraft(false);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSaveDraft() {
    if (!projectId) return;
    setError("");
    setSuccess("");
    setSavingDraft(true);
    try {
      await api.put(`/drafts/FOREMAN`, { projectId, reportDate: form.reportDate, data: form });
      setHasDraft(true);
      setSuccess("Draft saved.");
    } catch (err) {
      setError(err.message || "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleDiscardDraft() {
    try {
      await api.delete(`/drafts/FOREMAN?projectId=${projectId}`);
    } catch {
      // best-effort
    }
    setForm(EMPTY_FORM);
    setHasDraft(false);
  }

  // Which signature field is being drawn (holds the form field name), e.g.
  // "foremanSignatureImg" or "siteEngineerSignatureImg".
  const [signingKey, setSigningKey] = useState(null);
  function saveSignature(sig) {
    setForm((f) => ({ ...f, [signingKey]: sig }));
    setSigningKey(null);
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Weekly range: picking the start auto-fills the end to start + 6 days;
  // reportDate (used by the backend/list) tracks the week-ending date.
  function setWeekStart(v) {
    const end = v ? addDays(v, 6) : "";
    setForm((f) => ({ ...f, weekStarting: v, weekEnding: end, reportDate: end || f.reportDate }));
  }
  function setWeekEnd(v) {
    setForm((f) => ({ ...f, weekEnding: v, reportDate: v || f.reportDate }));
  }

  // When the Weekly report opens fresh, default to this week (today → +6).
  useEffect(() => {
    if (!weekly) return;
    setForm((f) => {
      if (f.weekStarting || f.weekEnding) return f;
      const start = new Date().toISOString().slice(0, 10);
      const end = addDays(start, 6);
      return { ...f, weekStarting: start, weekEnding: end, reportDate: end };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekly]);

  function updateRow(table, idx, field, value) {
    setForm((f) => ({ ...f, [table]: f[table].map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  }
  function addRow(table, blank) {
    setForm((f) => ({ ...f, [table]: [...f[table], { ...blank }] }));
  }
  function removeRow(table, idx) {
    setForm((f) => ({ ...f, [table]: f[table].filter((_, i) => i !== idx) }));
  }

  // Map the rich 12-section form onto the scalar fields the backend/analytics
  // still read, and send the whole thing as `formData`.
  function buildMappedPayload() {
    const headcount = (match) => {
      const row = form.personnel.find((p) => (p.category || "").toLowerCase().includes(match));
      return row ? Number(row.workers) || 0 : 0;
    };
    return {
      reportDate: form.reportDate,
      siteLocation: form.location,
      electricalSupervisors: headcount("supervisor"),
      electricians: headcount("electrician"),
      electricalAssistants: headcount("subcontractor"),
      generalHands: headcount("labor") || headcount("labour"),
      sheOfficersOnSite: 0,
      workCompleted: form.workCompleted,
      workInProgress: "",
      percentProgress: Number(form.percentProgress) || 0,
      equipmentUsed: form.equipment.filter((e) => e.tool).map((e) => `${e.tool}${e.qty ? ` ×${e.qty}` : ""}`).join("; "),
      materialsUsed: form.materials.filter((m) => m.material).map((m) => `${m.material}${m.qtyUsed ? ` used:${m.qtyUsed}` : ""}`).join("; "),
      materialsRequired: "",
      constraints: form.problemsDelaysConstraints,
      instructionsReceived: form.coordinationCommunication,
      nextDayPlan: form.nextDayPlan,
      formData: form,
    };
  }

  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || []);
    setStagedPhotos((current) => [
      ...current,
      ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    e.target.value = "";
  }

  function removeStagedPhoto(index) {
    setStagedPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  async function uploadPhoto(reportId, file) {
    const formData = new FormData();
    formData.append("photo", file);
    await api.upload(`/reports/${reportId}/attachments`, formData);
  }

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    api.get(`/reports/foreman/${editId}`).then((report) => {
      startEditing(report);
      setSearchParams({}, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startEditing(report) {
    setProjectId(report.projectId);
    const d = report.foremanDetail || {};
    if (d.formData && typeof d.formData === "object") {
      setForm({ ...EMPTY_FORM, ...d.formData, reportDate: report.reportDate.slice(0, 10) });
    } else {
      // Older report saved before the full form existed — map what we have.
      setForm({
        ...EMPTY_FORM,
        reportDate: report.reportDate.slice(0, 10),
        location: d.siteLocation || "",
        workCompleted: d.workCompleted || "",
        percentProgress: d.percentProgress ?? "",
        problemsDelaysConstraints: d.constraints || "",
        nextDayPlan: d.nextDayPlan || "",
      });
    }
    setEditingReportId(report.id);
    setError("");
    setSuccess("");
    setExistingAttachments([]);
    // The photos/documents originally submitted with this report are
    // still there (correcting the text doesn't touch attachments) — just
    // never shown here before, which made it look like they'd vanished.
    api.get(`/reports/${report.id}/attachments`).then(setExistingAttachments).catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingReportId(null);
    setForm(EMPTY_FORM);
    setExistingAttachments([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const mapped = buildMappedPayload();

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/foreman/${editingReportId}`, { ...mapped, periodType: weekly ? "WEEKLY" : "DAILY" });
      } else {
        const payload = { ...mapped, projectId, submissionId, periodType: weekly ? "WEEKLY" : "DAILY" };
        try {
          report = await api.post("/reports/foreman", payload);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await queueReport({
            label: `Foreman report — ${mapped.reportDate}`,
            endpoint: "/reports/foreman",
            payload,
            photos: stagedPhotos.map((p) => p.file),
          });
          stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setStagedPhotos([]);
          setSuccess("You're offline — report saved and will submit automatically once you're back online.");
          setForm(EMPTY_FORM);
          setSubmissionId(crypto.randomUUID());
          return;
        }
      }

      // Report data is already saved at this point — a photo failure below
      // doesn't lose the report, it just leaves that one photo unattached.
      let photoFailures = 0;
      for (const { file } of stagedPhotos) {
        try {
          await uploadPhoto(report.id, file);
        } catch {
          photoFailures++;
        }
      }

      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setStagedPhotos([]);
      setSuccess(
        photoFailures > 0
          ? `Report ${editingReportId ? "resubmitted" : "submitted"}, but ${photoFailures} photo(s) failed to upload — try adding them again from "Recent reports" below.`
          : `Report ${editingReportId ? "resubmitted" : "submitted"}.`
      );
      setForm(EMPTY_FORM);
      setEditingReportId(null);
      setExistingAttachments([]);
      setSubmissionId(crypto.randomUUID());
      if (hasDraft) {
        api.delete(`/drafts/FOREMAN?projectId=${projectId}`).catch(() => {});
        setHasDraft(false);
      }
    } catch (err) {
      setError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {signingKey && <SignaturePad onSave={saveSignature} onClose={() => setSigningKey(null)} />}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">{weekly ? "Weekly Foreman Report" : "Daily Foreman Report"}</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          {editingReportId && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm text-blue-800">
              <span>Correcting a returned report</span>
              <button type="button" onClick={cancelEditing} className="text-blue-600 underline">
                Cancel
              </button>
            </div>
          )}
          {hasDraft && !editingReportId && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-800">
              <span>Continuing from a saved draft</span>
              <button type="button" onClick={handleDiscardDraft} className="text-amber-700 underline">
                Discard draft
              </button>
            </div>
          )}
          {/* Project is taken from the active project selected on the dashboard —
              the selector only appears if none is set yet (nothing to go on). */}
          {!projectId && !editingReportId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {weekly ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Week starting</label>
                <input
                  type="date"
                  required
                  value={form.weekStarting}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Week ending</label>
                <input
                  type="date"
                  required
                  value={form.weekEnding}
                  min={form.weekStarting || undefined}
                  onChange={(e) => setWeekEnd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Report date</label>
              <input
                type="date"
                required
                value={form.reportDate}
                onChange={(e) => updateField("reportDate", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          )}

          {/* 1. Project information (Project + Date above) */}
          <Section n="1" title="Project Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Location">
                <input type="text" value={form.location} onChange={(e) => updateField("location", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Client / Main Contractor">
                <input type="text" value={form.clientMainContractor} onChange={(e) => updateField("clientMainContractor", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Temperature (°C)">
                <input type="number" value={form.temperature} onChange={(e) => updateField("temperature", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Weather Conditions">
                <RadioChips options={WEATHER_OPTIONS} value={form.weather} onChange={(v) => updateField("weather", v)} />
              </Field>
            </div>
          </Section>

          {/* 2. Personnel on site */}
          <Section n="2" title="Personnel on Site">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[520px]">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs text-slate-600">
                    <th className="border border-slate-200 px-2 py-1.5">Category</th>
                    <th className="border border-slate-200 px-2 py-1.5">Company</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-20">No. of Workers</th>
                    <th className="border border-slate-200 px-2 py-1.5">Tasks Performed</th>
                    <th className="border border-slate-200 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.personnel.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-slate-200 px-1"><input value={r.category} onChange={(e) => updateRow("personnel", i, "category", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.company} onChange={(e) => updateRow("personnel", i, "company", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input type="number" min="0" value={r.workers} onChange={(e) => updateRow("personnel", i, "workers", e.target.value)} className={`${cellCls} text-center`} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.tasks} onChange={(e) => updateRow("personnel", i, "tasks", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 text-center">{form.personnel.length > 1 && <button type="button" onClick={() => removeRow("personnel", i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => addRow("personnel", BLANK_PERSON)} className="text-xs text-blue-600 font-semibold mt-1.5">+ Add row</button>
          </Section>

          <Field label="Overall % progress">
            <input type="number" min="0" max="100" inputMode="numeric" value={form.percentProgress} onChange={(e) => updateField("percentProgress", e.target.value)} className={inputCls} />
          </Field>

          {/* 3. Work completed today */}
          <Section n="3" title="Work Completed Today">
            <textarea rows={3} required value={form.workCompleted} onChange={(e) => updateField("workCompleted", e.target.value)} className={inputCls} />
          </Section>

          {/* 4. Equipment & tools used */}
          <Section n="4" title="Equipment & Tools Used">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[520px]">
                <thead><tr className="bg-slate-100 text-left text-xs text-slate-600">
                  <th className="border border-slate-200 px-2 py-1.5">Equipment / Tool</th>
                  <th className="border border-slate-200 px-2 py-1.5 w-16">Qty</th>
                  <th className="border border-slate-200 px-2 py-1.5">Condition</th>
                  <th className="border border-slate-200 px-2 py-1.5">Remarks</th>
                  <th className="border border-slate-200 w-8"></th>
                </tr></thead>
                <tbody>
                  {form.equipment.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-slate-200 px-1"><input value={r.tool} onChange={(e) => updateRow("equipment", i, "tool", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input type="number" min="0" value={r.qty} onChange={(e) => updateRow("equipment", i, "qty", e.target.value)} className={`${cellCls} text-center`} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.condition} onChange={(e) => updateRow("equipment", i, "condition", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.remarks} onChange={(e) => updateRow("equipment", i, "remarks", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 text-center">{form.equipment.length > 1 && <button type="button" onClick={() => removeRow("equipment", i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => addRow("equipment", BLANK_EQUIP)} className="text-xs text-blue-600 font-semibold mt-1.5">+ Add row</button>
          </Section>

          {/* 5. Material delivered / used */}
          <Section n="5" title="Material Delivered / Used">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[560px]">
                <thead><tr className="bg-slate-100 text-left text-xs text-slate-600">
                  <th className="border border-slate-200 px-2 py-1.5">Material</th>
                  <th className="border border-slate-200 px-2 py-1.5 w-20">Qty Received</th>
                  <th className="border border-slate-200 px-2 py-1.5 w-20">Qty Used</th>
                  <th className="border border-slate-200 px-2 py-1.5">Supplier</th>
                  <th className="border border-slate-200 px-2 py-1.5">Remarks</th>
                  <th className="border border-slate-200 w-8"></th>
                </tr></thead>
                <tbody>
                  {form.materials.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-slate-200 px-1"><input value={r.material} onChange={(e) => updateRow("materials", i, "material", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input type="number" min="0" value={r.qtyReceived} onChange={(e) => updateRow("materials", i, "qtyReceived", e.target.value)} className={`${cellCls} text-center`} /></td>
                      <td className="border border-slate-200 px-1"><input type="number" min="0" value={r.qtyUsed} onChange={(e) => updateRow("materials", i, "qtyUsed", e.target.value)} className={`${cellCls} text-center`} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.supplier} onChange={(e) => updateRow("materials", i, "supplier", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 px-1"><input value={r.remarks} onChange={(e) => updateRow("materials", i, "remarks", e.target.value)} className={cellCls} /></td>
                      <td className="border border-slate-200 text-center">{form.materials.length > 1 && <button type="button" onClick={() => removeRow("materials", i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => addRow("materials", BLANK_MATERIAL)} className="text-xs text-blue-600 font-semibold mt-1.5">+ Add row</button>
          </Section>

          {/* 6. Inspections & testing */}
          <Section n="6" title="Inspections & Testing">
            <textarea rows={2} value={form.inspectionsTesting} onChange={(e) => updateField("inspectionsTesting", e.target.value)} className={inputCls} />
          </Section>

          {/* 7. Safety report */}
          <Section n="7" title="Safety Report">
            <div className="space-y-3">
              <Field label="Toolbox Talk Conducted">
                <RadioChips options={["Yes", "No"]} value={form.toolboxTalk} onChange={(v) => updateField("toolboxTalk", v)} />
              </Field>
              <Field label="PPE Compliance">
                <RadioChips options={PPE_OPTIONS} value={form.ppeCompliance} onChange={(v) => updateField("ppeCompliance", v)} />
              </Field>
              <LabeledArea label="Hazards Identified" value={form.hazardsIdentified} onChange={(v) => updateField("hazardsIdentified", v)} />
              <LabeledArea label="Corrective Actions Taken" value={form.correctiveActions} onChange={(v) => updateField("correctiveActions", v)} />
              <LabeledArea label="Incidents / Near Misses" value={form.incidentsNearMisses} onChange={(v) => updateField("incidentsNearMisses", v)} />
            </div>
          </Section>

          {/* 8. Coordination & communication */}
          <Section n="8" title="Coordination & Communication">
            <textarea rows={2} value={form.coordinationCommunication} onChange={(e) => updateField("coordinationCommunication", e.target.value)} className={inputCls} />
          </Section>

          {/* 9. Problems / delays / constraints */}
          <Section n="9" title="Problems / Delays / Constraints">
            <textarea rows={2} value={form.problemsDelaysConstraints} onChange={(e) => updateField("problemsDelaysConstraints", e.target.value)} className={inputCls} />
          </Section>

          {/* 10. Plan for next day/week */}
          <Section n="10" title={weekly ? "Plan for Next Week" : "Plan for Next Day"}>
            <textarea rows={2} value={form.nextDayPlan} onChange={(e) => updateField("nextDayPlan", e.target.value)} className={inputCls} />
          </Section>

          {/* 11. Foreman's comments */}
          <Section n="11" title="Foreman's Comments">
            <textarea rows={2} value={form.foremanComments} onChange={(e) => updateField("foremanComments", e.target.value)} className={inputCls} />
          </Section>

          {/* 12. Signatures */}
          <Section n="12" title="Signatures">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Electrical Site Foreman</label>
                <input type="text" placeholder="Name" value={form.foremanSignature} onChange={(e) => updateField("foremanSignature", e.target.value)} className={inputCls} />
                <SignatureBox value={form.foremanSignatureImg} onSign={() => setSigningKey("foremanSignatureImg")} onClear={() => updateField("foremanSignatureImg", "")} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">Site Engineer / Manager</label>
                <input type="text" placeholder="Name" value={form.siteEngineerSignature} onChange={(e) => updateField("siteEngineerSignature", e.target.value)} className={inputCls} />
                <SignatureBox value={form.siteEngineerSignatureImg} onSign={() => setSigningKey("siteEngineerSignatureImg")} onClear={() => updateField("siteEngineerSignatureImg", "")} />
              </div>
              <Field label="Date">
                <input type="date" value={form.signatureDate} onChange={(e) => updateField("signatureDate", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Section>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Site photographs &amp; supporting documents</label>
            {existingAttachments.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-slate-500 mb-1">Already attached to this report:</p>
                <div className="flex flex-wrap gap-2">
                  {existingAttachments.map((a) => (
                    <AttachmentThumb key={a.id} attachment={a} />
                  ))}
                </div>
              </div>
            )}
            {stagedPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {stagedPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square bg-slate-100 rounded-md overflow-hidden">
                    {p.file.type.startsWith("image/") ? (
                      <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs text-slate-600 break-all">
                        {p.file.name}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStagedPhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="block w-full text-center border border-dashed border-slate-300 rounded-md py-3 text-sm text-slate-600">
              + Add document or photo
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex gap-2">
            {!editingReportId && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || !projectId}
                className="flex-1 bg-white border border-slate-300 text-slate-700 rounded-md py-3 text-base font-medium disabled:opacity-60"
              >
                {savingDraft ? "Saving..." : "Save as draft"}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || !projectId}
              className="flex-1 bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
            >
              {submitting ? "Submitting..." : editingReportId ? "Resubmit report" : "Submit report"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <div>
                  <span className="font-medium">{new Date(r.reportDate).toLocaleDateString()}</span>
                  {" · "}
                  {r.foremanDetail?.percentProgress}% progress · {r.status}
                  {r.submittedBy?.name ? ` · ${r.submittedBy.name}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/actions?sourceReportId=${r.id}&projectId=${projectId}&reportType=FOREMAN`)}
                  className="text-xs text-blue-600 underline mt-1"
                >
                  Raise action from this report
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

function SignatureBox({ value, onSign, onClear }) {
  if (value) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSign} className="flex-1 h-16 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
          <img src={value} alt="signature" className="max-h-14 object-contain" />
        </button>
        <button type="button" onClick={onClear} className="text-xs text-red-400 hover:text-red-600">Clear</button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onSign} className="w-full h-16 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
      ✍️ Tap to sign
    </button>
  );
}

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function start(e) { e.preventDefault(); drawing.current = true; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { e.preventDefault(); if (!drawing.current) return; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end(e) { e.preventDefault(); drawing.current = false; }
  function clear() { const c = canvasRef.current; const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <p className="text-sm font-bold text-slate-800">Sign here</p>
        <canvas ref={canvasRef} width={340} height={140}
          className="w-full border-2 border-slate-300 rounded-xl touch-none cursor-crosshair" style={{ background: "#fff" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="flex gap-2">
          <button onClick={clear} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Clear</button>
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(canvasRef.current.toDataURL("image/png"))} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-sm font-bold text-slate-800 mb-2">{n}. {title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function LabeledArea({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
    </div>
  );
}

function RadioChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
            value === opt ? "bg-brand-900 text-white border-brand-900" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function TextArea({ label, value, onChange, required = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <textarea
        rows={2}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
      />
    </div>
  );
}
