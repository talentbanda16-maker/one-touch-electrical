import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const STATUSES = ["PLANNING", "ACTIVE", "DELAYED", "COMPLETED", "CLOSED"];

const EMPTY_FORM = {
  name: "",
  code: "",
  client: "",
  mainContractor: "",
  location: "",
  contractValue: "",
  approvedBudget: "",
  startDate: "",
  plannedEndDate: "",
  status: "PLANNING",
  projectManagerId: "",
};

function formFromProject(p) {
  return {
    name: p.name || "",
    code: p.code || "",
    client: p.client || "",
    mainContractor: p.mainContractor || "",
    location: p.location || "",
    contractValue: p.contractValue ?? "",
    approvedBudget: p.approvedBudget ?? "",
    startDate: p.startDate ? p.startDate.slice(0, 10) : "",
    plannedEndDate: p.plannedEndDate ? p.plannedEndDate.slice(0, 10) : "",
    status: p.status || "PLANNING",
    projectManagerId: p.projectManagerId || "",
  };
}

export default function ProjectSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const technicalManagers = users.filter((u) => u.role === "TECHNICAL_MANAGER");

  function loadProjects() {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (!creating && data.length > 0 && !projectId) setProjectId(data[0].id);
    });
  }

  useEffect(() => {
    loadProjects();
    api.get("/users").then(setUsers).catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId || creating) return;
    setError("");
    api
      .get(`/projects/${projectId}`)
      .then((p) => setForm(formFromProject(p)))
      .catch((err) => setError(err.message || "Failed to load project"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, creating]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startCreating() {
    setCreating(true);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
  }

  function cancelCreating() {
    setCreating(false);
    setError("");
    if (projects.length > 0) setProjectId(projects[0].id);
  }

  function buildPayload() {
    return {
      name: form.name,
      code: form.code,
      client: form.client || undefined,
      mainContractor: form.mainContractor || undefined,
      location: form.location || undefined,
      contractValue: form.contractValue !== "" ? Number(form.contractValue) : undefined,
      approvedBudget: form.approvedBudget !== "" ? Number(form.approvedBudget) : undefined,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      plannedEndDate: form.plannedEndDate ? new Date(form.plannedEndDate).toISOString() : undefined,
      projectManagerId: form.projectManagerId || undefined,
    };
  }

  async function handleArchive() {
    const selected = projects.find((p) => p.id === projectId);
    if (!selected) return;
    if (!window.confirm(`Archive "${selected.name}"? It will be hidden from active lists but never deleted.`)) return;
    setError("");
    try {
      await api.patch(`/projects/${projectId}/archive`, {});
      setSuccess(`"${selected.name}" has been archived.`);
      loadProjects();
    } catch (err) {
      setError(err.message || "Failed to archive project");
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (creating) {
        const p = await api.post("/projects", buildPayload());
        setSuccess("Project created.");
        setCreating(false);
        loadProjects();
        setProjectId(p.id);
      } else {
        await api.patch(`/projects/${projectId}`, { ...buildPayload(), status: form.status });
        setSuccess("Project updated.");
        loadProjects();
      }
    } catch (err) {
      setError(err.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Project Settings</p>
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
        {!creating && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-end gap-3">
            <div className="flex-1">
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
            <button
              onClick={startCreating}
              className="shrink-0 bg-blue-600 text-white rounded-md px-4 py-3 text-sm font-medium"
            >
              + New project
            </button>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          {creating && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm text-blue-800">
              <span>Creating a new project</span>
              <button type="button" onClick={cancelCreating} className="text-blue-600 underline">
                Cancel
              </button>
            </div>
          )}

          <Field label="Project name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </Field>

          <Field label="Project code" required>
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) => updateField("code", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Client">
              <input
                type="text"
                value={form.client}
                onChange={(e) => updateField("client", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
            <Field label="Main contractor">
              <input
                type="text"
                value={form.mainContractor}
                onChange={(e) => updateField("mainContractor", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
          </div>

          <Field label="Location">
            <input
              type="text"
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract value">
              <input
                type="number"
                min="0"
                value={form.contractValue}
                onChange={(e) => updateField("contractValue", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
            <Field label="Approved budget">
              <input
                type="number"
                min="0"
                value={form.approvedBudget}
                onChange={(e) => updateField("approvedBudget", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
            <Field label="Planned completion">
              <input
                type="date"
                value={form.plannedEndDate}
                onChange={(e) => updateField("plannedEndDate", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
          </div>

          {!creating && (
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Project manager (Technical Manager)">
            <select
              value={form.projectManagerId}
              onChange={(e) => updateField("projectManagerId", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            >
              <option value="">— Not set —</option>
              {technicalManagers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-md py-3 text-base font-medium disabled:opacity-60"
          >
            {saving ? "Saving..." : creating ? "Create project" : "Save changes"}
          </button>

          {!creating && projectId && (
            <button
              type="button"
              onClick={handleArchive}
              className="w-full border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-md py-2.5 text-sm transition-colors"
            >
              Archive this project
            </button>
          )}
        </form>
      </main>
    </div>
  );
}

function Field({ label, required = false, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
    </div>
  );
}
