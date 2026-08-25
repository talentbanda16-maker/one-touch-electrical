import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const ROLE_LABELS = {
  TECHNICAL_MANAGER: "Technical Manager",
  FOREMAN: "Foreman",
  QS: "Quantity Surveyor",
  SHE_OFFICER: "SHE Officer",
  STORESMAN: "Storesman",
  FINANCE: "Finance",
  MANAGEMENT: "Management",
};

const REPORT_TYPE_ROUTES = {
  FOREMAN: "/reports/foreman",
  QS: "/reports/qs",
  SHE: "/reports/she",
  STORES: "/reports/stores",
  FINANCE: "/reports/finance",
};

const REPORTING_ROLES = ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(null);
  const [returnedReports, setReturnedReports] = useState([]);

  useEffect(() => {
    if (user?.role === "TECHNICAL_MANAGER") {
      api.get("/reports/pending").then((list) => setPendingCount(list.length)).catch(() => {});
    }
    if (REPORTING_ROLES.includes(user?.role)) {
      api.get("/reports/mine/returned").then(setReturnedReports).catch(() => {});
    }
  }, [user?.role]);

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
        {returnedReports.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <h2 className="font-medium text-amber-900">
              {returnedReports.length} report{returnedReports.length > 1 ? "s" : ""} returned for correction
            </h2>
            {returnedReports.map((r) => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-md p-2 text-sm space-y-1">
                <div className="font-medium">
                  {r.project.name} · {new Date(r.reportDate).toLocaleDateString()}
                </div>
                <div className="text-amber-800">Reason: {r.returnReason}</div>
                <button
                  type="button"
                  onClick={() => navigate(`${REPORT_TYPE_ROUTES[r.type]}?edit=${r.id}`)}
                  className="text-blue-600 font-medium"
                >
                  Edit &amp; resubmit
                </button>
              </div>
            ))}
          </div>
        )}

        {user?.role === "TECHNICAL_MANAGER" && (
          <button
            onClick={() => navigate("/approvals")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Review pending reports{pendingCount !== null ? ` (${pendingCount})` : ""}
          </button>
        )}
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
        {user?.role === "SHE_OFFICER" && (
          <button
            onClick={() => navigate("/reports/she")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit SHE report
          </button>
        )}
        {user?.role === "STORESMAN" && (
          <button
            onClick={() => navigate("/reports/stores")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit stores report
          </button>
        )}
        {user?.role === "FINANCE" && (
          <button
            onClick={() => navigate("/reports/finance")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit finance report
          </button>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
          {user?.role === "TECHNICAL_MANAGER"
            ? "Approve or return each submitted report above. Full dashboards and analytics land in Steps 4–5."
            : ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"].includes(user?.role)
            ? "Reports you submit go to the Technical Manager for approval — check back if one is returned for correction."
            : "Role-specific reporting forms and dashboards land in Step 2–4."}
        </div>
      </main>
    </div>
  );
}
