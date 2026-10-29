import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const DEPARTMENT_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };

const fmt$ = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

export default function EngineerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pendingReqs, setPendingReqs] = useState([]);
  const [reqError, setReqError] = useState("");

  useEffect(() => {
    api.get("/reports/pending").then((list) => setPendingCount(list.length)).catch(() => {});
    api.get("/dashboard/summary").then(setSummary).catch(() => {});
    api.get("/projects").then((data) => {
      const active = data.filter((p) => p.status === "ACTIVE");
      setProjects(active);
      // Load pending requisitions from all active projects
      Promise.all(active.map((p) => api.get(`/projects/${p.id}/requisitions`).catch(() => [])))
        .then((results) => {
          const all = results.flat().filter((r) => r.status === "PENDING");
          setPendingReqs(all);
        });
    }).catch(() => {});
  }, []);

  async function handleApproveReq(id, approved, rejectionReason) {
    setReqError("");
    try {
      await api.patch(`/requisitions/${id}/approve`, { approved, rejectionReason });
      setPendingReqs((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setReqError(err.message || "Failed to update requisition");
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const NavBtn = ({ label, onClick, wide = false, badge, accent }) => (
    <button onClick={onClick}
      className={`${wide ? "col-span-2" : ""} ${accent ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-600 hover:bg-brand-700"} text-white rounded-xl py-4 text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors`}>
      {label}{badge != null && badge > 0 && <span className="bg-white text-slate-800 text-xs font-black px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
    </button>
  );

  const SectionPanel = ({ title, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2.5 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );

  function StatTile({ label, value, onClick, alert = false, alertText, wide = false, color = "slate" }) {
    const colors = {
      slate: "bg-white border-slate-200 text-slate-900",
      blue:  "bg-blue-50 border-blue-200 text-blue-900",
      green: "bg-green-50 border-green-200 text-green-900",
      amber: "bg-amber-50 border-amber-300 text-amber-900",
      red:   "bg-red-50 border-red-300 text-red-900",
    };
    return (
      <button onClick={onClick}
        className={`${wide ? "col-span-2" : ""} ${colors[color]} rounded-xl border-2 p-4 text-left shadow-sm transition-opacity active:opacity-80`}>
        <div className="text-2xl font-black">{value ?? "—"}</div>
        <div className="text-sm font-medium mt-0.5 opacity-80">{label}</div>
        {alert && <div className="text-xs font-bold mt-1 text-red-600">{alertText}</div>}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="One Touch" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shadow" />
          <div>
            <p className="text-white font-bold text-sm leading-tight">One Touch Electrical</p>
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5"
              style={{ background: "rgba(255,255,255,0.12)", color: "#93c5fd" }}>
              Engineer
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/settings")} className="text-slate-300 border border-slate-600 rounded-md px-3 py-1.5 text-xs">Settings</button>
          <button onClick={logout} className="text-slate-300 border border-slate-600 rounded-md px-3 py-1.5 text-xs">Log out</button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">

        {/* Greeting card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">{dateStr}</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{greeting}, {user?.name}</p>
          </div>
          {summary && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full">{summary.activeProjects} active project{summary.activeProjects !== 1 ? "s" : ""}</span>
              {summary.reportsToday > 0 && <span className="text-xs font-semibold px-2.5 py-1 bg-green-100 text-green-800 rounded-full">{summary.reportsToday} report{summary.reportsToday !== 1 ? "s" : ""} today</span>}
              {summary.pendingApprovals > 0 && <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full">{summary.pendingApprovals} pending approval{summary.pendingApprovals !== 1 ? "s" : ""}</span>}
              {summary.overdueActions > 0 && <span className="text-xs font-semibold px-2.5 py-1 bg-red-100 text-red-800 rounded-full">{summary.overdueActions} overdue</span>}
            </div>
          )}
        </div>

        {/* Pending approval alert */}
        {pendingCount > 0 && (
          <button onClick={() => navigate("/approvals")}
            className="w-full bg-amber-50 border-2 border-amber-400 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="text-left">
              <p className="text-sm font-bold text-amber-900">{pendingCount} report{pendingCount !== 1 ? "s" : ""} awaiting approval</p>
              <p className="text-xs text-amber-700">Tap to review and approve or return</p>
            </div>
            <span className="text-amber-600 text-lg">→</span>
          </button>
        )}

        {/* SHE safety strip */}
        {summary?.sheIncidents && (
          <div className={`rounded-xl border-2 px-4 py-3 flex items-center justify-between ${
            summary.sheIncidents.last30Days > 0 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"
          }`}>
            <div>
              <p className={`text-sm font-bold ${summary.sheIncidents.last30Days > 0 ? "text-red-900" : "text-green-900"}`}>
                {summary.sheIncidents.last30Days === 0 ? "Zero incidents — last 30 days" : `${summary.sheIncidents.last30Days} incident${summary.sheIncidents.last30Days !== 1 ? "s" : ""} — last 30 days`}
              </p>
              <p className={`text-xs mt-0.5 ${summary.sheIncidents.last30Days > 0 ? "text-red-700" : "text-green-700"}`}>
                {summary.sheIncidents.nearMisses30Days} near miss{summary.sheIncidents.nearMisses30Days !== 1 ? "es" : ""} · {summary.sheIncidents.openCorrectiveActions} open corrective action{summary.sheIncidents.openCorrectiveActions !== 1 ? "s" : ""}
              </p>
            </div>
            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
              summary.sheIncidents.last30Days > 0 ? "bg-red-200 text-red-900" : "bg-green-200 text-green-900"
            }`}>
              {summary.sheIncidents.last30Days > 0 ? "ALERT" : "SAFE"}
            </span>
          </div>
        )}

        {/* Material shortage alert */}
        {summary?.materialShortages?.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Material Shortages — last 7 days</p>
            {summary.materialShortages.map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-amber-200 p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-bold text-slate-800">{s.project.name}</p>
                  <p className="text-xs text-slate-400">{new Date(s.date).toLocaleDateString()}</p>
                </div>
                <p className="text-xs text-amber-800 leading-snug">{s.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stat tiles */}
        {summary && (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Active Projects"   value={summary.activeProjects}   color="blue" />
            <StatTile label="Reports Today"     value={summary.reportsToday}      color={summary.reportsToday > 0 ? "green" : "slate"} />
            <StatTile label="Pending Approvals" value={summary.pendingApprovals}  color={summary.pendingApprovals > 0 ? "amber" : "slate"} onClick={() => navigate("/approvals")} />
            <StatTile label="Open Actions"      value={summary.openActions}       color={summary.overdueActions > 0 ? "red" : "slate"} alert={summary.overdueActions > 0} alertText={`${summary.overdueActions} overdue`} onClick={() => navigate("/actions")} />
            <StatTile label="Open Instructions" value={summary.openInstructions}  color={summary.overdueInstructions > 0 ? "red" : "slate"} alert={summary.overdueInstructions > 0} alertText={`${summary.overdueInstructions} overdue`} onClick={() => navigate("/instructions")} wide />
          </div>
        )}

        {/* Today's report bar chart */}
        {summary?.reportsTodayByType && summary.reportsToday > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2.5 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reports Submitted Today</p>
            </div>
            <div className="p-4">
              <div style={{ width: "100%", height: 130 }}>
                <ResponsiveContainer>
                  <BarChart data={Object.entries(summary.reportsTodayByType).map(([type, count]) => ({ name: DEPARTMENT_LABELS[type] || type, count }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1e293b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Pending material requisitions from Foreman */}
        {(pendingReqs.length > 0 || reqError) && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <p className="text-sm font-bold text-slate-800">Pending material requisitions</p>
              <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {pendingReqs.length}
              </span>
            </div>
            {reqError && <p className="text-xs text-red-600 px-4 py-2">{reqError}</p>}
            <ul className="divide-y divide-slate-100">
              {pendingReqs.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.refNumber && (
                        <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                          {r.refNumber}
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900">{r.itemName}</span>
                      <span className="text-sm text-slate-500">× {r.quantityRequested}{r.unit ? ` ${r.unit}` : ""}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {r.urgency} priority · by {r.requestedBy?.name} · {r.project?.name || ""}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveReq(r.id, true)}
                      className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 hover:bg-green-100"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        const reason = window.prompt("Reason for rejection (optional):");
                        if (reason !== null) handleApproveReq(r.id, false, reason || undefined);
                      }}
                      className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 hover:bg-red-100"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Operations */}
        <SectionPanel title="Operations">
          <div className="grid grid-cols-2 gap-2">
            <NavBtn label="Management Dashboard" onClick={() => navigate("/dashboard/management")} wide />
            <NavBtn label="Review Reports"        onClick={() => navigate("/approvals")} badge={pendingCount} accent={pendingCount > 0} />
            <NavBtn label="Instructions"          onClick={() => navigate("/instructions")} />
            <NavBtn label="Actions"               onClick={() => navigate("/actions")} />
          </div>
        </SectionPanel>

        {/* Team & Admin */}
        <SectionPanel title="Team & Admin">
          <div className="grid grid-cols-2 gap-2">
            <NavBtn label="Manage Projects"      onClick={() => navigate("/projects")} />
            <NavBtn label="Manage Users"         onClick={() => navigate("/users")} />
            <NavBtn label="Productivity Reports" onClick={() => navigate("/productivity/finalize")} />
            <NavBtn label="Audit Log"            onClick={() => navigate("/audit-log")} />
          </div>
        </SectionPanel>

        {/* Reports & Analytics */}
        <SectionPanel title="Reports & Analytics">
          <div className="grid grid-cols-2 gap-2">
            <NavBtn label="Project Analytics" onClick={() => navigate("/analytics")} />
            <NavBtn label="Combined Report"   onClick={() => navigate("/reports/combined")} />
            <NavBtn label="Reports Centre"    onClick={() => navigate("/reports/generate")} wide />
          </div>
        </SectionPanel>

        {/* Department Analytics */}
        <SectionPanel title="Department Analytics">
          <div className="grid grid-cols-3 gap-2">
            {[["Foreman","/analytics/foreman"],["QS / BOQ","/analytics/qs"],["Stores","/analytics/stores"],["SHE","/analytics/she"],["Finance","/analytics/finance"]].map(([label, path]) => (
              <button key={path} onClick={() => navigate(path)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 text-xs font-semibold shadow-sm transition-colors">{label}</button>
            ))}
          </div>
        </SectionPanel>

      </main>
    </div>
  );
}
