import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";
import AttachmentThumb from "../components/AttachmentThumb";

const EMPTY_FORM = {
  reportDate: new Date().toISOString().slice(0, 10),
  siteLocation: "",
  electricalSupervisors: 0,
  electricians: 0,
  electricalAssistants: 0,
  generalHands: 0,
  sheOfficersOnSite: 0,
  workCompleted: "",
  workInProgress: "",
  percentProgress: 0,
  equipmentUsed: "",
  materialsUsed: "",
  materialsRequired: "",
  constraints: "",
  instructionsReceived: "",
  nextDayPlan: "",
};

const NUMBER_FIELDS = [
  "electricalSupervisors",
  "electricians",
  "electricalAssistants",
  "generalHands",
  "sheOfficersOnSite",
  "percentProgress",
];

// Fixed manpower categories — matches the paper form's section 4 table.
// The Foreman only ever changes the Quantity; Total Workforce is
// computed live here and again authoritatively on the server.
const MANPOWER_FIELDS = [
  { key: "electricalSupervisors", label: "Electrical Supervisors" },
  { key: "electricians", label: "Electricians" },
  { key: "electricalAssistants", label: "Electrical Assistants" },
  { key: "generalHands", label: "General Hands" },
  { key: "sheOfficersOnSite", label: "SHE officer" },
];

export default function ForemanReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/reports/foreman?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success]);

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

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
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
    const d = report.foremanDetail;
    setForm({
      reportDate: report.reportDate.slice(0, 10),
      siteLocation: d.siteLocation || "",
      electricalSupervisors: d.electricalSupervisors,
      electricians: d.electricians,
      electricalAssistants: d.electricalAssistants,
      generalHands: d.generalHands,
      sheOfficersOnSite: d.sheOfficersOnSite,
      workCompleted: d.workCompleted || "",
      workInProgress: d.workInProgress || "",
      percentProgress: d.percentProgress,
      equipmentUsed: d.equipmentUsed || "",
      materialsUsed: d.materialsUsed || "",
      materialsRequired: d.materialsRequired || "",
      constraints: d.constraints || "",
      instructionsReceived: d.instructionsReceived || "",
      nextDayPlan: d.nextDayPlan || "",
    });
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
      const numericForm = { ...form };
      for (const field of NUMBER_FIELDS) {
        numericForm[field] = Number(numericForm[field]) || 0;
      }

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/foreman/${editingReportId}`, numericForm);
      } else {
        const payload = { ...numericForm, projectId, submissionId };
        try {
          report = await api.post("/reports/foreman", payload);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await queueReport({
            label: `Foreman report — ${numericForm.reportDate}`,
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
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Daily Foreman Report</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!!editingReportId}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site / location</label>
            <input
              type="text"
              value={form.siteLocation}
              onChange={(e) => updateField("siteLocation", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">% progress</label>
            <input
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              value={form.percentProgress}
              onChange={(e) => updateField("percentProgress", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Manpower on site</label>
            <div className="border border-slate-300 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left px-3 py-2 font-medium text-slate-700">Category</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-700 w-28">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {MANPOWER_FIELDS.map((f) => (
                    <tr key={f.key} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-700">{f.label}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={form[f.key]}
                          onChange={(e) => updateField(f.key, e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-base"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-3 py-2">Total Workforce</td>
                    <td className="px-3 py-2">
                      {MANPOWER_FIELDS.reduce((sum, f) => sum + (Number(form[f.key]) || 0), 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <TextArea
            label="Work completed today"
            value={form.workCompleted}
            onChange={(v) => updateField("workCompleted", v)}
            required
          />
          <TextArea label="Work in progress" value={form.workInProgress} onChange={(v) => updateField("workInProgress", v)} />
          <TextArea label="Equipment / plant used" value={form.equipmentUsed} onChange={(v) => updateField("equipmentUsed", v)} />
          <TextArea label="Materials used" value={form.materialsUsed} onChange={(v) => updateField("materialsUsed", v)} />
          <TextArea label="Materials required" value={form.materialsRequired} onChange={(v) => updateField("materialsRequired", v)} />
          <TextArea label="Problems, delays and constraints" value={form.constraints} onChange={(v) => updateField("constraints", v)} />
          <TextArea label="Instructions received" value={form.instructionsReceived} onChange={(v) => updateField("instructionsReceived", v)} />
          <TextArea label="Planned activities for tomorrow" value={form.nextDayPlan} onChange={(v) => updateField("nextDayPlan", v)} />

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
