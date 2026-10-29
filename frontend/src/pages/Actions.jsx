import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import CommentThread from "../components/CommentThread";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const PRIORITY_COLORS = { LOW: "text-slate-600", MEDIUM: "text-amber-700", HIGH: "text-red-700" };
const REPORT_TYPE_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };

export default function Actions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isManager = user?.role === "TECHNICAL_MANAGER";
  const isManagement = user?.role === "MANAGEMENT";

  const sourceReportId = searchParams.get("sourceReportId") || "";
  const sourceProjectId = searchParams.get("projectId") || "";
  const sourceReportType = searchParams.get("reportType") || "";

  const [actions, setActions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [technicalManagers, setTechnicalManagers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attachmentsByAction, setAttachmentsByAction] = useState({});
  const [commentsOpen, setCommentsOpen] = useState({});

  const [form, setForm] = useState({
    projectId: sourceProjectId,
    description: "",
    assignedToId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "MEDIUM",
  });

  useEffect(() => {
    loadActions();
    api.get("/projects").then(setProjects).catch(() => {});
    // Non-TM users can only raise an action to the Technical Manager —
    // fetched separately since the TM has no ProjectAssignment row and
    // so never shows up in a project's member list.
    if (!isManager) {
      api.get("/users/technical-managers").then(setTechnicalManagers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For a non-TM raiser with exactly one Technical Manager in the
  // system (the common case), skip the picker entirely and just assign
  // to them directly.
  useEffect(() => {
    if (!isManager && technicalManagers.length === 1 && !form.assignedToId) {
      setForm((f) => ({ ...f, assignedToId: technicalManagers[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicalManagers]);

  function loadActions() {
    api
      .get("/actions")
      .then((list) => {
        setActions(list);
        list.forEach((a) => loadAttachments(a.id));
      })
      .catch(() => setActions([]));
  }

  function loadAttachments(actionId) {
    api
      .get(`/actions/${actionId}/attachments`)
      .then((list) => setAttachmentsByAction((prev) => ({ ...prev, [actionId]: list })))
      .catch(() => {});
  }

  async function handleEvidenceUpload(actionId, file) {
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload(`/actions/${actionId}/attachments`, formData);
      loadAttachments(actionId);
    } catch (err) {
      setError(err.message || "Failed to upload evidence");
    }
  }

  async function handleEvidenceDownload(attachment) {
    let blob;
    try {
      blob = await api.blob(`/attachments/${attachment.id}/file`);
    } catch {
      setError("Failed to download file");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await api.post("/actions", { ...form, sourceReportId: sourceReportId || undefined });
      setSuccess("Action created.");
      setForm({
        projectId: sourceProjectId,
        description: "",
        assignedToId: !isManager && technicalManagers.length === 1 ? technicalManagers[0].id : "",
        dueDate: new Date().toISOString().slice(0, 10),
        priority: "MEDIUM",
      });
      loadActions();
    } catch (err) {
      setError(err.message || "Failed to create action");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, status) {
    setError("");
    try {
      await api.patch(`/actions/${id}/status`, { status });
      loadActions();
    } catch (err) {
      setError(err.message || "Failed to update status");
    }
  }

  async function handleVerify(id) {
    setError("");
    try {
      await api.post(`/actions/${id}/verify`);
      loadActions();
    } catch (err) {
      setError(err.message || "Failed to verify action");
    }
  }

  async function handleArchive(id) {
    if (!window.confirm("Archive this action? It will be hidden from the active list.")) return;
    setError("");
    try {
      await api.patch(`/actions/${id}/archive`, {});
      loadActions();
    } catch (err) {
      setError(err.message || "Failed to archive action");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Action Tracker</p>
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

        {!isManagement && !isManager && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h2 className="font-medium text-slate-900">Raise a new action</h2>

          {sourceReportId && (
            <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm text-blue-800">
              Raised from a {REPORT_TYPE_LABELS[sourceReportType] || sourceReportType} report — this action will be
              linked back to it.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              required
              value={form.projectId}
              onChange={(e) => updateField("projectId", e.target.value)}
              disabled={!!sourceReportId}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100"
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              required
              rows={2}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </div>

          {technicalManagers.length > 1 ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Raise to</label>
              <select
                required
                value={form.assignedToId}
                onChange={(e) => updateField("assignedToId", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                <option value="">Select a Technical Manager</option>
                {technicalManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm text-blue-800">
              This will be raised to the Technical Manager{" "}
              {technicalManagers[0]?.name ? `(${technicalManagers[0].name})` : ""} — they'll decide what happens
              next.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due date</label>
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => updateField("dueDate", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => updateField("priority", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !form.assignedToId}
            className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create action"}
          </button>
        </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">
            {isManager ? "All actions" : isManagement ? "Actions raised to the Technical Manager" : "Actions I've raised"}
          </h2>
          {actions.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="border border-slate-100 rounded-md p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.refNumber && (
                      <span className="shrink-0 text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                        {a.refNumber}
                      </span>
                    )}
                    <span className="font-medium truncate">{a.project.name}</span>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${PRIORITY_COLORS[a.priority]}`}>{a.priority}</span>
                </div>
                <p className="text-slate-700">{a.description}</p>
                <div className="text-xs text-slate-500">
                  {isManager || isManagement ? `Raised by: ${a.createdBy.name}` : `Assigned to: ${a.assignedTo.name}`}
                  {" · "}Due {new Date(a.dueDate).toLocaleDateString()}
                  {a.isOverdue && <span className="text-red-600 font-medium"> · OVERDUE</span>}
                </div>
                {a.sourceReport && (
                  <div className="text-xs text-slate-400">
                    Raised from: {REPORT_TYPE_LABELS[a.sourceReport.type] || a.sourceReport.type} report (
                    {new Date(a.sourceReport.reportDate).toLocaleDateString()})
                  </div>
                )}
                <div className="pt-1">
                  {a.status !== "CLOSED" && isManager && a.status !== "COMPLETED" ? (
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      Status:
                      <select
                        value={a.status}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 font-medium text-slate-900"
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    </label>
                  ) : (
                    <span className="text-xs font-medium bg-slate-100 rounded px-2 py-1">{a.status}</span>
                  )}
                  {isManager && a.status === "COMPLETED" && (
                    <button
                      onClick={() => handleVerify(a.id)}
                      className="ml-2 text-xs bg-green-600 text-white rounded px-2 py-1"
                    >
                      Verify &amp; close
                    </button>
                  )}
                  {isManager && a.status === "CLOSED" && (
                    <button
                      onClick={() => handleArchive(a.id)}
                      className="ml-2 text-xs text-slate-400 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                    >
                      Archive
                    </button>
                  )}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setCommentsOpen((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {commentsOpen[a.id] ? "Hide comments" : "Comments"}
                  </button>
                  {commentsOpen[a.id] && <CommentThread entityType="Action" entityId={a.id} />}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1">
                  {(attachmentsByAction[a.id] ?? []).map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => handleEvidenceDownload(att)}
                      className="block text-xs text-blue-600 underline"
                    >
                      {att.fileName}
                    </button>
                  ))}
                  {(a.assignedToId === user?.id || isManager) && (
                    <label className="inline-block text-xs text-slate-500 border border-dashed border-slate-300 rounded px-2 py-1 cursor-pointer">
                      + Add evidence
                      <input
                        type="file"
                        accept="image/*,application/pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) handleEvidenceUpload(a.id, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
