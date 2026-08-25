import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken } from "../api";

const EMPTY_LINE = {
  itemName: "",
  direction: "RECEIVED",
  quantity: "",
  unit: "",
  unitCost: "",
  supplier: "",
  deliveryReference: "",
  notes: "",
};

const DIRECTIONS = [
  { value: "RECEIVED", label: "Received" },
  { value: "ISSUED", label: "Issued to site" },
  { value: "RETURNED", label: "Returned" },
  { value: "DAMAGED_LOST", label: "Damaged / lost" },
];

export default function StoresReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [shortagesAndRequirements, setShortagesAndRequirements] = useState("");
  const [comments, setComments] = useState("");
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [editingReportId, setEditingReportId] = useState(null);

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/reports/stores?projectId=${projectId}`).then(setReports).catch(() => setReports([]));
  }, [projectId, success]);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingReportId(null);
    setShortagesAndRequirements("");
    setComments("");
    setLines([{ ...EMPTY_LINE }]);
    setReportDate(new Date().toISOString().slice(0, 10));
  }

  function updateLine(index, field, value) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
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
    const res = await fetch(`/api/reports/${reportId}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Photo upload failed");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const lineData = lines.map((l) => ({
        itemName: l.itemName,
        direction: l.direction,
        quantity: Number(l.quantity) || 0,
        unit: l.unit || undefined,
        unitCost: l.unitCost ? Number(l.unitCost) : undefined,
        supplier: l.supplier || undefined,
        deliveryReference: l.deliveryReference || undefined,
        notes: l.notes || undefined,
      }));

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/stores/${editingReportId}`, {
          reportDate,
          shortagesAndRequirements,
          comments,
          lines: lineData,
        });
      } else {
        report = await api.post("/reports/stores", {
          projectId,
          reportDate,
          shortagesAndRequirements,
          comments,
          submissionId: crypto.randomUUID(),
          lines: lineData,
        });
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
      setLines([{ ...EMPTY_LINE }]);
      setEditingReportId(null);
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
          <p className="text-sm text-slate-500">Stores Report</p>
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

          {lines.map((line, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Item {i + 1}</h3>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-sm text-red-600">
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Item name *</label>
                <input
                  type="text"
                  required
                  value={line.itemName}
                  onChange={(e) => updateLine(i, "itemName", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Movement type *</label>
                <select
                  value={line.direction}
                  onChange={(e) => updateLine(i, "direction", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
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
                    onChange={(e) => updateLine(i, "quantity", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Unit</label>
                  <input
                    type="text"
                    placeholder="e.g. bags, m, units"
                    value={line.unit}
                    onChange={(e) => updateLine(i, "unit", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                  />
                </div>
              </div>

              {line.direction === "RECEIVED" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Unit cost</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) => updateLine(i, "unitCost", e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Supplier</label>
                      <input
                        type="text"
                        value={line.supplier}
                        onChange={(e) => updateLine(i, "supplier", e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Delivery reference</label>
                    <input
                      type="text"
                      value={line.deliveryReference}
                      onChange={(e) => updateLine(i, "deliveryReference", e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={line.notes}
                  onChange={(e) => updateLine(i, "notes", e.target.value)}
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
            + Add another item
          </button>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Photos (delivery notes, damaged goods, etc.)</label>
            {stagedPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {stagedPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square bg-slate-100 rounded-md overflow-hidden">
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
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
              + Add photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !projectId}
            className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting..." : editingReportId ? "Resubmit stores report" : "Submit stores report"}
          </button>
        </form>

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
                {r.storesDetail?.lines?.map((l) => (
                  <div key={l.id} className="text-slate-600 pl-2">
                    {l.itemName} — {l.direction.replace("_", "/")}: {l.quantity} {l.unit || ""}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
