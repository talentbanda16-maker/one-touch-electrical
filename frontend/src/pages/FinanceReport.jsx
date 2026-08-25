import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken } from "../api";

const EMPTY_LINE = {
  type: "EXPENDITURE",
  category: "MATERIALS",
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
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [comments, setComments] = useState("");
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]);

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

  function updateLine(index, field, value) {
    setLines((ls) =>
      ls.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, [field]: value };
        if (field === "type") {
          updated.category = CATEGORIES_BY_TYPE[value][0].value;
        }
        return updated;
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
    const res = await fetch(`/api/reports/${reportId}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Document upload failed");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const body = {
        projectId,
        reportDate,
        comments,
        submissionId: crypto.randomUUID(),
        lines: lines.map((l) => ({
          type: l.type,
          category: l.category,
          amount: Number(l.amount) || 0,
          description: l.description || undefined,
          paymentReference: l.paymentReference || undefined,
        })),
      };
      const report = await api.post("/reports/finance", body);

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
          ? `Finance report submitted, but ${photoFailures} supporting document(s) failed to upload.`
          : "Finance report submitted."
      );
      setComments("");
      setLines([{ ...EMPTY_LINE }]);
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
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
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

          {lines.map((line, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Transaction {i + 1}</h3>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-sm text-red-600">
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Type *</label>
                <select
                  value={line.type}
                  onChange={(e) => updateLine(i, "type", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Category *</label>
                <select
                  value={line.category}
                  onChange={(e) => updateLine(i, "category", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                >
                  {CATEGORIES_BY_TYPE[line.type].map((c) => (
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
                  onChange={(e) => updateLine(i, "amount", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment reference</label>
                <input
                  type="text"
                  value={line.paymentReference}
                  onChange={(e) => updateLine(i, "paymentReference", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Description</label>
                <input
                  type="text"
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
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
            + Add another transaction
          </button>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Supporting documents (invoices, receipts)</label>
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
              + Add document photo
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
            {submitting ? "Submitting..." : "Submit finance report"}
          </button>
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
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
