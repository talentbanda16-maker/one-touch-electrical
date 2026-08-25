import { useAuth } from "../context/AuthContext";

const ROLE_LABELS = {
  TECHNICAL_MANAGER: "Technical Manager",
  FOREMAN: "Foreman",
  QS: "Quantity Surveyor",
  SHE_OFFICER: "SHE Officer",
  STORESMAN: "Storesman",
  FINANCE: "Finance",
  MANAGEMENT: "Management",
};

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Signed in as</p>
          <p className="font-medium text-slate-900">
            {user?.name} · {ROLE_LABELS[user?.role] || user?.role}
          </p>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Log out
        </button>
      </header>

      <main className="p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
          Role-specific reporting forms and dashboards land in Step 2–4.
          <br />
          Foundation (login, roles, projects) is working.
        </div>
      </main>
    </div>
  );
}
