import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const DEPARTMENT_LABELS = { FOREMAN: "Foreman", QS: "QS", SHE: "SHE", STORES: "Stores", FINANCE: "Finance" };

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

const REPORT_TYPE_ROUTES = {
  FOREMAN: "/reports/foreman",
  QS: "/reports/qs",
  SHE: "/reports/she",
  STORES: "/reports/stores",
  FINANCE: "/reports/finance",
};

const REPORTING_ROLES = ["FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE"];

const fmt$ = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmt$dec = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v || 0);

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(null);
  const [returnedReports, setReturnedReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tmProjects, setTmProjects] = useState([]);
  const [finProjects, setFinProjects] = useState([]);
  const [finProjectId, setFinProjectId] = useState("");
  const [finProfitData, setFinProfitData] = useState(null);
  const [finPaidAmount, setFinPaidAmount] = useState(null);
  const [storesProjects, setStoresProjects] = useState([]);
  const [storesProjectId, setStoresProjectId] = useState(() => {
    try { return localStorage.getItem("stores_active_project") || ""; } catch { return ""; }
  });
  const [storesSummary, setStoresSummary] = useState(null);
  const [storesSummaryDate, setStoresSummaryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvedReqs, setApprovedReqs] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try { return localStorage.getItem("active_project") || ""; } catch { return ""; }
  });
  const [foremanStock, setForemanStock] = useState([]);
  const [foremanReqs, setForemanReqs] = useState([]);
  const [showForemanReqs, setShowForemanReqs] = useState(false);
  const [showForemanStock, setShowForemanStock] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [stockError, setStockError] = useState("");

  function saveActiveProject(id) {
    setActiveProjectId(id);
    try { localStorage.setItem("active_project", id); } catch {}
    if (user?.role === "FOREMAN" && id) {
      api.get(`/projects/${id}/stock-balance`).then((d) => { setForemanStock(d.items || []); setStockError(""); }).catch((e) => setStockError(e.message || "Failed to load stock"));
      api.get(`/projects/${id}/requisitions`).then(setForemanReqs).catch(() => {});
    }
  }

  async function handleFulfilReq(id) {
    try {
      await api.patch(`/requisitions/${id}/status`, { status: "FULFILLED" });
      setApprovedReqs((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  }

  // Roles with dedicated dashboards
  if (user?.role === "QS")       return <Navigate to="/dashboard/qs"       replace />;
  if (user?.role === "FINANCE")  return <Navigate to="/dashboard/finance"  replace />;
  if (user?.role === "ENGINEER") return <Navigate to="/dashboard/engineer" replace />;

  useEffect(() => {
    if (user?.role === "TECHNICAL_MANAGER" || user?.role === "ENGINEER") {
      api.get("/reports/pending").then((list) => setPendingCount(list.length)).catch(() => {});
      api.get("/dashboard/summary").then(setSummary).catch(() => {});
      api.get("/projects").then((data) => setTmProjects(data.filter((p) => p.status === "ACTIVE"))).catch(() => {});
    }
    if (REPORTING_ROLES.includes(user?.role)) {
      api.get("/reports/mine/returned").then(setReturnedReports).catch(() => {});
    }
    if (["FOREMAN", "SHE_OFFICER", "GENERAL_WORKER"].includes(user?.role)) {
      api.get("/projects").then((data) => {
        setAllProjects(data);
        const saved = (() => { try { return localStorage.getItem("active_project"); } catch { return null; } })();
        const validId = data.find((p) => p.id === saved)?.id;
        const defaultId = validId || (data.length > 0 ? data[0].id : "");
        saveActiveProject(defaultId);
        if (user?.role === "FOREMAN" && defaultId) {
          api.get(`/projects/${defaultId}/stock-balance`).then((d) => { setForemanStock(d.items || []); setStockError(""); }).catch((e) => setStockError(e.message || "Failed to load stock"));
          api.get(`/projects/${defaultId}/requisitions`).then(setForemanReqs).catch(() => {});
        }
      }).catch(() => {});
    }
    if (user?.role === "FINANCE") {
      api.get("/projects").then((data) => {
        setFinProjects(data);
        if (data.length > 0) setFinProjectId(data[0].id);
      }).catch(() => {});
    }
    if (user?.role === "STORESMAN") {
      api.get("/projects").then((data) => {
        setStoresProjects(data);
        const saved = (() => { try { return localStorage.getItem("stores_active_project"); } catch { return null; } })();
        const validId = data.find((p) => p.id === saved)?.id;
        const defaultId = validId || (data.length > 0 ? data[0].id : "");
        setStoresProjectId(defaultId);
        try { localStorage.setItem("stores_active_project", defaultId); } catch {}
        if (defaultId) {
          const d = new Date().toISOString().slice(0, 10);
          api.get(`/dashboard/stores-summary?projectId=${defaultId}&date=${d}`).then(setStoresSummary).catch(() => {});
          api.get(`/projects/${defaultId}/requisitions`).then((list) => setApprovedReqs(list.filter((r) => r.status === "APPROVED"))).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "FOREMAN" || !activeProjectId) return;
    api.get(`/projects/${activeProjectId}/stock-balance`)
      .then((d) => { setForemanStock(d.items || []); setStockError(""); })
      .catch((e) => setStockError(e.message || "Failed to load stock"));
    api.get(`/projects/${activeProjectId}/requisitions`)
      .then(setForemanReqs)
      .catch(() => {});
  }, [user?.role, activeProjectId]);

  useEffect(() => {
    if (user?.role !== "FINANCE" || !finProjectId) return;
    setFinProfitData(null);
    setFinPaidAmount(null);
    Promise.all([
      api.get(`/dashboard/income-items?projectId=${finProjectId}`).catch(() => []),
      api.get(`/dashboard/expense-items?projectId=${finProjectId}`).catch(() => []),
      api.get(`/dashboard/project-paid?projectId=${finProjectId}`).catch(() => ({ paidAmount: 0 })),
    ]).then(([income, expense, paidData]) => {
      const incomeTotal  = income.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      const expenseTotal = expense.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      setFinProfitData({ incomeTotal, expenseTotal, incomeItems: income, expenseItems: expense });
      setFinPaidAmount(parseFloat(paidData?.paidAmount) || 0);
    });
  }, [finProjectId, user?.role]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const BTN_ICONS = {
    "Management Dashboard": "🏢", "Review Reports": "📋", "Instructions": "📌",
    "Actions": "✅", "My Instructions": "📌", "My Actions": "✅",
    "Manage Projects": "📁", "Manage Users": "👥", "Productivity Reports": "📊",
    "Audit Log": "🔍", "Project Analytics": "📈", "Combined Report": "📄",
    "Reports Centre": "📑", "Submit Daily Report": "📝", "Review Productivity": "⭐",
    "+ Submit SHE Report": "⚠️", "SHE Reports": "📋", "Incident Report": "🚨",
    "Policy": "📜", "Procedure": "📋", "SHE Training": "🎓", "Inspections": "🔎",
    "SHE Complaints": "📣", "Legal Register": "⚖️", "Risk Register": "⚠️",
    "Submit Finance Report": "💰", "QS Claim Payments": "💳",
    "Submit Productivity Report": "📊",
  };

  const NavBtn = ({ label, onClick, wide = false, badge, color = "blue" }) => {
    const isWhite = color === "white";
    const gradient = color === "red"   ? "linear-gradient(135deg,#ef4444,#b91c1c)"
                   : color === "amber" ? "linear-gradient(135deg,#f59e0b,#d97706)"
                   : isWhite           ? "#ffffff"
                   :                    "linear-gradient(135deg,#1a56db,#1743b0)";
    const shadow   = color === "red"   ? "0 4px 14px rgba(220,38,38,0.35)"
                   : color === "amber" ? "0 4px 14px rgba(245,158,11,0.35)"
                   : isWhite           ? "0 2px 8px rgba(0,0,0,0.08)"
                   :                    "0 4px 14px rgba(26,86,219,0.35)";
    const textColor = isWhite ? "#1e293b" : "white";
    const icon = BTN_ICONS[label];
    return (
      <button onClick={onClick}
        className={`${wide ? "col-span-2" : ""} rounded-xl py-4 text-sm font-semibold flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95`}
        style={{ background: gradient, boxShadow: shadow, color: textColor, border: isWhite ? "1px solid #e2e8f0" : "none" }}>
        {icon && <span style={{ fontSize: "1.375rem", lineHeight: 1 }}>{icon}</span>}
        <span>{label}</span>
        {badge != null && badge > 0 && <span className="bg-white text-slate-800 text-xs font-black px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
      </button>
    );
  };

  const SectionCard = ({ title, color = "blue", children }) => {
    const barColor = color === "red" ? "bg-red-500" : color === "amber" ? "bg-amber-500" : "bg-brand-600";
    const bgColor  = color === "red" ? "bg-red-50 border-red-100" : color === "amber" ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100";
    return (
      <div className="section-card">
        <div className={`section-header ${bgColor}`}>
          <div className={`accent-bar ${barColor}`} />
          <h3>{title}</h3>
        </div>
        <div className="p-3">{children}</div>
      </div>
    );
  };

  const SectionLabel = ({ text }) => (
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 pt-1">{text}</p>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="One Touch" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shadow" />
          <div>
            <p className="text-white font-bold text-sm leading-tight">One Touch Electrical</p>
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5"
              style={{ background: "rgba(255,255,255,0.12)", color: "#93c5fd" }}>
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/settings")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">⚙️ Settings</button>
          <button onClick={logout} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">Log out</button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">

        {/* Greeting card */}
        <div className="rounded-2xl overflow-hidden shadow-sm relative" style={{ background: "linear-gradient(135deg, #0f1f3d 0%, #1a3a6e 100%)" }}>
          {/* Decorative glow orbs */}
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"rgba(59,130,246,0.15)", filter:"blur(30px)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-20, left:"30%", width:80, height:80, borderRadius:"50%", background:"rgba(245,158,11,0.1)", filter:"blur(20px)", pointerEvents:"none" }} />
          <div className="px-5 py-4 space-y-1 relative">
            <p className="text-xs font-semibold tracking-wide" style={{ color: "#60a5fa" }}>{dateStr}</p>
            <p className="text-xl font-bold text-white">{greeting}, {user?.name} 👋</p>
          </div>
          {(user?.role === "TECHNICAL_MANAGER" || user?.role === "ENGINEER") && summary && (
            <div className="px-5 pb-4 flex flex-wrap gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#bfdbfe" }}>{summary.activeProjects} active project{summary.activeProjects !== 1 ? "s" : ""}</span>
              {summary.reportsToday > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#bbf7d0" }}>{summary.reportsToday} report{summary.reportsToday !== 1 ? "s" : ""} today</span>}
              {summary.pendingApprovals > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#fde68a" }}>{summary.pendingApprovals} pending</span>}
              {summary.overdueActions > 0 && <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#fca5a5" }}>{summary.overdueActions} overdue</span>}
            </div>
          )}
        </div>

        {returnedReports.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <h2 className="font-semibold text-amber-900">{returnedReports.length} report{returnedReports.length > 1 ? "s" : ""} returned for correction</h2>
            {returnedReports.map((r) => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-md p-2 text-sm space-y-1">
                <div className="font-medium">{r.project.name} · {new Date(r.reportDate).toLocaleDateString()}</div>
                <div className="text-amber-800">Reason: {r.returnReason}</div>
                <button type="button" onClick={() => navigate(`${REPORT_TYPE_ROUTES[r.type]}?edit=${r.id}`)} className="text-blue-600 font-semibold">Edit &amp; resubmit →</button>
              </div>
            ))}
          </div>
        )}

        {/* ── TECHNICAL MANAGER / ENGINEER ── */}
        {(user?.role === "TECHNICAL_MANAGER" || user?.role === "ENGINEER") && (
          <>
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
                <h2 className="text-sm font-bold text-slate-700 mb-3" style={{display:"none"}}>Reports submitted today</h2>
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

            {/* Operations */}
            <SectionCard title="Operations">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Management Dashboard" onClick={() => navigate("/dashboard/management")} wide />
                <NavBtn label="Review Reports"        onClick={() => navigate("/approvals")} badge={pendingCount} color={pendingCount > 0 ? "amber" : "blue"} />
                <NavBtn label="Instructions"          onClick={() => navigate("/instructions")} />
                <NavBtn label="Actions"               onClick={() => navigate("/actions")} />
              </div>
            </SectionCard>

            {/* Team & Admin */}
            <SectionCard title="Team & Admin">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Manage Projects"       onClick={() => navigate("/projects")} />
                <NavBtn label="Manage Users"          onClick={() => navigate("/users")} />
                <NavBtn label="Productivity Reports"  onClick={() => navigate("/productivity/finalize")} />
                <NavBtn label="Audit Log"             onClick={() => navigate("/audit-log")} />
              </div>
            </SectionCard>

            {/* Reports & Analytics */}
            <SectionCard title="Reports & Analytics">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Project Analytics"     onClick={() => navigate("/analytics")} />
                <NavBtn label="Combined Report"       onClick={() => navigate("/reports/combined")} />
                <NavBtn label="Reports Centre"        onClick={() => navigate("/reports/generate")} wide />
              </div>
            </SectionCard>

            {/* Department analytics */}
            <SectionCard title="Department Analytics">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["📝 Foreman",  "/analytics/foreman", "blue"],
                  ["📐 QS / BOQ", "/analytics/qs",      "blue"],
                  ["📦 Stores",   "/analytics/stores",  "amber"],
                  ["⚠️ SHE",      "/analytics/she",     "red"],
                  ["💰 Finance",  "/analytics/finance", "amber"],
                ].map(([label, path, color]) => {
                  const cls = color === "red" ? "bg-red-600 hover:bg-red-700" : color === "amber" ? "bg-amber-500 hover:bg-amber-600" : "bg-brand-600 hover:bg-brand-700";
                  return <button key={path} onClick={() => navigate(path)} className={`${cls} text-white rounded-xl py-3 text-xs font-semibold shadow-sm transition-colors`}>{label}</button>;
                })}
              </div>
            </SectionCard>
          </>
        )}

        {/* ── MANAGEMENT ── */}
        {user?.role === "MANAGEMENT" && (
          <>
            <SectionCard title="Overview">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Management Dashboard" onClick={() => navigate("/dashboard/management")} wide />
                <NavBtn label="Project Analytics"    onClick={() => navigate("/analytics")} />
                <NavBtn label="Productivity Reports" onClick={() => navigate("/productivity/finalize")} />
                <NavBtn label="Audit Log"            onClick={() => navigate("/audit-log")} />
                <NavBtn label="Reports Centre"       onClick={() => navigate("/reports/generate")} wide />
              </div>
            </SectionCard>
            <SectionCard title="Department Analytics">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["📝 Foreman",  "/analytics/foreman", "blue"],
                  ["📐 QS / BOQ", "/analytics/qs",      "blue"],
                  ["📦 Stores",   "/analytics/stores",  "amber"],
                  ["⚠️ SHE",      "/analytics/she",     "red"],
                  ["💰 Finance",  "/analytics/finance", "amber"],
                ].map(([label, path, color]) => {
                  const cls = color === "red" ? "bg-red-600 hover:bg-red-700" : color === "amber" ? "bg-amber-500 hover:bg-amber-600" : "bg-brand-600 hover:bg-brand-700";
                  return <button key={path} onClick={() => navigate(path)} className={`${cls} text-white rounded-xl py-3 text-xs font-semibold shadow-sm transition-colors`}>{label}</button>;
                })}
              </div>
            </SectionCard>
          </>
        )}

        {/* ── FOREMAN ── */}
        {user?.role === "FOREMAN" && (
          <div className="space-y-3">
            <ActiveProjectCard projects={allProjects} value={activeProjectId} onChange={saveActiveProject} />
            <div className="grid grid-cols-2 gap-3">
              <NavBtn label="Submit Daily Report"   onClick={() => navigate("/reports/foreman")} wide />
              <NavBtn label="Review Productivity"   onClick={() => navigate("/productivity/review")} wide />
              <NavBtn label="My Instructions"       onClick={() => navigate("/instructions")} />
              <NavBtn label="My Actions"            onClick={() => navigate("/actions")} />
              <NavBtn label="Material Request"      onClick={() => navigate("/reports/material-request")} wide />
              <NavBtn label="My Requests"           onClick={() => setShowForemanReqs((v) => !v)} wide />
              <NavBtn label="Stores Report"         onClick={() => setShowForemanStock((v) => !v)} wide />
            </div>

            {/* My Requests */}
            {showForemanReqs && foremanReqs.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">My Requests</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {foremanReqs.map((r) => {
                    const badge = r.status === "APPROVED" ? "bg-blue-100 text-blue-700"
                      : r.status === "FULFILLED" ? "bg-green-100 text-green-700"
                      : r.status === "REJECTED"  ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700";
                    return (
                      <li key={r.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.refNumber && (
                            <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">{r.refNumber}</span>
                          )}
                          <span className="text-sm font-medium text-slate-900">{r.itemName}</span>
                          <span className="text-sm text-slate-500">× {r.quantityRequested}{r.unit ? ` ${r.unit}` : ""}</span>
                          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{r.status}</span>
                        </div>
                        {r.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 border border-red-100 rounded px-2 py-1">Reason: {r.rejectionReason}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Stores Report */}
            {showForemanStock && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search items..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-800">Current Stock Levels</p>
                  </div>
                  {stockError ? (
                    <p className="px-4 py-6 text-sm text-red-500 text-center">{stockError}</p>
                  ) : foremanStock.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">No stock data yet — Stores reports must be approved first.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide">
                            <th className="px-4 py-2 text-left text-slate-500">Item</th>
                            <th className="px-3 py-2 text-right text-green-600">Received</th>
                            <th className="px-3 py-2 text-right text-blue-600">Issued</th>
                            <th className="px-3 py-2 text-right text-amber-500">Returned</th>
                            <th className="px-3 py-2 text-right text-red-500">Damaged</th>
                            <th className="px-3 py-2 text-right text-slate-800">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {foremanStock
                            .filter((item) => item.itemName.toLowerCase().includes(stockSearch.toLowerCase()))
                            .map((item) => (
                              <tr key={item.itemName} className="border-b border-slate-50 last:border-0">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-slate-800">{item.itemName}</p>
                                  {item.lastDate && <p className="text-xs text-slate-400">Last updated: {new Date(item.lastDate).toLocaleDateString()}</p>}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-green-600">{item.received ?? 0}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-blue-600">{item.issued ?? 0}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-amber-500">{item.returned ?? 0}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-red-500">{item.damagedLost ?? 0}</td>
                                <td className={`px-3 py-2.5 text-right font-black ${item.balance <= 0 ? "text-red-600" : "text-slate-900"}`}>
                                  {item.balance} {item.unit || ""}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SHE OFFICER ── */}
        {user?.role === "SHE_OFFICER" && (
          <div className="space-y-3">
            <ActiveProjectCard projects={allProjects} value={activeProjectId} onChange={saveActiveProject} />

            <SectionCard title="Reports" color="red">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="+ Submit SHE Report" onClick={() => navigate("/reports/she")} wide color="white" />
                <NavBtn label="SHE Reports"         onClick={() => navigate("/she/reports-menu")} color="white" />
                <NavBtn label="Incident Report"     onClick={() => navigate("/reports/she-incident")} color="white" />
              </div>
            </SectionCard>

            <SectionCard title="Policy & Procedure" color="red">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Policy"    onClick={() => navigate("/she/policy")} color="white" />
                <NavBtn label="Procedure" onClick={() => navigate("/she/procedure-menu")} color="white" />
              </div>
            </SectionCard>

            <SectionCard title="Training" color="red">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="SHE Training" onClick={() => navigate("/she/training-menu")} wide color="white" />
              </div>
            </SectionCard>

            <SectionCard title="Inspections" color="red">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="Inspections" onClick={() => navigate("/she/inspections-menu")} wide color="white" />
              </div>
            </SectionCard>

            <SectionCard title="Registers" color="red">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="SHE Complaints" onClick={() => navigate("/she/register/complaints")} color="white" />
                <NavBtn label="Legal Register"  onClick={() => navigate("/she/register/legal")} color="white" />
                <NavBtn label="Risk Register"   onClick={() => navigate("/she/register/risk")} wide color="white" />
              </div>
            </SectionCard>

            <SectionCard title="General">
              <div className="grid grid-cols-2 gap-2">
                <NavBtn label="My Instructions" onClick={() => navigate("/instructions")} />
                <NavBtn label="My Actions"      onClick={() => navigate("/actions")} />
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── STORESMAN ── */}
        {user?.role === "STORESMAN" && (
          <div className="space-y-3">
            {/* Active project selector */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Active Project</p>
              <select
                value={storesProjectId}
                onChange={(e) => {
                  setStoresProjectId(e.target.value);
                  try { localStorage.setItem("stores_active_project", e.target.value); } catch {}
                  setStoresSummary(null);
                  api.get(`/dashboard/stores-summary?projectId=${e.target.value}&date=${storesSummaryDate}`).then(setStoresSummary).catch(() => {});
                  api.get(`/projects/${e.target.value}/requisitions`).then((list) => setApprovedReqs(list.filter((r) => r.status === "APPROVED"))).catch(() => {});
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {storesProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
            {/* Summary tiles */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Activity</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Received",    value: storesSummary?.receivedToday, color: "text-green-700" },
                  { label: "Issued",      value: storesSummary?.issuedToday,   color: "text-blue-700" },
                  { label: "Returned",    value: storesSummary?.returnedToday, color: "text-amber-600" },
                  { label: "Total Items", value: storesSummary?.totalItems,    color: "text-slate-800" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className={`text-3xl font-black ${color}`}>{value ?? "—"}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Low stock alert */}
            {storesSummary?.lowStock?.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <p className="text-sm font-bold text-amber-800">
                    {storesSummary.lowStock.length} item{storesSummary.lowStock.length > 1 ? "s" : ""} running low
                  </p>
                </div>
                {storesSummary.lowStock.map((item) => (
                  <div key={item.name} className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      {item.balance} left
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Out of stock alert */}
            {storesSummary?.outOfStock?.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 text-lg">⚠️</span>
                  <p className="text-sm font-bold text-red-800">
                    {storesSummary.outOfStock.length} item{storesSummary.outOfStock.length > 1 ? "s" : ""} out of stock
                  </p>
                </div>
                {storesSummary.outOfStock.map((item) => (
                  <div key={item.name} className="flex items-center justify-between bg-white border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <span className="text-xs font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                      {item.balance < 0 ? item.balance : "0"} units
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Approved requisitions — fulfil inline */}
            {approvedReqs.length > 0 && (
              <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-green-100 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <p className="text-sm font-bold text-slate-800">Approved — ready to fulfil</p>
                  <span className="ml-auto text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                    {approvedReqs.length}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {approvedReqs.map((r) => (
                    <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
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
                        <div className="text-xs text-slate-400 mt-0.5">by {r.requestedBy?.name}</div>
                      </div>
                      <button
                        onClick={() => handleFulfilReq(r.id)}
                        className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5 hover:bg-green-100 shrink-0"
                      >
                        Mark fulfilled
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Movements */}
            <SectionCard title="Movements" color="amber">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "📦 Material Received",  path: "/reports/material-received" },
                  { label: "📤 Material Issued",    path: "/reports/material-issued" },
                  { label: "↩️ Return to Supplier", path: "/reports/return-to-supplier" },
                  { label: "📋 Material Request",   path: "/reports/material-request" },
                ].map(({ label, path }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-4 text-sm font-semibold transition-colors text-center">
                    {label}
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Inventory" color="amber">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "🔢 Stock Count",  path: "/reports/stock-count" },
                  { label: "📊 Stock Report", path: "/reports/stock-report" },
                ].map(({ label, path }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-4 text-sm font-semibold transition-colors text-center">
                    {label}
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Reports & General" color="amber">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "🏪 Stores Report",   path: "/reports/stores" },
                  { label: "📌 My Instructions", path: "/instructions" },
                  { label: "✅ My Actions",      path: "/actions" },
                ].map(({ label, path }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-4 text-sm font-semibold transition-colors text-center">
                    {label}
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── GENERAL WORKER ── */}
        {user?.role === "GENERAL_WORKER" && (
          <div className="space-y-3">
            <ActiveProjectCard projects={allProjects} value={activeProjectId} onChange={saveActiveProject} />
            <div className="grid grid-cols-2 gap-3">
              <NavBtn label="Submit Productivity Report" onClick={() => navigate("/reports/productivity")} wide />
              <NavBtn label="My Instructions"            onClick={() => navigate("/instructions")} />
              <NavBtn label="My Actions"                 onClick={() => navigate("/actions")} />
            </div>
          </div>
        )}

        {/* ── FINANCE (legacy path — redirected above but kept as fallback) ── */}
        {user?.role === "FINANCE" && finProjects.length > 0 && (
          <select value={finProjectId} onChange={(e) => setFinProjectId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base bg-white">
            {finProjects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        )}
        {user?.role === "FINANCE" && (
          <div className="grid grid-cols-2 gap-3">
            <NavBtn label="Submit Finance Report" onClick={() => navigate("/reports/finance")} color="amber" />
            <NavBtn label="QS Claim Payments"     onClick={() => navigate("/qs-payments")} color="amber" />
          </div>
        )}

        {/* Finance — read-only Profit / Loss card */}
        {user?.role === "FINANCE" && finProjects.length > 0 && (() => {
          const profit      = finProfitData ? finProfitData.incomeTotal - finProfitData.expenseTotal : null;
          const isProfit    = profit == null || profit >= 0;
          const marginPct   = finProfitData && finProfitData.incomeTotal > 0
            ? Math.round((profit / finProfitData.incomeTotal) * 100) : null;
          const hasData     = finProfitData && (finProfitData.incomeTotal > 0 || finProfitData.expenseTotal > 0);
          const selProject  = finProjects.find(p => p.id === finProjectId);
          const contractVal = parseFloat(selProject?.contractValue) || 0;
          const paid        = finPaidAmount ?? 0;
          const receivedPct = contractVal > 0 ? Math.min(100, Math.round((paid / contractVal) * 100)) : 0;
          const notReceived = Math.max(0, contractVal - paid);
          const pie2Data    = contractVal > 0
            ? [{ name: "Payment Received", value: Math.min(paid, contractVal) }, { name: "Not Yet Received", value: notReceived }]
            : [];
          const PIE2_COLORS = ["#15803d", "#cbd5e1"];
          return (
            <div className="space-y-3">
              {/* Profit / Loss card */}
              {!finProfitData ? (
                <p className="text-xs text-slate-400 text-center py-2">Loading…</p>
              ) : !hasData ? (
                <p className="text-xs text-slate-400 text-center py-3 bg-white rounded-xl border border-slate-200">No profitability data entered by QS yet.</p>
              ) : (
                <div className={`rounded-xl border-2 p-4 space-y-3 ${isProfit ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${isProfit ? "text-green-700" : "text-red-700"}`}>{isProfit ? "Profit" : "Loss"}</p>
                      <p className={`text-2xl font-black ${isProfit ? "text-green-800" : "text-red-800"}`}>{isProfit ? "+" : "-"}{fmt$(Math.abs(profit))}</p>
                      <p className={`text-xs mt-0.5 ${isProfit ? "text-green-600" : "text-red-600"}`}>Income Received − Project Expenses</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black ${isProfit ? "text-green-700" : "text-red-700"}`}>{marginPct != null ? `${marginPct}%` : "—"}</p>
                      <p className={`text-xs font-semibold ${isProfit ? "text-green-600" : "text-red-600"}`}>Margin</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white bg-opacity-60 rounded-lg p-2 text-center">
                      <p className="text-green-700 mb-0.5">Income Received</p>
                      <p className="font-bold text-slate-800">{fmt$(finProfitData.incomeTotal)}</p>
                    </div>
                    <div className="bg-white bg-opacity-60 rounded-lg p-2 text-center">
                      <p className="text-slate-500 mb-0.5">Project Expenses</p>
                      <p className="font-bold text-slate-800">{fmt$(finProfitData.expenseTotal)}</p>
                    </div>
                  </div>
                  {(finProfitData.incomeItems.length > 0 || finProfitData.expenseItems.length > 0) && (
                    <div className="grid grid-cols-2 gap-2">
                      {[{ label: "Income Received", items: finProfitData.incomeItems, color: "text-green-700" },
                        { label: "Project Expenses", items: finProfitData.expenseItems, color: "text-red-700" }]
                        .map(({ label, items, color }) => items.length > 0 && (
                          <div key={label} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <p className={`text-xs font-bold px-2 py-1.5 border-b border-slate-100 ${color}`}>{label}</p>
                            {items.map((item) => (
                              <div key={item.id} className="flex justify-between px-2 py-1 border-b border-slate-50 text-xs">
                                <span className="text-slate-700 truncate pr-1">{item.description}</span>
                                <span className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmt$dec(parseFloat(item.amount))}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Contract Sum vs Payment Received chart */}
              {pie2Data.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Contract Sum vs Payment Received</p>
                  <p className="text-xs text-slate-400 mb-3">{selProject?.name}</p>
                  <div className="flex flex-col items-center">
                    <div style={{ width: "100%", height: 200, position: "relative" }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={pie2Data} cx="50%" cy="50%" innerRadius={55} outerRadius={82} dataKey="value"
                            startAngle={90} endAngle={-270} paddingAngle={2} strokeWidth={0}>
                            {pie2Data.map((_, i) => <Cell key={i} fill={PIE2_COLORS[i]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                            formatter={(v) => [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: "#15803d" }}>{receivedPct}%</span>
                        <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>RECEIVED</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 mt-1">
                      {pie2Data.map((entry, i) => (
                        <div key={entry.name} className="flex flex-col items-center gap-0.5">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: PIE2_COLORS[i] }} />
                            {entry.name}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(entry.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </main>
    </div>
  );
}

function ActiveProjectCard({ projects, value, onChange }) {
  if (!projects.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Active Project</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
        ))}
      </select>
    </div>
  );
}

function StatTile({ label, value, onClick, alert = false, alertText, wide = false, color = "slate" }) {
  const styles = {
    slate: { bg: "#ffffff", accent: "#94a3b8", val: "#0f172a",  lbl: "#64748b", border: "#e2e8f0" },
    blue:  { bg: "linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)", accent: "#1a56db", val: "#1e3a8a", lbl: "#2563eb", border: "#bfdbfe" },
    green: { bg: "linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)", accent: "#16a34a", val: "#14532d", lbl: "#16a34a", border: "#bbf7d0" },
    amber: { bg: "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)", accent: "#d97706", val: "#78350f", lbl: "#b45309", border: "#fde68a" },
    red:   { bg: "linear-gradient(135deg,#fff1f2 0%,#ffe4e6 100%)", accent: "#dc2626", val: "#7f1d1d", lbl: "#dc2626", border: "#fecdd3" },
  };
  const s = styles[color] || styles.slate;
  return (
    <button onClick={onClick}
      className={`${wide ? "col-span-2" : ""} text-left rounded-xl p-4 shadow-sm transition-all active:scale-95`}
      style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.accent}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: "1.875rem", fontWeight: 900, color: s.val, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value ?? "—"}</div>
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: s.lbl, marginTop: 5, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      {alert && <div style={{ fontSize: "0.6875rem", fontWeight: 700, marginTop: 4, color: "#dc2626" }}>⚠ {alertText}</div>}
    </button>
  );
}
