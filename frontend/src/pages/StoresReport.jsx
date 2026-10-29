import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { queueReport, isNetworkFailure } from "../lib/offlineQueue";
import AttachmentThumb from "../components/AttachmentThumb";

const EMPTY_LINE = {
  itemName: "",
  quantity: "",
  unit: "",
  unitCost: "",
  supplier: "",
  deliveryReference: "",
  notes: "",
  bomItemId: "",
};

const DIRECTIONS = [
  { value: "RECEIVED", label: "Received" },
  { value: "ISSUED", label: "Issued to site" },
  { value: "RETURNED", label: "Returned" },
  { value: "DAMAGED_LOST", label: "Damaged / lost" },
];

const URGENCIES = ["LOW", "MEDIUM", "HIGH"];

const EMPTY_REQUISITION = { itemName: "", quantityRequested: "", unit: "", urgency: "MEDIUM", notes: "" };

export default function StoresReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [shortagesAndRequirements, setShortagesAndRequirements] = useState("");
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
  const [requisitions, setRequisitions] = useState([]);
  const [newRequisition, setNewRequisition] = useState(EMPTY_REQUISITION);
  const [requisitionError, setRequisitionError] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [bomItems, setBomItems] = useState([]);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/reports/stores?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
    api.get(`/procurement?projectId=${projectId}`).then(setBomItems).catch(() => setBomItems([]));
    loadRequisitions(projectId);
  }, [projectId, success]);

  useEffect(() => {
    if (!projectId || editingReportId) return;
    const presetDir = searchParams.get("direction");
    api
      .get(`/drafts/STORES?projectId=${projectId}`)
      .then((draft) => {
        if (draft) {
          setReportDate(draft.reportDate.slice(0, 10));
          setShortagesAndRequirements(draft.data.shortagesAndRequirements ?? "");
          setComments(draft.data.comments ?? "");
          setLines(draft.data.lines ?? []);
          setHasDraft(true);
        } else {
          setHasDraft(false);
          if (presetDir) setLines([{ ...EMPTY_LINE, direction: presetDir }]);
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
      await api.put("/drafts/STORES", {
        projectId,
        reportDate,
        data: { shortagesAndRequirements, comments, lines },
      });
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
      await api.delete(`/drafts/STORES?projectId=${projectId}`);
    } catch {
      // best-effort
    }
    setShortagesAndRequirements("");
    setComments("");
    setLines([]);
    setHasDraft(false);
  }

  function loadRequisitions(id) {
    api
      .get(`/projects/${id}/requisitions`)
      .then(setRequisitions)
      .catch(() => setRequisitions([]));
  }

  async function handleCreateRequisition(e) {
    e.preventDefault();
    setRequisitionError("");
    try {
      await api.post(`/projects/${projectId}/requisitions`, {
        itemName: newRequisition.itemName,
        quantityRequested: Number(newRequisition.quantityRequested) || 0,
        unit: newRequisition.unit || undefined,
        urgency: newRequisition.urgency,
        notes: newRequisition.notes || undefined,
      });
      setNewRequisition(EMPTY_REQUISITION);
      loadRequisitions(projectId);
    } catch (err) {
      setRequisitionError(err.message || "Failed to raise requisition");
    }
  }

  async function handleResolveRequisition(id, status) {
    setRequisitionError("");
    try {
      await api.patch(`/requisitions/${id}/status`, { status });
      loadRequisitions(projectId);
    } catch (err) {
      setRequisitionError(err.message || "Failed to update requisition");
    }
  }

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    api.get(`/reports/stores/${editId}`).then((report) => {
      startEditing(report);
      setSearchParams({}, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startEditing(report) {
    setProjectId(report.projectId);
    setReportDate(report.reportDate.slice(0, 10));
    setShortagesAndRequirements(report.storesDetail.shortagesAndRequirements || "");
    setComments(report.storesDetail.comments || "");
    setLines(
      report.storesDetail.lines.map((l) => ({
        itemName: l.itemName,
        direction: l.direction,
        quantity: String(l.quantity),
        unit: l.unit || "",
        unitCost: l.unitCost != null ? String(l.unitCost) : "",
        supplier: l.supplier || "",
        deliveryReference: l.deliveryReference || "",
        notes: l.notes || "",
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
    setShortagesAndRequirements("");
    setComments("");
    setLines([]);
    setReportDate(new Date().toISOString().slice(0, 10));
    setExistingAttachments([]);
  }

  function updateLine(target, field, value) {
    setLines((ls) => ls.map((l) => (l === target ? { ...l, [field]: value } : l)));
  }

  // Direction is fixed at creation, by which section's "+ Add item"
  // button was clicked — never changed afterward, so there's no
  // movement-type control to fill in per line any more.
  function addLine(direction) {
    setLines((ls) => [...ls, { ...EMPTY_LINE, direction }]);
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
      // Sections left untouched contribute nothing — only rows the
      // Storesman actually filled in a name for count as real lines.
      const lineData = lines
        .filter((l) => l.itemName.trim() !== "")
        .map((l) => ({
          itemName: l.itemName,
          direction: l.direction,
          quantity: Number(l.quantity) || 0,
          unit: l.unit || undefined,
          unitCost: l.unitCost ? Number(l.unitCost) : undefined,
          supplier: l.supplier || undefined,
          deliveryReference: l.deliveryReference || undefined,
          notes: l.notes || undefined,
          bomItemId: l.bomItemId || undefined,
        }));

      if (lineData.length === 0) {
        setError("Add at least one item under Received, Issued, Returned, or Damaged/lost.");
        setSubmitting(false);
        return;
      }

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/stores/${editingReportId}`, {
          reportDate,
          shortagesAndRequirements,
          comments,
          lines: lineData,
        });
      } else {
        const payload = {
          projectId,
          reportDate,
          shortagesAndRequirements,
          comments,
          submissionId,
          lines: lineData,
        };
        try {
          report = await api.post("/reports/stores", payload);
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          await queueReport({
            label: `Stores report — ${reportDate}`,
            endpoint: "/reports/stores",
            payload,
            photos: stagedPhotos.map((p) => p.file),
          });
          stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setStagedPhotos([]);
          setSuccess("You're offline — report saved and will submit automatically once you're back online.");
          setShortagesAndRequirements("");
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
          ? `Stores report ${editingReportId ? "resubmitted" : "submitted"}, but ${photoFailures} photo(s) failed to upload.`
          : `Stores report ${editingReportId ? "resubmitted" : "submitted"}.`
      );
      setShortagesAndRequirements("");
      setComments("");
      setLines([]);
      setEditingReportId(null);
      setExistingAttachments([]);
      setSubmissionId(crypto.randomUUID());
      if (hasDraft) {
        api.delete(`/drafts/STORES?projectId=${projectId}`).catch(() => {});
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
          <p className="text-sm text-slate-500">Stores Report</p>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Shortages / urgent requirements</label>
              <textarea
                rows={2}
                value={shortagesAndRequirements}
                onChange={(e) => setShortagesAndRequirements(e.target.value)}
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

          {DIRECTIONS.map((d) => (
            <MovementSection
              key={d.value}
              title={d.label}
              direction={d.value}
              lines={lines}
              updateLine={updateLine}
              addLine={addLine}
              removeLine={removeLine}
              bomItems={bomItems}
            />
          ))}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Delivery notes, invoices, photos, etc.</label>
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
              {submitting ? "Submitting..." : editingReportId ? "Resubmit stores report" : "Submit stores report"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-medium text-slate-900">Material requisitions</h2>
          {requisitionError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{requisitionError}</p>
          )}
          {requisitions.length === 0 && <p className="text-sm text-slate-500">No requisitions raised yet.</p>}
          <ul className="space-y-2">
            {requisitions.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {r.itemName} — {r.quantityRequested} {r.unit || ""}
                  </span>
                  <span
                    className={`text-xs rounded px-2 py-0.5 ${
                      r.status === "PENDING"
                        ? "bg-amber-100 text-amber-800"
                        : r.status === "APPROVED"
                        ? "bg-blue-100 text-blue-800"
                        : r.status === "FULFILLED"
                        ? "bg-green-100 text-green-800"
                        : r.status === "REJECTED"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-slate-500 text-xs">
                  {r.urgency} urgency · requested by {r.requestedBy?.name}
                  {r.refNumber && <span className="ml-1 font-mono font-semibold text-blue-600"> · {r.refNumber}</span>}
                </div>
                {(r.status === "PENDING" || r.status === "APPROVED") && (
                  <div className="flex gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveRequisition(r.id, "FULFILLED")}
                      className="text-xs text-green-700 underline"
                    >
                      Mark fulfilled
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveRequisition(r.id, "CANCELLED")}
                      className="text-xs text-red-600 underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {r.status === "REJECTED" && r.rejectionReason && (
                  <div className="mt-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                    Rejected: {r.rejectionReason}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreateRequisition} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Item name"
                required
                value={newRequisition.itemName}
                onChange={(e) => setNewRequisition((r) => ({ ...r, itemName: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Quantity"
                required
                value={newRequisition.quantityRequested}
                onChange={(e) => setNewRequisition((r) => ({ ...r, quantityRequested: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Unit (optional)"
                value={newRequisition.unit}
                onChange={(e) => setNewRequisition((r) => ({ ...r, unit: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
              <select
                value={newRequisition.urgency}
                onChange={(e) => setNewRequisition((r) => ({ ...r, urgency: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {u.charAt(0) + u.slice(1).toLowerCase()} urgency
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newRequisition.notes}
              onChange={(e) => setNewRequisition((r) => ({ ...r, notes: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
            <button type="submit" className="w-full bg-brand-900 text-white rounded-md py-2 text-sm font-medium">
              Raise requisition
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Recent stores reports for this project</h2>
          {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2">
                <div className="font-medium">
                  {new Date(r.reportDate).toLocaleDateString()} · {r.status}
                  {r.submittedBy?.name ? ` · ${r.submittedBy.name}` : ""}
                </div>
                {r.storesDetail?.lines?.map((l) => {
                  const closingNegative = Number(l.closingBalance) < 0;
                  return (
                    <div key={l.id} className="text-slate-600 pl-2">
                      {l.itemName} — {l.direction.replace("_", "/")}: {l.quantity} {l.unit || ""}
                      {" "}
                      <span className={`text-xs ${closingNegative ? "text-red-600 font-medium" : "text-slate-400"}`}>
                        (opening {l.openingBalance} → closing {l.closingBalance}
                        {closingNegative ? " — more issued than in stock" : ""})
                      </span>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => navigate(`/actions?sourceReportId=${r.id}&projectId=${projectId}&reportType=STORES`)}
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

function MovementSection({ title, direction, lines, updateLine, addLine, removeLine, bomItems }) {
  const sectionLines = lines.filter((l) => l.direction === direction);
  const hasBom = bomItems.length > 0;
  const showBomLink = (direction === "RECEIVED" || direction === "ISSUED") && hasBom;

  if (direction === "RECEIVED") {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-900">Material Received</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="border border-slate-200 px-2 py-2 text-center w-8">#</th>
                <th className="border border-slate-200 px-3 py-2 text-left">Description</th>
                <th className="border border-slate-200 px-3 py-2 text-left w-24">Quantity</th>
                <th className="border border-slate-200 px-3 py-2 text-left w-28">Finance $</th>
                <th className="border border-slate-200 px-3 py-2 text-left w-36">Supplier</th>
                {showBomLink && <th className="border border-slate-200 px-3 py-2 text-left w-36">BOM Link</th>}
                <th className="border border-slate-200 px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sectionLines.length === 0 && (
                <tr>
                  <td colSpan={showBomLink ? 7 : 6} className="border border-slate-200 px-4 py-4 text-center text-sm text-slate-400">
                    No items yet — click "+ Add row" below.
                  </td>
                </tr>
              )}
              {sectionLines.map((line, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500 font-medium">
                    {i + 1}
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="text"
                      required
                      placeholder="Item description"
                      value={line.itemName}
                      onChange={(e) => updateLine(line, "itemName", e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="0"
                      value={line.quantity}
                      onChange={(e) => updateLine(line, "quantity", e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line, "unitCost", e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="text"
                      placeholder="Supplier name"
                      value={line.supplier}
                      onChange={(e) => updateLine(line, "supplier", e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                    />
                  </td>
                  {showBomLink && (
                    <td className="border border-slate-200 px-1 py-1">
                      <select
                        value={line.bomItemId || ""}
                        onChange={(e) => updateLine(line, "bomItemId", e.target.value || "")}
                        className="w-full px-2 py-1.5 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded bg-transparent"
                      >
                        <option value="">— none —</option>
                        {bomItems.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line)}
                      className="text-slate-400 hover:text-red-500 text-lg leading-none"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => addLine(direction)}
            className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
          >
            + Add row
          </button>
        </div>
      </div>
    );
  }

  // Non-RECEIVED directions: card layout
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
            <button type="button" onClick={() => removeLine(line)} className="text-xs text-red-600">Remove</button>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Item name *</label>
            <input
              type="text"
              required
              value={line.itemName}
              onChange={(e) => updateLine(line, "itemName", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Quantity *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={line.quantity}
                onChange={(e) => updateLine(line, "quantity", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Unit</label>
              <input
                type="text"
                placeholder="e.g. bags, m, units"
                value={line.unit}
                onChange={(e) => updateLine(line, "unit", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <input
              type="text"
              value={line.notes}
              onChange={(e) => updateLine(line, "notes", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>
          {showBomLink && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Link to QS BOM item (optional)</label>
              <select
                value={line.bomItemId || ""}
                onChange={(e) => updateLine(line, "bomItemId", e.target.value || "")}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-sm"
              >
                <option value="">— not linked —</option>
                {bomItems.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.unit})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => addLine(direction)}
        className="w-full bg-white border border-dashed border-slate-300 text-slate-600 rounded-md py-2.5 text-sm font-medium"
      >
        + Add {title.toLowerCase()} item
      </button>
    </div>
  );
}
