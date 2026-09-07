import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";
import AttachmentThumb from "../components/AttachmentThumb";

const VARIATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const EMPTY_LINE = {
  boqItemNumber: "",
  description: "",
  contractQuantity: "",
  quantityToday: "",
  cumulativeQuantity: "",
  measurements: "",
  valuationAmount: "",
  variationReference: "",
  variationStatus: "",
  comments: "",
};

export default function QsReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [comments, setComments] = useState("");
  const [commercialIssues, setCommercialIssues] = useState("");
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
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
    api.get(`/reports/qs?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success]);

  useEffect(() => {
    if (!projectId || editingReportId) return;
    api
      .get(`/drafts/QS?projectId=${projectId}`)
      .then((draft) => {
        if (draft) {
          setReportDate(draft.reportDate.slice(0, 10));
          setComments(draft.data.comments ?? "");
          setCommercialIssues(draft.data.commercialIssues ?? "");
          setLines(draft.data.lines?.length ? draft.data.lines : [{ ...EMPTY_LINE }]);
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
      await api.put("/drafts/QS", { projectId, reportDate, data: { comments, commercialIssues, lines } });
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
      await api.delete(`/drafts/QS?projectId=${projectId}`);
    } catch {
      // best-effort
    }
    setComments("");
    setCommercialIssues("");
    setLines([{ ...EMPTY_LINE }]);
    setHasDraft(false);
  }

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    api.get(`/reports/qs/${editId}`).then((report) => {
      startEditing(report);
      setSearchParams({}, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startEditing(report) {
    setProjectId(report.projectId);
    setReportDate(report.reportDate.slice(0, 10));
    setComments(report.qsDetail.comments || "");
    setCommercialIssues(report.qsDetail.commercialIssues || "");
    setLines(
      report.qsDetail.lines.map((l) => ({
        boqItemNumber: l.boqItemNumber,
        description: l.description,
        contractQuantity: String(l.contractQuantity),
        quantityToday: String(l.quantityToday),
        cumulativeQuantity: String(l.cumulativeQuantity),
        measurements: l.measurements || "",
        valuationAmount: l.valuationAmount != null ? String(l.valuationAmount) : "",
        variationReference: l.variationReference || "",
        variationStatus: l.variationStatus || "",
        comments: l.comments || "",
      }))
    );
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
    setComments("");
    setCommercialIssues("");
    setLines([{ ...EMPTY_LINE }]);
    setReportDate(new Date().toISOString().slice(0, 10));
    setExistingAttachments([]);
  }

  function updateLine(index, field, value) {
    setLines((ls) =>
      ls.map((l, i) => {
        if (i !== index) return l;
        // Clearing the reference hides the variation-status dropdown
        // below, which silently left its already-picked value attached
        // and submitted — clear it together so there's no hidden state.
        if (field === "variationReference" && !value) {
          return { ...l, variationReference: value, variationStatus: "" };
        }
        return { ...l, [field]: value };
      })
    );
  }

  function addLine() {
    setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  }

  function removeLine(index) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== index) : ls));
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const lineData = lines.map((l) => ({
        boqItemNumber: l.boqItemNumber,
        description: l.description,
        contractQuantity: Number(l.contractQuantity) || 0,
        quantityToday: Number(l.quantityToday) || 0,
        cumulativeQuantity: Number(l.cumulativeQuantity) || 0,
        measurements: l.measurements || undefined,
        valuationAmount: l.valuationAmount ? Number(l.valuationAmount) : undefined,
        variationReference: l.variationReference || undefined,
        variationStatus: l.variationStatus || undefined,
        comments: l.comments || undefined,
      }));

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/qs/${editingReportId}`, {
          reportDate,
          comments,
          commercialIssues,
          lines: lineData,
        });
      } else {
        const payload = {
          projectId,
          reportDate,
          comments,
          commercialIssues,
          submissionId,
          lines: lineData,
        };
        try {
          report = await api.post("/reports/qs", payload);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await queueReport({
            label: `QS report — ${reportDate}`,
            endpoint: "/reports/qs",
            payload,
            photos: stagedPhotos.map((p) => p.file),
          });
          stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setStagedPhotos([]);
          setSuccess("You're offline — report saved and will submit automatically once you're back online.");
          setComments("");
          setCommercialIssues("");
          setLines([{ ...EMPTY_LINE }]);
          setSubmissionId(crypto.randomUUID());
          return;
        }
      }

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
          ? `QS report ${editingReportId ? "resubmitted" : "submitted"}, but ${photoFailures} photo(s) failed to upload.`
          : `QS report ${editingReportId ? "resubmitted" : "submitted"}.`
      );
      setComments("");
      setCommercialIssues("");
      setLines([{ ...EMPTY_LINE }]);
      setEditingReportId(null);
      setExistingAttachments([]);
      setSubmissionId(crypto.randomUUID());
      if (hasDraft) {
        api.delete(`/drafts/QS?projectId=${projectId}`).catch(() => {});
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
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">QS Report</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
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
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Header comments</label>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Commercial issues</label>
              <textarea
                rows={2}
                placeholder="Disputes, pricing queries, cost-impacting instructions..."
                value={commercialIssues}
                onChange={(e) => setCommercialIssues(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>

          {lines.map((line, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">BOQ item {i + 1}</h3>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-sm text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">BOQ item no. *</label>
                  <input
                    type="text"
                    required
                    value={line.boqItemNumber}
                    onChange={(e) => updateLine(i, "boqItemNumber", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Contract qty *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={line.contractQuantity}
                    onChange={(e) => updateLine(i, "contractQuantity", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Qty completed today *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={line.quantityToday}
                    onChange={(e) => updateLine(i, "quantityToday", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Cumulative qty *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={line.cumulativeQuantity}
                    onChange={(e) => updateLine(i, "cumulativeQuantity", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Measurements / supporting info</label>
                <input
                  type="text"
                  value={line.measurements}
                  onChange={(e) => updateLine(i, "measurements", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Valuation / claim amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.valuationAmount}
                    onChange={(e) => updateLine(i, "valuationAmount", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Variation reference</label>
                  <input
                    type="text"
                    value={line.variationReference}
                    onChange={(e) => updateLine(i, "variationReference", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
              </div>

              {line.variationReference && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Variation status</label>
                  <select
                    value={line.variationStatus}
                    onChange={(e) => updateLine(i, "variationStatus", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  >
                    <option value="">— Not set —</option>
                    {VARIATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">Line comments</label>
                <input
                  type="text"
                  value={line.comments}
                  onChange={(e) => updateLine(i, "comments", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="w-full bg-white border border-dashed border-slate-300 text-slate-600 rounded-md py-3 text-base font-medium"
          >
            + Add another BOQ item
          </button>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Supporting documents &amp; photographs</label>
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
              {submitting ? "Submitting..." : editingReportId ? "Resubmit QS report" : "Submit QS report"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent QS reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <div className="font-medium">
                  {new Date(r.reportDate).toLocaleDateString()} · {r.status}
                  {r.submittedBy?.name ? ` · ${r.submittedBy.name}` : ""}
                </div>
                {r.qsDetail?.lines?.map((l) => (
                  <div key={l.id} className="text-slate-600 pl-2">
                    {l.boqItemNumber} — {l.description}: {l.percentCompletion}% (balance {l.balanceQuantity})
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => navigate(`/actions?sourceReportId=${r.id}&projectId=${projectId}&reportType=QS`)}
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
