import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const ROLES = ["TECHNICAL_MANAGER", "ENGINEER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "MANAGEMENT", "GENERAL_WORKER"];
const ROLE_LABELS = {
  TECHNICAL_MANAGER: "Technical Manager",
  ENGINEER: "Engineer",
  FOREMAN: "Foreman",
  QS: "Quantity Surveyor",
  SHE_OFFICER: "SHE Officer",
  STORESMAN: "Storesman",
  FINANCE: "Finance",
  MANAGEMENT: "Management",
  GENERAL_WORKER: "General Worker",
};

export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "FOREMAN" });
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  function load() {
    api
      .get("/users")
      .then(setUsers)
      .catch((err) => setError(err.message || "Failed to load users"));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/users", form);
      setForm({ name: "", email: "", password: "", role: "FOREMAN" });
      setShowCreate(false);
      setNotice("User created.");
      load();
    } catch (err) {
      setError(err.message || "Failed to create user");
    }
  }

  async function toggleActive(u) {
    setError("");
    try {
      await api.post(`/users/${u.id}/${u.isActive ? "deactivate" : "reactivate"}`);
      load();
    } catch (err) {
      setError(err.message || "Failed to update user");
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { newPassword: resetPassword });
      setNotice(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      setError(err.message || "Failed to reset password");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Users</p>
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
        {notice && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {notice}
          </div>
        )}

        <button
          onClick={() => setShowCreate((s) => !s)}
          className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium"
        >
          {showCreate ? "Cancel" : "+ Create user"}
        </button>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <input
              placeholder="Full name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Temporary password (min 8 chars)"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button type="submit" className="w-full bg-blue-600 text-white rounded-md py-2.5 text-sm font-medium">
              Create
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {users.map((u) => (
            <div key={u.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 break-words">
                  <div className="font-medium text-slate-900">
                    {u.name} {!u.isActive && <span className="text-red-600 text-xs ml-1">(inactive)</span>}
                  </div>
                  <div className="text-slate-500 break-all">
                    {u.email} · {ROLE_LABELS[u.role] || u.role}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setResetTarget(u)}
                    className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => toggleActive(u)}
                    className={`text-xs border rounded-md px-2 py-1.5 ${
                      u.isActive ? "border-red-300 text-red-700" : "border-green-300 text-green-700"
                    }`}
                  >
                    {u.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleReset}
            className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3"
          >
            <h2 className="font-medium text-slate-900">Reset password for {resetTarget.name}</h2>
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              required
              minLength={8}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setResetTarget(null);
                  setResetPassword("");
                }}
                className="flex-1 border border-slate-300 rounded-md py-2 text-sm"
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium">
                Reset
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
