import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { PRODUCTIVITY_RATINGS, DELAY_JUSTIFIED, OVERTIME_RECOMMENDATIONS, MANAGEMENT_ACTIONS } from "../lib/productivityOptions";
import ProductivityReportDocument from "../components/ProductivityReportDocument";

const STATUS_LABELS = { SUBMITTED: "Awaiting your review", SUPERVISOR_REVIEWED: "Sent to Technical Manager", COMPLETED: "Completed" };

export default function SupervisorReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [reviewed, setReviewed] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ targetAchievementPercent: "", productivityRating: "", delayJustified: "", overtimeRecommendation: "", supervisorComments: "", supervisorSignatureName: "", productivityScore: "", overtimeHoursApproved: "", overtimeCost: "", managementActions: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.get("/productivity-reports/pending-review").then(setPending).catch(() => setPending([]));
    api.get("/productivity-reports").then(setReviewed).catch(() => setReviewed([]));
  }

  function toggle(report) {
    if (expandedId === report.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(report.id);
    setForm({ targetAchievementPercent: "", productivityRating: "", delayJustified: "", overtimeRecommendation: "", supervisorComments: "", supervisorSignatureName: "", productivityScore: "", overtimeHoursApproved: "", overtimeCost: "", managementActions: [] });
    setError("");
  }

  async function submitReview(reportId) {
    setError("");
    setBusy(true);
    try {
      await api.patch(`/productivity-reports/${reportId}/supervisor-review`, {
        targetAchievementPercent: form.targetAchievementPercent ? Number(form.targetAchievementPercent) : undefined,
        productivityRating: form.productivityRating || undefined,
        delayJustified: form.delayJustified || undefined,
        overtimeRecommendation: form.overtimeRecommendation || undefined,
        supervisorComments: form.supervisorComments || undefined,
        supervisorSignatureName: form.supervisorSignatureName,
        productivityScore: form.productivityScore ? Number(form.productivityScore) : undefined,
        overtimeHoursApproved: form.overtimeHoursApproved ? Number(form.overtimeHoursApproved) : undefined,
        overtimeCost: form.overtimeCost ? Number(form.overtimeCost) : undefined,
        managementActions: form.managementActions,
      });
      setExpandedId(null);
      load();
    } catch (err) {
      setError(err.message || "Failed to submit review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {signing && <SignaturePad onSave={(sig) => { setForm((f) => ({ ...f, supervisorSignatureName: sig })); setSigning(false); }} onClose={() => setSigning(false)} />}
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Supervisor Review</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors">Back</button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Awaiting your review ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-slate-500">Nothing waiting.</p>}
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="border border-slate-100 rounded-md overflow-hidden">
                <button type="button" onClick={() => toggle(r)} className="w-full text-left p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.submittedBy.name}</span>
                    <span className="text-xs text-slate-500">{new Date(r.reportDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-500">{r.project.name}</div>
                </button>

                {expandedId === r.id && (
                  <div className="border-t border-slate-100 p-3 space-y-3 text-sm">
                    <div className="border border-slate-200 rounded-md overflow-x-auto">
                      <ProductivityReportDocument report={r} />
                    </div>

                    <div className="max-w-3xl mx-auto border-2 border-blue-300 rounded-md p-3 bg-blue-50/40">
                      <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">J. Supervisor review — fill this in now</h3>
                      <div className="space-y-2">
                        <SelectField label="Target achievement %" value={form.targetAchievementPercent} onChange={(v) => setForm((f) => ({ ...f, targetAchievementPercent: v }))} type="number" />
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Productivity rating</label>
                          <select value={form.productivityRating} onChange={(e) => setForm((f) => ({ ...f, productivityRating: e.target.value }))} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                            <option value="">—</option>
                            {PRODUCTIVITY_RATINGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Delay justified?</label>
                          <select value={form.delayJustified} onChange={(e) => setForm((f) => ({ ...f, delayJustified: e.target.value }))} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                            <option value="">—</option>
                            {DELAY_JUSTIFIED.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Overtime recommendation</label>
                          <select value={form.overtimeRecommendation} onChange={(e) => setForm((f) => ({ ...f, overtimeRecommendation: e.target.value }))} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                            <option value="">—</option>
                            {OVERTIME_RECOMMENDATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <SelectField label="Comments" value={form.supervisorComments} onChange={(v) => setForm((f) => ({ ...f, supervisorComments: v }))} textarea />
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Supervisor signature *</label>
                          {form.supervisorSignatureName && form.supervisorSignatureName.startsWith("data:") ? (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setSigning(true)} className="flex-1 h-16 border border-slate-200 rounded-lg flex items-center justify-center bg-slate-50">
                                <img src={form.supervisorSignatureName} alt="signature" className="max-h-12 object-contain" />
                              </button>
                              <button type="button" onClick={() => setForm((f) => ({ ...f, supervisorSignatureName: "" }))} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setSigning(true)} className="w-full h-16 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500">
                              ✍️ Tap to sign
                            </button>
                          )}
                        </div>

                        <div className="border-t border-slate-200 pt-2 mt-1">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">K. Daily productivity control</h4>
                          <SelectField label="Productivity score (/100)" type="number" value={form.productivityScore} onChange={(v) => setForm((f) => ({ ...f, productivityScore: v }))} />
                          <SelectField label="Overtime hours approved" type="number" value={form.overtimeHoursApproved} onChange={(v) => setForm((f) => ({ ...f, overtimeHoursApproved: v }))} />
                          <SelectField label="Overtime cost ($)" type="number" value={form.overtimeCost} onChange={(v) => setForm((f) => ({ ...f, overtimeCost: v }))} />
                        </div>

                        <div className="border-t border-slate-200 pt-2">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">L. Management action / follow-up</h4>
                          <div className="space-y-1">
                            {MANAGEMENT_ACTIONS.map((a) => (
                              <label key={a.value} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.managementActions.includes(a.value)}
                                  onChange={() => setForm((f) => ({
                                    ...f,
                                    managementActions: f.managementActions.includes(a.value)
                                      ? f.managementActions.filter((x) => x !== a.value)
                                      : [...f.managementActions, a.value],
                                  }))}
                                />
                                {a.label}
                              </label>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busy || !form.supervisorSignatureName}
                          onClick={() => submitReview(r.id)}
                          className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Complete review (J, K &amp; L)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Reports I've reviewed</h2>
          {reviewed.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <ul className="space-y-2">
            {reviewed.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.submittedBy.name} · {new Date(r.reportDate).toLocaleDateString()}</div>
                  <div className="text-slate-500">{r.project.name} · {STATUS_LABELS[r.status] || r.status}</div>
                </div>
                <Link to={`/productivity/${r.id}/print`} target="_blank" className="text-xs text-blue-600 font-medium shrink-0">
                  View report
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

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

function SelectField({ label, value, onChange, type = "text", textarea = false }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      {textarea ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      )}
    </div>
  );
}
