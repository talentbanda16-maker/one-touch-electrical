import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken } from "../api";

const EMPTY_LINE = {
  boqItemNumber: "",
  description: "",
  contractQuantity: "",
  quantityToday: "",
  cumulativeQuantity: "",
  measurements: "",
  valuationAmount: "",
  variationReference: "",
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
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]); // [{ file, previewUrl }]
  const [editingReportId, setEditingReportId] = useState(null);

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
        comments: l.comments || "",
      }))
    );
    setEditingReportId(report.id);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingReportId(null);
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
        boqItemNumber: l.boqItemNumber,
        description: l.description,
        contractQuantity: Number(l.contractQuantity) || 0,
        quantityToday: Number(l.quantityToday) || 0,
        cumulativeQuantity: Number(l.cumulativeQuantity) || 0,
        measurements: l.measurements || undefined,
        valuationAmount: l.valuationAmount ? Number(l.valuationAmount) : undefined,
        variationReference: l.variationReference || undefined,
        comments: l.comments || undefined,
      }));

      let report;
      if (editingReportId) {
        report = await api.patch(`/reports/qs/${editingReportId}`, { reportDate, comments, lines: lineData });
      } else {
        report = await api.post("/reports/qs", {
          projectId,
          reportDate,
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
          ? `QS report ${editingReportId ? "resubmitted" : "submitted"}, but ${photoFailures} photo(s) failed to upload.`
          : `QS report ${editingReportId ? "resubmitted" : "submitted"}.`
      );
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Supporting photographs</label>
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
            {submitting ? "Submitting..." : editingReportId ? "Resubmit QS report" : "Submit QS report"}
          </button>
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
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
