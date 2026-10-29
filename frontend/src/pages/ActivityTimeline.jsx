import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const ACTION_LABELS = {
  REQUISITION_CREATED: "Requisition created",
  REQUISITION_APPROVED: "Requisition approved",
  REQUISITION_REJECTED: "Requisition rejected",
  REQUISITION_RESOLVED: "Requisition fulfilled",
  REQUISITION_ARCHIVED: "Requisition archived",
  BOM_ITEM_ADDED: "BOM item added",
  BOQ_UPLOADED: "BOQ uploaded",
  REPORT_SUBMITTED: "Report submitted",
  ACTION_CREATED: "Action created",
  ACTION_UPDATED: "Action updated",
  ACTION_CLOSED: "Action closed",
  INSTRUCTION_CREATED: "Instruction created",
  INSTRUCTION_UPDATED: "Instruction updated",
  INSTRUCTION_CLOSED: "Instruction closed",
  USAGE_LOGGED: "Material usage logged",
  STOCK_RECEIVED: "Stock received",
  PROJECT_UPDATED: "Project updated",
};

const ACTION_COLORS = {
  REQUISITION_APPROVED: "bg-green-500",
  REQUISITION_REJECTED: "bg-red-500",
  REQUISITION_CREATED: "bg-blue-500",
  REQUISITION_RESOLVED: "bg-emerald-500",
  BOM_ITEM_ADDED: "bg-purple-500",
  BOQ_UPLOADED: "bg-indigo-500",
  REPORT_SUBMITTED: "bg-sky-500",
  ACTION_CLOSED: "bg-green-500",
  INSTRUCTION_CLOSED: "bg-green-500",
  ACTION_CREATED: "bg-amber-500",
  INSTRUCTION_CREATED: "bg-amber-500",
  USAGE_LOGGED: "bg-orange-500",
  STOCK_RECEIVED: "bg-teal-500",
  PROJECT_UPDATED: "bg-slate-500",
};

const ROLE_LABELS = {
  TECHNICAL_MANAGER: "TM",
  MANAGEMENT: "Mgmt",
  QS: "QS",
  FOREMAN: "Foreman",
  STORESMAN: "Stores",
  FINANCE: "Finance",
  SHE_OFFICER: "SHE",
  ENGINEER: "Engineer",
  GENERAL_WORKER: "Worker",
};

function dot(action) {
  return ACTION_COLORS[action] || "bg-slate-400";
}

function label(action) {
  return ACTION_LABELS[action] || action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupByDate(logs) {
  const groups = [];
  let current = null;
  for (const log of logs) {
    const day = new Date(log.createdAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (!current || current.day !== day) {
      current = { day, items: [] };
      groups.push(current);
    }
    current.items.push(log);
  }
  return groups;
}

export default function ActivityTimeline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterAction, setFilterAction] = useState("");

  useEffect(() => {
    api.get("/projects").then((list) => {
      const active = list.filter((p) => !p.isArchived);
      setProjects(active);
      if (active.length > 0) setProjectId(active[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/audit/project/${projectId}/timeline`)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = filterAction ? logs.filter((l) => l.action === filterAction) : logs;
  const groups = groupByDate(filtered);
  const actionTypes = [...new Set(logs.map((l) => l.action))].sort();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-400">Activity Timeline</p>
          <p className="font-semibold text-white">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors">Back</button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Project + filter controls */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All events</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>{label(a)}</option>
            ))}
          </select>
        </div>

        {loading && <p className="text-center text-slate-400 py-8">Loading timeline…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-slate-400 py-8">No events found.</p>
        )}

        {/* Timeline */}
        {groups.map((group) => (
          <div key={group.day}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{group.day}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
              <ul className="space-y-3 pl-8">
                {group.items.map((log) => (
                  <li key={log.id} className="relative">
                    {/* Dot */}
                    <span className={`absolute -left-5 top-1.5 w-3 h-3 rounded-full ${dot(log.action)} ring-2 ring-white`} />
                    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{label(log.action)}</p>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{relativeTime(log.createdAt)}</span>
                      </div>
                      {log.user && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {log.user.name}
                          <span className="ml-1 text-slate-400">· {ROLE_LABELS[log.user.role] || log.user.role}</span>
                        </p>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(log.metadata)
                            .filter(([k]) => !["projectId", "bulk"].includes(k))
                            .slice(0, 4)
                            .map(([k, v]) => (
                              <span key={k} className="inline-block text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
                                {k}: {String(v).slice(0, 40)}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
