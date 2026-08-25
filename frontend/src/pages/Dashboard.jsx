import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

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

      <main className="p-4 space-y-4">
        {user?.role === "FOREMAN" && (
          <button
            onClick={() => navigate("/reports/foreman")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit daily report
          </button>
        )}
        {user?.role === "QS" && (
          <button
            onClick={() => navigate("/reports/qs")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit QS report
          </button>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
          {user?.role === "FOREMAN" || user?.role === "QS"
            ? "SHE, Stores and Finance forms, plus photo upload, land next in Step 2."
            : "Role-specific reporting forms and dashboards land in Step 2–4."}
          <br />
          Foundation (login, roles, projects) is working.
        </div>
      </main>
    </div>
  );
}
