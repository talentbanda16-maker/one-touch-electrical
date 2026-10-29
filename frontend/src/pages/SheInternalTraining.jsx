import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const newRow = () => ({ id: crypto.randomUUID(), name: "", position: "", signature: null });

const inputCls = "w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded bg-transparent";

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function move(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function end(e) { e.preventDefault(); drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function save() {
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <p className="text-sm font-bold text-slate-800">Sign here</p>
        <canvas
          ref={canvasRef}
          width={340} height={160}
          className="w-full border-2 border-slate-300 rounded-xl touch-none cursor-crosshair"
          style={{ background: "#fff" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        <div className="flex gap-2">
          <button onClick={clear} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Clear</button>
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl text-sm">Cancel</button>
          <button onClick={save} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function SheInternalTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [site, setSite] = useState("");
  const [date, setDate] = useState(today);

  useEffect(() => {
    const id = (() => { try { return localStorage.getItem("active_project") || ""; } catch { return ""; } })();
    if (!id) return;
    api.get("/projects").then((list) => {
      const p = list.find((x) => x.id === id);
      if (p) setSite(p.name);
    }).catch(() => {});
  }, []);
  const [trainer, setTrainer] = useState("");
  const [rows, setRows] = useState(() => Array.from({ length: 10 }, newRow));
  const [success, setSuccess] = useState("");
  const [signingId, setSigningId] = useState(null);

  function updateRow(id, field, val) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }
  function addRow() { setRows((rs) => [...rs, newRow()]); }
  function removeRow(id) { setRows((rs) => rs.filter((r) => r.id !== id)); }

  function saveSignature(sig) {
    updateRow(signingId, "signature", sig);
    setSigningId(null);
  }

  function handleSave() {
    setSuccess("Internal training register saved.");
    setTimeout(() => setSuccess(""), 3000);
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {signingId && <SignaturePad onSave={saveSignature} onClose={() => setSigningId(null)} />}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">SHE Internal Training</h1>
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
                  SHE INTERNAL TRAINING ATTENDANCE REGISTER
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Location / Site</label>
              <input type="text" value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site name"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Trainer Name</label>
            <input type="text" value={trainer} onChange={(e) => setTrainer(e.target.value)} placeholder="Full name of trainer"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Attendance table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Please print all information</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                  <th className="border border-slate-200 px-2 py-2.5 text-center w-8">#</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">Name</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left w-32">Position</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center w-28">Signature</th>
                  <th className="border border-slate-200 px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500 font-semibold">{idx + 1}</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input type="text" placeholder="Full name" value={row.name}
                        onChange={(e) => updateRow(row.id, "name", e.target.value)} className={inputCls} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input type="text" placeholder="Position" value={row.position}
                        onChange={(e) => updateRow(row.id, "position", e.target.value)} className={inputCls} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.signature ? (
                        <button type="button" onClick={() => setSigningId(row.id)}
                          className="w-full h-10 flex items-center justify-center">
                          <img src={row.signature} alt="sig" className="max-h-9 max-w-full object-contain" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setSigningId(row.id)}
                          className="w-full h-10 border border-dashed border-slate-300 rounded text-xs text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                          Tap to sign
                        </button>
                      )}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)} className="text-slate-400 hover:text-red-500 text-xl leading-none">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100">
            <button type="button" onClick={addRow} className="text-sm text-blue-600 hover:text-blue-800 font-semibold">+ Add row</button>
          </div>
        </div>

        <button onClick={handleSave}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
          Save Register
        </button>
      </div>
    </div>
  );
}
