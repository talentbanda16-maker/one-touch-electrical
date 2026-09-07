import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { MANAGEMENT_ACTIONS } from "../lib/productivityOptions";
import ProductivityReportDocument from "../components/ProductivityReportDocument";

const STATUS_LABELS = { SUBMITTED: "Awaiting supervisor review", SUPERVISOR_REVIEWED: "Awaiting your sign-off", COMPLETED: "Completed" };

export default function ProductivityFinalize() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [dateFilter, setDateFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ productivityScore: "", overtimeHoursApproved: "", overtimeCost: "", managementActions: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPending();
  }, []);

  useEffect(() => {
    loadAll(dateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

  function load() {
    loadPending();
    loadAll(dateFilter);
  }

  function loadPending() {
    api.get("/productivity-reports/pending-finalize").then(setPending).catch(() => setPending([]));
  }

  function loadAll(date) {
    const query = date ? `?date=${date}` : "";
    api.get(`/productivity-reports${query}`).then(setAll).catch(() => setAll([]));
  }

  function toggle(report) {
    if (expandedId === report.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(report.id);
    setForm({ productivityScore: "", overtimeHoursApproved: "", overtimeCost: "", managementActions: [] });
    setError("");
  }

  function toggleAction(value) {
    setForm((f) => ({
      ...f,
      managementActions: f.managementActions.includes(value)
        ? f.managementActions.filter((a) => a !== value)
        : [...f.managementActions, value],
    }));
  }

  async function finalize(reportId) {
    setError("");
    setBusy(true);
    try {
      await api.patch(`/productivity-reports/${reportId}/finalize`, {
        productivityScore: form.productivityScore ? Number(form.productivityScore) : undefined,
        overtimeHoursApproved: form.overtimeHoursApproved ? Number(form.overtimeHoursApproved) : undefined,
        overtimeCost: form.overtimeCost ? Number(form.overtimeCost) : undefined,
        managementActions: form.managementActions,
      });
      setExpandedId(null);
      load();
    } catch (err) {
      setError(err.message || "Failed to finalize report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Productivity Reports</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2">Back</button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900 mb-3">Awaiting your sign-off ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-slate-500">Nothing waiting.</p>}
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="border border-slate-100 rounded-md overflow-hidden">
                <button type="button" onClick={() => toggle(r)} className="w-full text-left p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.submittedBy.name}</span>
                    <span className="text-xs text-slate-500">{new Date(r.reportDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-500">{r.project.name} · Reviewed by {r.reviewedBy?.name}</div>
                </button>

                {expandedId === r.id && (
                  <div className="border-t border-slate-100 p-3 space-y-3 text-sm">
                    <div className="border border-slate-200 rounded-md overflow-x-auto">
                      <ProductivityReportDocument report={r} />
                    </div>

                    <div className="max-w-3xl mx-auto border-2 border-blue-300 rounded-md p-3 bg-blue-50/40 space-y-2">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">K. Daily productivity control — fill this in now</h3>
                      <Field label="Productivity score (/100)" type="number" value={form.productivityScore} onChange={(v) => setForm((f) => ({ ...f, productivityScore: v }))} />
                      <Field label="Overtime hours approved" type="number" value={form.overtimeHoursApproved} onChange={(v) => setForm((f) => ({ ...f, overtimeHoursApproved: v }))} />
                      <Field label="Overtime cost ($)" type="number" value={form.overtimeCost} onChange={(v) => setForm((f) => ({ ...f, overtimeCost: v }))} />

                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide pt-2">L. Management action / follow-up</h3>
                      <div className="space-y-1">
                        {MANAGEMENT_ACTIONS.map((a) => (
                          <label key={a.value} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={form.managementActions.includes(a.value)} onChange={() => toggleAction(a.value)} />
                            {a.label}
                          </label>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => finalize(r.id)}
                        className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                      >
                        Finalize report
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-medium text-slate-900">All productivity reports</h2>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              {dateFilter && (
                <button type="button" onClick={() => setDateFilter("")} className="text-xs text-blue-600 font-medium">
                  Clear
                </button>
              )}
            </div>
          </div>
          {all.length === 0 && (
            <p className="text-sm text-slate-500">{dateFilter ? "No reports for that date." : "None yet."}</p>
          )}
          <ul className="space-y-2">
            {all.map((r) => (
              <li key={r.id} className="text-sm border border-slate-100 rounded-md p-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.submittedBy.name} · {new Date(r.reportDate).toLocaleDateString()}</div>
                  <div className="text-slate-500">{r.project.name} · {STATUS_LABELS[r.status] || r.status}</div>
                  {r.status === "COMPLETED" && (
                    <div className="text-xs text-slate-400 mt-1">
                      Productivity score: {r.productivityScore ?? "—"} · Overtime cost: {r.overtimeCost != null ? `$${r.overtimeCost}` : "—"}
                    </div>
                  )}
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
    </div>
  );
}
