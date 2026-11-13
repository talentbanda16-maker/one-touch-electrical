import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const REPORTS = [
  {
    key: "daily",
    icon: "📅",
    title: "Daily Report",
    desc: "The full daily site report — project info, personnel on site, work completed, equipment & tools, materials, inspections, safety, problems, next-day plan and signatures.",
    to: "/reports/foreman?period=daily",
    accent: "#2563eb",
    tint: "#eff6ff",
  },
];

export default function ForemanReportsHub() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 hover:text-white text-xl leading-none">←</button>
        <div>
          <p className="text-sm text-slate-300">Reports</p>
          <p className="font-medium text-white">{user?.name}</p>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        <p className="text-sm text-slate-500">Choose which report to submit.</p>

        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => navigate(r.to)}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3 hover:border-brand-400 active:scale-[0.99] transition"
          >
            <span
              className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
              style={{ background: r.tint, color: r.accent }}
            >
              {r.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold text-slate-800">{r.title}</p>
                <span className="text-slate-300 text-lg">›</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{r.desc}</p>
            </div>
          </button>
        ))}
      </main>
    </div>
  );
}
