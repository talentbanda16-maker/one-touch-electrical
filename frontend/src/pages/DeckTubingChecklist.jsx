import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const SECTION_A = [
  "All Electrical Conduits routes and points are properly marked and installed.",
  "All Alarms routes and points properly marked and installed.",
  "All Camera routes and points are properly marked and installed.",
  "All Data points routes and points properly marked and installed.",
  "All conduit sizing tubing and routing done according to work plan.",
  "All Conduits properly bend and without distortion.",
  "All conduits and pipe joints are properly glued and secured to the mesh wire.",
  "All conduits connecting to wall sockets are clearly exposed and at least 50cm from mesh wire surface.",
  "All exposed conduits and pipe ends are clearly sealed to prevent entrance of foreign materials.",
  "Junction boxes points have been installed for conduits more than 25 metre long.",
  "DB points properly installed and all pipes have been sealed.",
  "All points connecting to the ground floor have been properly chased and the conduits are visible and secure.",
  "All round boxes, flash boxes in the deck have been properly covered and secured.",
  "Earth wire pipes have been connected to continue from the ground from the floor below.",
  "Junction boxes points have been installed for conduits more than 25 metre long.",
  "Works approved by Consulting Engineer before concrete pouring.",
];

const SECTION_B = [
  "All conduits and pipes connecting to wall sockets are clearly visible and well maintained.",
  "Minimal disturbance to the electrical conduits and pipes.",
  "All damaged pipes post concrete pouring have been replaced.",
];

const newItem = () => ({ result: "", remarks: "" });

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
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

export default function DeckTubingChecklist() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [projectName, setProjectName] = useState("");
  const [contractor, setContractor] = useState("");
  const [refDrawing, setRefDrawing] = useState("");
  const [date, setDate] = useState(today);
  const [teamLeader, setTeamLeader] = useState("");
  const [workArea, setWorkArea] = useState("");
  const [sectionA, setSectionA] = useState(() => SECTION_A.map(newItem));
  const [sectionB, setSectionB] = useState(() => SECTION_B.map(newItem));
  const [deviations, setDeviations] = useState("");
  const [signingKey, setSigningKey] = useState(null);
  const [signatures, setSignatures] = useState({ inspector: null, supervisor: null, engineer: null });
  const [signerNames, setSignerNames] = useState({ inspector: "", supervisor: "", engineer: "" });
  const [signerDates, setSignerDates] = useState({ inspector: today, supervisor: today, engineer: today });
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const id = (() => { try { return localStorage.getItem("active_project") || ""; } catch { return ""; } })();
    if (!id) return;
    api.get("/projects").then((list) => {
      const p = list.find((x) => x.id === id);
      if (p) setProjectName(p.name);
    }).catch(() => {});
  }, []);

  function updateA(idx, field, val) { setSectionA((s) => s.map((r, i) => i === idx ? { ...r, [field]: val } : r)); }
  function updateB(idx, field, val) { setSectionB((s) => s.map((r, i) => i === idx ? { ...r, [field]: val } : r)); }

  function saveSignature(sig) {
    setSignatures((s) => ({ ...s, [signingKey]: sig }));
    setSigningKey(null);
  }

  function handleSave() {
    setSuccess("Checklist saved.");
    setTimeout(() => setSuccess(""), 3000);
  }

  const resultCls = (val, opt) => {
    const base = "px-2 py-1 rounded-lg text-xs font-bold border transition-colors ";
    if (val !== opt) return base + "border-slate-200 text-slate-400 bg-white";
    if (opt === "YES") return base + "border-green-500 text-green-700 bg-green-50";
    if (opt === "NO")  return base + "border-red-400 text-red-700 bg-red-50";
    return base + "border-slate-400 text-slate-600 bg-slate-100";
  };

  function ChecklistSection({ title, items, onUpdate }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-bold text-slate-800">{title}</p>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((row, idx) => (
            <div key={idx} className="px-4 py-3 space-y-2">
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                <p className="text-sm text-slate-700 flex-1">{title === "Section A: Installation" ? SECTION_A[idx] : SECTION_B[idx]}</p>
              </div>
              <div className="flex gap-2 items-center pl-9">
                {["YES", "NO", "N/A"].map((opt) => (
                  <button key={opt} type="button" onClick={() => onUpdate(idx, "result", opt)}
                    className={resultCls(row.result, opt)}>{opt}</button>
                ))}
                <input type="text" placeholder="Remarks" value={row.remarks}
                  onChange={(e) => onUpdate(idx, "remarks", e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {signingKey && <SignaturePad onSave={saveSignature} onClose={() => setSigningKey(null)} />}

      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Deck Tubing Checklist</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
        <button onClick={handleSave} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Save</button>
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
                  DECK TUBING INSPECTION CHECKLIST
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 text-slate-700 align-middle">
                  <span className="font-semibold">Initializing Department: SHEQ Department</span>
                </td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 text-center align-middle w-24">Page</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 align-middle">Document No:</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700 align-middle">All Departments</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle">Page 1 of 1</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 align-middle"></td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 align-middle">Revision Number:</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Header fields */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contractor</label>
              <input type="text" value={contractor} onChange={(e) => setContractor(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Team Leader</label>
              <input type="text" value={teamLeader} onChange={(e) => setTeamLeader(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Ref Drawing No.</label>
              <input type="text" value={refDrawing} onChange={(e) => setRefDrawing(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Work Area / Location</label>
              <input type="text" value={workArea} onChange={(e) => setWorkArea(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
            <strong>NB.</strong> The specific building's electrical and appliances plan shall be used to check work requirements and installations on the ground.
          </div>
        </div>

        {/* Section A */}
        <ChecklistSection title="Section A: Installation" items={sectionA} onUpdate={updateA} />

        {/* Section B */}
        <ChecklistSection title="Section B: Post Concrete Pouring" items={sectionB} onUpdate={updateB} />

        {/* Deviations */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <label className="block text-sm font-bold text-slate-800 mb-2">Deviations</label>
          <textarea value={deviations} onChange={(e) => setDeviations(e.target.value)} rows={3}
            placeholder="Note any deviations from specifications..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Confirmation statement */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-600 italic">
            We have carried out all necessary inspections and verify that the above activities conform to the contract specifications and quality requirements.
          </p>
        </div>

        {/* Sign-off */}
        {[
          { key: "inspector", label: "Quality Inspector" },
          { key: "supervisor", label: "Site Supervisor" },
          { key: "engineer",  label: "Engineer" },
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

        <button onClick={handleSave}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
          Save Checklist
        </button>
      </div>
    </div>
  );
}
