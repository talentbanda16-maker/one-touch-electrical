import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const GROUPS = [
  {
    label: "SHE Inspection",
    items: [
      { label: "Housekeeping Inspection", path: "/she/inspections/housekeeping" },
    ],
  },
  {
    label: "Quality Inspection",
    items: [
      { label: "Deck Tubing Checklist",              path: "/she/inspections/quality/deck-tubing" },
      { label: "Slab Tubing Checklist",              path: "/she/inspections/quality/slab-tubing" },
      { label: "Trenching & Sleeve Laying Checklist", path: "/she/inspections/quality/trenching" },
    ],
  },
];

export default function SheInspectionsMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-300 text-xl leading-none">←</button>
        <div>
          <p className="text-white font-bold text-sm">Inspections</p>
          <p className="text-slate-400 text-xs">{user?.name}</p>
        </div>
      </div>
      <div className="p-4 max-w-2xl mx-auto space-y-5 pt-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">{group.label}</p>
            <div className="grid grid-cols-2 gap-3">
              {group.items.map(({ label, path }) => (
                <button key={path} onClick={() => navigate(path)}
                  className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-6 text-sm font-semibold shadow-sm transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
