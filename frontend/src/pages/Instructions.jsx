import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const PRIORITY_COLORS = { LOW: "text-slate-600", MEDIUM: "text-amber-700", HIGH: "text-red-700" };

export default function Instructions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === "TECHNICAL_MANAGER";
  const isManagement = user?.role === "MANAGEMENT";

  const [instructions, setInstructions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attachmentsByInstruction, setAttachmentsByInstruction] = useState({});

  const [form, setForm] = useState({
    projectId: "",
    description: "",
    personResponsibleId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "MEDIUM",
  });

  useEffect(() => {
    loadInstructions();
    api.get("/projects").then(setProjects).catch(() => {});
    if (isManager) {
      api.get("/users").then(setUsers).catch(() => {});
    }
  }, []);

  function loadInstructions() {
    api
      .get("/instructions")
      .then((list) => {
        setInstructions(list);
        list.forEach((i) => loadAttachments(i.id));
      })
      .catch(() => setInstructions([]));
  }

  function loadAttachments(instructionId) {
    api
      .get(`/instructions/${instructionId}/attachments`)
      .then((list) => setAttachmentsByInstruction((prev) => ({ ...prev, [instructionId]: list })))
      .catch(() => {});
  }

  async function handleEvidenceUpload(instructionId, file) {
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload(`/instructions/${instructionId}/attachments`, formData);
      loadAttachments(instructionId);
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
      await api.post("/instructions", form);
      setSuccess("Instruction issued.");
      setForm({
        projectId: "",
        description: "",
        personResponsibleId: "",
        dueDate: new Date().toISOString().slice(0, 10),
        priority: "MEDIUM",
      });
      loadInstructions();
    } catch (err) {
      setError(err.message || "Failed to issue instruction");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, status) {
    setError("");
    try {
      await api.patch(`/instructions/${id}/status`, { status });
      loadInstructions();
    } catch (err) {
      setError(err.message || "Failed to update status");
    }
  }

  async function handleVerify(id) {
    setError("");
    try {
      await api.post(`/instructions/${id}/verify`);
      loadInstructions();
    } catch (err) {
      setError(err.message || "Failed to verify instruction");
    }
  }

  async function handleArchive(id) {
    if (!window.confirm("Archive this instruction? It will be hidden from the active list.")) return;
    setError("");
    try {
      await api.patch(`/instructions/${id}/archive`, {});
      loadInstructions();
    } catch (err) {
      setError(err.message || "Failed to archive instruction");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Instructions</p>
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

        {isManager && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <h2 className="font-medium text-slate-900">Issue new instruction</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select
                required
                value={form.projectId}
                onChange={(e) => updateField("projectId", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Person responsible</label>
              <select
                required
                value={form.personResponsibleId}
                onChange={(e) => updateField("personResponsibleId", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                <option value="">Select a person</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

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
              disabled={submitting}
              className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
            >
              {submitting ? "Issuing..." : "Issue instruction"}
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">
            {isManager
              ? "All instructions"
              : isManagement
              ? "Instructions issued by the Technical Manager"
              : "Instructions assigned to me"}
          </h2>
          {instructions.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
          <ul className="space-y-2">
            {instructions.map((i) => (
              <li key={i.id} className="border border-slate-100 rounded-md p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      {i.instructionNumber}
                    </span>
                    <span className="font-medium truncate">{i.project.name}</span>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${PRIORITY_COLORS[i.priority]}`}>{i.priority}</span>
                </div>
                <p className="text-slate-700">{i.description}</p>
                <div className="text-xs text-slate-500">
                  Responsible: {i.personResponsible.name} · Due {new Date(i.dueDate).toLocaleDateString()}
                  {i.isOverdue && <span className="text-red-600 font-medium"> · OVERDUE</span>}
                </div>
                <div className="pt-1">
                  {i.status !== "CLOSED" &&
                  i.personResponsibleId === user?.id &&
                  i.status !== "COMPLETED" ? (
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      Status:
                      <select
                        value={i.status}
                        onChange={(e) => handleStatusChange(i.id, e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 font-medium text-slate-900"
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    </label>
                  ) : (
                    <span className="text-xs font-medium bg-slate-100 rounded px-2 py-1">{i.status}</span>
                  )}
                  {isManager && i.status === "COMPLETED" && (
                    <button
                      onClick={() => handleVerify(i.id)}
                      className="ml-2 text-xs bg-green-600 text-white rounded px-2 py-1"
                    >
                      Verify &amp; close
                    </button>
                  )}
                  {isManager && i.status === "CLOSED" && (
                    <button
                      onClick={() => handleArchive(i.id)}
                      className="ml-2 text-xs text-slate-400 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                    >
                      Archive
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1">
                  {(attachmentsByInstruction[i.id] ?? []).map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => handleEvidenceDownload(att)}
                      className="block text-xs text-blue-600 underline"
                    >
                      {att.fileName}
                    </button>
                  ))}
                  {(i.personResponsibleId === user?.id || isManager) && (
                    <label className="inline-block text-xs text-slate-500 border border-dashed border-slate-300 rounded px-2 py-1 cursor-pointer">
                      + Add evidence
                      <input
                        type="file"
                        accept="image/*,application/pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) handleEvidenceUpload(i.id, file);
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
