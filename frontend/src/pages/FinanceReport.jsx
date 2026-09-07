import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";
import AttachmentThumb from "../components/AttachmentThumb";

const EMPTY_LINE = {
  amount: "",
  description: "",
  paymentReference: "",
};

const TYPES = [
  { value: "FUNDS_RECEIVED", label: "Funds received" },
  { value: "EXPENDITURE", label: "Expenditure" },
  { value: "COMMITMENT", label: "Outstanding commitment" },
];

const CATEGORIES_BY_TYPE = {
  FUNDS_RECEIVED: [
    { value: "ADVANCE_PAYMENT", label: "Advance payment" },
    { value: "OTHER_FUNDS", label: "Other funds" },
  ],
  EXPENDITURE: [
    { value: "MATERIALS", label: "Materials" },
    { value: "LABOUR", label: "Labour" },
    { value: "PLANT_EQUIPMENT", label: "Plant / equipment" },
    { value: "TRANSPORT_LOGISTICS", label: "Transport / logistics" },
    { value: "SUBCONTRACTOR", label: "Subcontractor payments" },
    { value: "SUPPLIER", label: "Supplier payments" },
    { value: "PETTY_CASH", label: "Petty cash" },
    { value: "OTHER", label: "Other expense" },
  ],
  COMMITMENT: [
    { value: "MATERIALS", label: "Materials" },
    { value: "LABOUR", label: "Labour" },
    { value: "PLANT_EQUIPMENT", label: "Plant / equipment" },
    { value: "TRANSPORT_LOGISTICS", label: "Transport / logistics" },
    { value: "SUBCONTRACTOR", label: "Subcontractor payments" },
    { value: "SUPPLIER", label: "Supplier payments" },
    { value: "OTHER", label: "Other" },
  ],
};

export default function FinanceReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [comments, setComments] = useState("");
  const [lines, setLines] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  // Generated once per form session rather than fresh inside handleSubmit
  // — a submissionId that changes on every call defeats its own purpose
  // (deduping a retried/double-fired submit) since two rapid submits of
  // the "same" report would carry two different ids.
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [editingReportId, setEditingReportId] = useState(null);
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
    api.get(`/reports/finance?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success]);

  useEffect(() => {
    if (!projectId || editingReportId) return;
    api
      .get(`/drafts/FINANCE?projectId=${projectId}`)
      .then((draft) => {
        if (draft) {
          setReportDate(draft.reportDate.slice(0, 10));
          setComments(draft.data.comments ?? "");
          setLines(draft.data.lines ?? []);
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
      await api.put("/drafts/FINANCE", { projectId, reportDate, data: { comments, lines } });
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
      await api.delete(`/drafts/FINANCE?projectId=${projectId}`);
    } catch {
      // best-effort
    }
    setComments("");
    setLines([]);
    setHasDraft(false);
  }

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    api.get(`/reports/finance/${editId}`).then((report) => {
      startEditing(report);
      setSearchParams({}, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startEditing(report) {
    setProjectId(report.projectId);
    setReportDate(report.reportDate.slice(0, 10));
    setComments(report.financeDetail.comments || "");
    setLines(
      report.financeDetail.lines.map((l) => ({
        type: l.type,
        category: l.category,
        amount: String(l.amount),
        description: l.description || "",
        paymentReference: l.paymentReference || "",
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
    setLines([]);
    setReportDate(new Date().toISOString().slice(0, 10));
    setExistingAttachments([]);
  }

  function updateLine(target, field, value) {
    setLines((ls) => ls.map((l) => (l === target ? { ...l, [field]: value } : l)));
  }

  // Type is fixed at creation, by which section's "+ Add" button was
  // clicked — never changed afterward.
  function addLine(type) {
    setLines((ls) => [...ls, { ...EMPTY_LINE, type, category: CATEGORIES_BY_TYPE[type][0].value }]);
  }

  function removeLine(target) {
    setLines((ls) => ls.filter((l) => l !== target));
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
      // Sections left untouched contribute nothing — only rows with a
      // real amount entered count as real transaction lines.
      const lineData = lines
        .filter((l) => l.amount !== "" && Number(l.amount) > 0)
        .map((l) => ({
          type: l.type,
          category: l.category,
          amount: Number(l.amount) || 0,
          description: l.description || undefined,
          paymentReference: l.paymentReference || undefined,
        }));

      if (lineData.length === 0) {
        setError("Add at least one amount under Funds Received, Expenditure, or Outstanding Commitment.");
        setSubmitting(false);
        return;
      }

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/finance/${editingReportId}`, { reportDate, comments, lines: lineData });
      } else {
        const payload = { projectId, reportDate, comments, submissionId, lines: lineData };
        try {
          report = await api.post("/reports/finance", payload);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await queueReport({
            label: `Finance report — ${reportDate}`,
            endpoint: "/reports/finance",
            payload,
            photos: stagedPhotos.map((p) => p.file),
          });
          stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setStagedPhotos([]);
          setSuccess("You're offline — report saved and will submit automatically once you're back online.");
          setComments("");
          setLines([]);
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
          ? `Finance report ${editingReportId ? "resubmitted" : "submitted"}, but ${photoFailures} supporting document(s) failed to upload.`
          : `Finance report ${editingReportId ? "resubmitted" : "submitted"}.`
      );
      setComments("");
      setLines([]);
      setEditingReportId(null);
      setExistingAttachments([]);
      setSubmissionId(crypto.randomUUID());
      if (hasDraft) {
        api.delete(`/drafts/FINANCE?projectId=${projectId}`).catch(() => {});
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
          <p className="text-sm text-slate-500">Finance Report</p>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>

          {TYPES.map((t) => (
            <TransactionSection
              key={t.value}
              title={t.label}
              type={t.value}
              categories={CATEGORIES_BY_TYPE[t.value]}
              lines={lines}
              updateLine={updateLine}
              addLine={addLine}
              removeLine={removeLine}
            />
          ))}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Supporting documents (invoices, receipts)</label>
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
              {submitting ? "Submitting..." : editingReportId ? "Resubmit finance report" : "Submit finance report"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent finance reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <div className="font-medium">
                  {new Date(r.reportDate).toLocaleDateString()} · {r.status}
                  {r.submittedBy?.name ? ` · ${r.submittedBy.name}` : ""}
                </div>
                {r.financeDetail?.lines?.map((l) => (
                  <div key={l.id} className="text-slate-600 pl-2">
                    {l.type.replace("_", " ")} · {l.category.replace("_", " ")}: {l.amount}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => navigate(`/actions?sourceReportId=${r.id}&projectId=${projectId}&reportType=FINANCE`)}
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

// One section per transaction type — the Finance user fills in whichever
// ones actually happened today, instead of picking a type per line. This
// is what stops "Funds Received" silently staying at zero just because
// nobody thought to add a separate line for it.
function TransactionSection({ title, type, categories, lines, updateLine, addLine, removeLine }) {
  const sectionLines = lines.filter((l) => l.type === type);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-medium text-slate-900">{title}</h3>
      {sectionLines.length === 0 && (
        <p className="text-sm text-slate-400">Nothing to record — leave this blank if none today.</p>
      )}

      {sectionLines.map((line, i) => (
        <div key={i} className="border border-slate-200 rounded-md p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Item {i + 1}</span>
            <button type="button" onClick={() => removeLine(line)} className="text-xs text-red-600">
              Remove
            </button>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Category *</label>
            <select
              value={line.category}
              onChange={(e) => updateLine(line, "category", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Amount *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={line.amount}
              onChange={(e) => updateLine(line, "amount", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Payment reference</label>
            <input
              type="text"
              value={line.paymentReference}
              onChange={(e) => updateLine(line, "paymentReference", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Description</label>
            <input
              type="text"
              value={line.description}
              onChange={(e) => updateLine(line, "description", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => addLine(type)}
        className="w-full bg-white border border-dashed border-slate-300 text-slate-600 rounded-md py-2.5 text-sm font-medium"
      >
        + Add {title.toLowerCase()}
      </button>
    </div>
  );
}
