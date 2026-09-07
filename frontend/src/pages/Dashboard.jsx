import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const DEPARTMENT_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };

const ROLE_LABELS = {
  TECHNICAL_MANAGER: "Technical Manager",
  FOREMAN: "Foreman",
  QS: "Quantity Surveyor",
  SHE_OFFICER: "SHE Officer",
  STORESMAN: "Storesman",
  FINANCE: "Finance",
  MANAGEMENT: "Management",
  GENERAL_WORKER: "General Worker",
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
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (user?.role === "TECHNICAL_MANAGER") {
      api.get("/reports/pending").then((list) => setPendingCount(list.length)).catch(() => {});
      api.get("/dashboard/summary").then(setSummary).catch(() => {});
    }
    if (REPORTING_ROLES.includes(user?.role)) {
      api.get("/reports/mine/returned").then(setReturnedReports).catch(() => {});
    }
  }, [user?.role]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0 max-w-[42%]">
          <p className="text-sm text-slate-500">Signed in as</p>
          <p className="font-medium text-slate-900 truncate">
            {user?.name} · {ROLE_LABELS[user?.role] || user?.role}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/settings")}
            className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
          >
            Settings
          </button>
          <button
            onClick={logout}
            className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
          >
            Log out
          </button>
        </div>
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

        {user?.role === "TECHNICAL_MANAGER" && summary && (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Active projects" value={summary.activeProjects} />
            <StatTile label="Reports today" value={summary.reportsToday} />
            <StatTile
              label="Pending approvals"
              value={summary.pendingApprovals}
              onClick={() => navigate("/approvals")}
            />
            <StatTile
              label="Open actions"
              value={summary.openActions}
              alert={summary.overdueActions > 0}
              alertText={`${summary.overdueActions} overdue`}
              onClick={() => navigate("/actions")}
            />
            <StatTile
              label="Open instructions"
              value={summary.openInstructions}
              alert={summary.overdueInstructions > 0}
              alertText={`${summary.overdueInstructions} overdue`}
              onClick={() => navigate("/instructions")}
            />
          </div>
        )}

        {user?.role === "TECHNICAL_MANAGER" && summary?.reportsTodayByType && summary.reportsToday > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-medium text-slate-700 mb-2">Reports submitted today by department</h2>
            <div style={{ width: "100%", height: 140 }}>
              <ResponsiveContainer>
                <BarChart
                  data={Object.entries(summary.reportsTodayByType).map(([type, count]) => ({
                    name: DEPARTMENT_LABELS[type] || type,
                    count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT") && (
          <button
            onClick={() => navigate("/dashboard/management")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Management dashboard
          </button>
        )}

        {user?.role === "TECHNICAL_MANAGER" && (
          <button
            onClick={() => navigate("/projects")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Manage projects
          </button>
        )}

        {user?.role === "TECHNICAL_MANAGER" && (
          <button
            onClick={() => navigate("/users")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Manage users
          </button>
        )}

        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT") && (
          <button
            onClick={() => navigate("/audit-log")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Audit log
          </button>
        )}

        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT") && (
          <button
            onClick={() => navigate("/analytics")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Project progress &amp; finance
          </button>
        )}

        {user?.role === "TECHNICAL_MANAGER" && (
          <button
            onClick={() => navigate("/reports/combined")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Combined report (PDF/Excel)
          </button>
        )}

        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT") && (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => navigate("/analytics/foreman")}
              className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-xs font-medium"
            >
              Foreman
            </button>
            <button
              onClick={() => navigate("/analytics/qs")}
              className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-xs font-medium"
            >
              QS / BOQ
            </button>
            <button
              onClick={() => navigate("/analytics/stores")}
              className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-xs font-medium"
            >
              Stores
            </button>
            <button
              onClick={() => navigate("/analytics/she")}
              className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-xs font-medium"
            >
              SHE
            </button>
            <button
              onClick={() => navigate("/analytics/finance")}
              className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-xs font-medium"
            >
              Finance
            </button>
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
        {user?.role === "GENERAL_WORKER" && (
          <button
            onClick={() => navigate("/reports/productivity")}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-medium"
          >
            Submit daily productivity report
          </button>
        )}
        {user?.role === "FOREMAN" && (
          <button
            onClick={() => navigate("/productivity/review")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Review productivity reports
          </button>
        )}
        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "MANAGEMENT") && (
          <button
            onClick={() => navigate("/productivity/finalize")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Productivity reports
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/instructions")}
            className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            {user?.role === "TECHNICAL_MANAGER" ? "Instructions" : "My instructions"}
          </button>
          <button
            onClick={() => navigate("/actions")}
            className="bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            {user?.role === "TECHNICAL_MANAGER" ? "Actions" : "My actions"}
          </button>
        </div>

        {["TECHNICAL_MANAGER", "FINANCE", "MANAGEMENT"].includes(user?.role) && (
          <button
            onClick={() => navigate("/reports/generate")}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-medium"
          >
            Reports (progress / financial / department)
          </button>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
          {user?.role === "TECHNICAL_MANAGER"
            ? "Approve/return reports, issue instructions, and track actions above."
            : ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"].includes(user?.role)
            ? "Reports you submit go to the Technical Manager for approval — check back if one is returned for correction."
            : user?.role === "GENERAL_WORKER"
            ? "Your daily productivity report goes to your Foreman for review, then the Technical Manager for sign-off."
            : "You have read-only oversight access — view progress, finance, and audit data above; you can't submit or edit anything."}
        </div>
      </main>
    </div>
  );
}

function StatTile({ label, value, onClick, alert = false, alertText }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 text-left"
    >
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
      {alert && <div className="text-xs text-red-600 font-medium mt-1">{alertText}</div>}
    </button>
  );
}
