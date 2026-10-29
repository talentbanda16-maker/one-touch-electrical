import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ITEMS = [
  { label: "Grinder Procedure",              path: "/she/procedure/grinder" },
  { label: "Documented Information Control", path: "/she/procedure/documented-information" },
  { label: "System Procedure Index",         path: "/she/procedure/system-index" },
];

export default function SheProcedureMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-300 text-xl leading-none">←</button>
        <div>
          <p className="text-white font-bold text-sm">Procedure</p>
          <p className="text-slate-400 text-xs">{user?.name}</p>
        </div>
      </div>
      <div className="p-4 max-w-2xl mx-auto grid grid-cols-2 gap-3 pt-6">
        {ITEMS.map(({ label, path }) => (
          <button key={path} onClick={() => navigate(path)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-6 text-sm font-semibold shadow-sm transition-colors">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
