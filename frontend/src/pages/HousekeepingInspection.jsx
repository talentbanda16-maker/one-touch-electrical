import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const SECTIONS = [
  {
    title: "Working Areas",
    items: [
      "Stairways and gangways kept free of any electrical materials, supplies and obstructions.",
      "All open trenches, holes and excavations are effectively barricaded.",
      "First aid kit available and adequately stocked.",
      "Adequate lighting is available in all work areas during low visibility.",
      "All work areas without active electrical activities are free from any electrical installation waste.",
      "Kitchen and eating areas are clean and well maintained.",
    ],
  },
  {
    title: "Waste Management",
    items: [
      "Disposable PPE properly disposed.",
      "Waste properly segregated and disposed.",
      "All waste (pipe & conduit offcuts, cable packaging, cutting discs, containers, fittings packaging) has been disposed.",
    ],
  },
  {
    title: "Storage",
    items: [
      "All flammable and hazardous materials are properly stored in labeled containers.",
      "All ladders not in use are properly stored.",
      "Material returns and offcuts correctly stored for reuse.",
      "Storage areas (containers) are clean and well maintained.",
      "Unused tools and equipment are being stored in designated places.",
      "All cable drums properly stored and secured to prevent accidental rolling.",
    ],
  },
];

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = canvasRef.current; const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);
  function getPos(e, c) { const r = c.getBoundingClientRect(); const s = e.touches ? e.touches[0] : e; return { x: s.clientX - r.left, y: s.clientY - r.top }; }
  function start(e) { e.preventDefault(); drawing.current = true; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { e.preventDefault(); if (!drawing.current) return; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end(e) { e.preventDefault(); drawing.current = false; }
  function clear() { const c = canvasRef.current; const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <p className="text-sm font-bold text-slate-800">Sign here</p>
        <canvas ref={canvasRef} width={340} height={140}
          className="w-full border-2 border-slate-300 rounded-xl touch-none cursor-crosshair" style={{ background: "#fff" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="flex gap-2">
          <button onClick={clear} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Clear</button>
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(canvasRef.current.toDataURL("image/png"))} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function HousekeepingInspection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const [projectName, setProjectName] = useState("");
  const [date, setDate]               = useState(today);
  const [area, setArea]               = useState("");
  const [inspector, setInspector]     = useState("");

  // Build flat rows for all items across all sections
  const allItems = SECTIONS.flatMap((s) => s.items.map((text) => ({ section: s.title, text })));
  const [rows, setRows] = useState(() => allItems.map(() => ({ result: "", remarks: "" })));

  const [signingKey, setSigningKey]   = useState(null);
  const [signatures, setSignatures]   = useState({ inspector: null, supervisor: null });
  const [signerNames, setSignerNames] = useState({ inspector: "", supervisor: "" });
  const [signerDates, setSignerDates] = useState({ inspector: today, supervisor: today });
  const [success, setSuccess]         = useState("");

  useEffect(() => {
    const id = (() => { try { return localStorage.getItem("active_project") || ""; } catch { return ""; } })();
    if (!id) return;
    api.get("/projects").then((list) => {
      const p = list.find((x) => x.id === id);
      if (p) setProjectName(p.name);
    }).catch(() => {});
  }, []);

  function updateRow(i, field, val) {
    setRows((r) => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }
  function saveSignature(sig) { setSignatures((s) => ({ ...s, [signingKey]: sig })); setSigningKey(null); }

  const resultCls = (val, opt) => {
    const base = "px-2 py-1 rounded-lg text-xs font-bold border transition-colors ";
    if (val !== opt) return base + "border-slate-200 text-slate-400 bg-white";
    if (opt === "YES") return base + "border-green-500 text-green-700 bg-green-50";
    if (opt === "NO")  return base + "border-red-400 text-red-700 bg-red-50";
    return base + "border-slate-400 text-slate-600 bg-slate-100";
  };

  let globalIdx = 0;

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {signingKey && <SignaturePad onSave={saveSignature} onClose={() => setSigningKey(null)} />}

      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Housekeeping Inspection</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
        <button onClick={() => { setSuccess("Checklist saved."); setTimeout(() => setSuccess(""), 3000); }}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800">Save</button>
      </div>

      {success && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Document header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <tbody>
              <tr>
                <td rowSpan={3} className="border border-slate-300 p-2 text-center align-middle w-28">
                  <img src="/logo.png" alt="One Touch" className="w-24 mx-auto" />
                </td>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-black text-base text-slate-800 text-center align-middle">
                  SHEQ MANAGEMENT SYSTEM
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-green-600 text-center align-middle">
                  WEEKLY HOUSEKEEPING INSPECTION
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-700 align-middle">Initializing Department: SHEQ</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle w-24">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Header fields */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Project Name</label>
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Area / Location</label>
            <input type="text" value={area} onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Inspector</label>
            <input type="text" value={inspector} onChange={(e) => setInspector(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Checklist sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-brand-900 text-white">
              <p className="text-sm font-bold">{section.title}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {section.items.map((text) => {
                const i = globalIdx++;
                const row = rows[i];
                return (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      <p className="text-sm text-slate-700 flex-1">{text}</p>
                    </div>
                    <div className="flex gap-2 items-center pl-9">
                      {["YES", "NO", "N/A"].map((opt) => (
                        <button key={opt} type="button" onClick={() => updateRow(i, "result", opt)}
                          className={resultCls(row.result, opt)}>{opt}</button>
                      ))}
                      <textarea placeholder="Remarks" value={row.remarks}
                        onChange={(e) => { updateRow(i, "remarks", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                        rows={1}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none overflow-hidden" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Sign-off */}
        {[
          { key: "inspector", label: "SHE Inspector" },
          { key: "supervisor", label: "Site Supervisor" },
        ].map(({ key, label }) => (
          <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input type="text" value={signerNames[key]} onChange={(e) => setSignerNames((s) => ({ ...s, [key]: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                <input type="date" value={signerDates[key]} onChange={(e) => setSignerDates((s) => ({ ...s, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Signature</label>
              {signatures[key] ? (
                <button type="button" onClick={() => setSigningKey(key)}
                  className="w-full h-14 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
                  <img src={signatures[key]} alt="sig" className="max-h-12 object-contain" />
                </button>
              ) : (
                <button type="button" onClick={() => setSigningKey(key)}
                  className="w-full h-14 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                  Tap to sign
                </button>
              )}
            </div>
          </div>
        ))}

        <button onClick={() => { setSuccess("Checklist saved."); setTimeout(() => setSuccess(""), 3000); }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
          Save Checklist
        </button>

      </div>
    </div>
  );
}
