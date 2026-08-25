import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const PRIORITY_COLORS = { LOW: "text-slate-600", MEDIUM: "text-amber-700", HIGH: "text-red-700" };

export default function Actions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === "TECHNICAL_MANAGER";

  const [actions, setActions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    projectId: "",
    description: "",
    assignedToId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "MEDIUM",
  });

  useEffect(() => {
    loadActions();
    api.get("/projects").then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.projectId) {
      setProjectMembers([]);
      return;
    }
    api.get(`/projects/${form.projectId}`).then((project) => {
      const seen = new Set();
      const members = [];
      for (const a of project.assignments) {
        if (!seen.has(a.user.id)) {
          seen.add(a.user.id);
          members.push(a.user);
        }
      }
      setProjectMembers(members);
    });
  }, [form.projectId]);

  function loadActions() {
    api.get("/actions").then(setActions).catch(() => setActions([]));
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
      await api.post("/actions", form);
      setSuccess("Action created.");
      setForm({
        projectId: "",
        description: "",
        assignedToId: "",
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Action Tracker</p>
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

        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h2 className="font-medium text-slate-900">Raise a new action</h2>

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
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign to</label>
            <select
              required
              value={form.assignedToId}
              onChange={(e) => updateField("assignedToId", e.target.value)}
              disabled={!form.projectId}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100"
            >
              <option value="">{form.projectId ? "Select a person" : "Select a project first"}</option>
              {projectMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
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
            {submitting ? "Creating..." : "Create action"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">{isManager ? "All actions" : "Actions assigned to me"}</h2>
          {actions.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="border border-slate-100 rounded-md p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.project.name}</span>
                  <span className={PRIORITY_COLORS[a.priority]}>{a.priority}</span>
                </div>
                <p className="text-slate-700">{a.description}</p>
                <div className="text-xs text-slate-500">
                  Assigned to: {a.assignedTo.name} · Due {new Date(a.dueDate).toLocaleDateString()}
                  {a.isOverdue && <span className="text-red-600 font-medium"> · OVERDUE</span>}
                </div>
                <div className="pt-1">
                  {a.status !== "CLOSED" &&
                  (a.assignedToId === user?.id || isManager) &&
                  a.status !== "COMPLETED" ? (
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
