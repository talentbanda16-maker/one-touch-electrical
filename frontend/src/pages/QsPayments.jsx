import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function fmt$(val) {
  if (val == null || isNaN(val)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : "—"; }

function StatusBadge({ status }) {
  const s = {
    PAID:    "bg-green-100 text-green-800 border-green-200",
    PARTIAL: "bg-yellow-100 text-yellow-800 border-yellow-200",
    UNPAID:  "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${s[status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {status}
    </span>
  );
}

function paymentStatus(periodAmount, paidAmount) {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= periodAmount) return "PAID";
  return "PARTIAL";
}

export default function QsPayments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [claims, setClaims] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openFormId, setOpenFormId] = useState(null); // claimId with open payment form
  const [form, setForm] = useState({ amountPaid: "", datePaid: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("UNPAID"); // UNPAID | PARTIAL | ALL

  useEffect(() => {
    api.get("/projects").then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    }).catch(() => {});
  }, []);

  const [claimItems, setClaimItems] = useState([]);
  const [directPaid, setDirectPaid] = useState(0);
  const [directForm, setDirectForm] = useState({ amountPaid: "", datePaid: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  const [directFormOpen, setDirectFormOpen] = useState(false);
  const [directSaving, setDirectSaving] = useState(false);
  const [directError, setDirectError] = useState("");

  const loadData = (pid) => {
    if (!pid) return;
    setLoading(true);
    Promise.all([
      api.get(`/reports/qs/history?projectId=${pid}`).catch(() => []),
      api.get(`/reports/qs/payments?projectId=${pid}`).catch(() => []),
      api.get(`/dashboard/claim-items?projectId=${pid}`).catch(() => []),
      api.get(`/dashboard/project-paid?projectId=${pid}`).catch(() => null),
    ]).then(([c, p, items, paidInfo]) => {
      setClaims(c);
      setPayments(p);
      setClaimItems(items);
      setDirectPaid(paidInfo?.paidAmount ?? 0);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(projectId); }, [projectId]);

  // Build enriched claim list with payment totals
  const enriched = claims
    .filter(c => c.status === "APPROVED")
    .map((c) => {
      const claimPayments = payments.filter((p) => p.reportId === c.id);
      const totalPaid = claimPayments.reduce((s, p) => s + Number(p.amountPaid), 0);
      const outstanding = c.periodAmount - totalPaid;
      return { ...c, totalPaid, outstanding, claimPayments, payStatus: paymentStatus(c.periodAmount, totalPaid) };
    });

  const filtered = filter === "ALL" ? enriched : enriched.filter(c => c.payStatus === filter || (filter === "UNPAID" && c.payStatus === "PARTIAL"));

  const openForm = (claim) => {
    setOpenFormId(claim.id);
    setForm({ amountPaid: claim.outstanding > 0 ? claim.outstanding.toFixed(2) : "", datePaid: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
    setError("");
  };

  const handleRegister = async (claim) => {
    if (!form.amountPaid || isNaN(parseFloat(form.amountPaid))) { setError("Enter a valid amount"); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/reports/qs/payments", {
        projectId,
        reportId: claim.id,
        amountPaid: parseFloat(form.amountPaid),
        datePaid: form.datePaid,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      setOpenFormId(null);
      loadData(projectId);
    } catch (err) {
      setError(err.message || "Failed to record payment");
    }
    setSaving(false);
  };

  const handleDelete = async (paymentId) => {
    if (!window.confirm("Remove this payment record?")) return;
    await api.delete(`/reports/qs/payments/${paymentId}`).catch(() => {});
    loadData(projectId);
  };

  const handleDirectPayment = async () => {
    if (!directForm.amountPaid || isNaN(parseFloat(directForm.amountPaid))) { setDirectError("Enter a valid amount"); return; }
    setDirectSaving(true); setDirectError("");
    try {
      const added = parseFloat(directForm.amountPaid);
      const newPaid = directPaid + added;
      await api.patch("/dashboard/project-financials", { projectId, paidAmount: newPaid });
      setDirectPaid(newPaid);
      setDirectFormOpen(false);
      setDirectForm({ amountPaid: "", datePaid: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
    } catch (err) {
      setDirectError(err.message || "Failed to record payment");
    }
    setDirectSaving(false);
  };

  const claimItemsTotal = claimItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const directOutstanding = Math.max(0, claimItemsTotal - directPaid);

  const totals = enriched.reduce((acc, c) => ({
    claimed: acc.claimed + c.periodAmount,
    paid: acc.paid + c.totalPaid,
    outstanding: acc.outstanding + c.outstanding,
  }), { claimed: 0, paid: 0, outstanding: 0 });

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-lg"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">QS Claim Payments</h1>
          <p className="text-xs text-slate-500">Register payments against approved claims</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">

        {/* Project selector */}
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm bg-white"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>

        {/* Summary tiles */}
        {!loading && enriched.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Claimed</p>
              <p className="font-bold text-slate-900 text-sm">{fmt$(totals.claimed)}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center">
              <p className="text-xs text-green-600 mb-1">Total Paid</p>
              <p className="font-bold text-green-900 text-sm">{fmt$(totals.paid)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center">
              <p className="text-xs text-red-600 mb-1">Outstanding</p>
              <p className="font-bold text-red-900 text-sm">{fmt$(totals.outstanding)}</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2">
          {["UNPAID", "ALL"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === f ? "bg-brand-600 text-white border-green-700" : "bg-white text-slate-600 border-slate-300"}`}>
              {f === "UNPAID" ? "Pending / Partial" : "All Claims"}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
        {!loading && enriched.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No approved claims for this project yet.</p>
        )}
        {!loading && enriched.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">All claims are fully paid.</p>
        )}

        {/* Direct ClaimItems section — shown when QS used Claims tab instead of formal reports */}
        {!loading && claimItemsTotal > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Direct Claims</p>
                  <p className="text-xs text-slate-500">{claimItems.length} item{claimItems.length !== 1 ? "s" : ""} from QS Claims tab</p>
                </div>
                <StatusBadge status={directOutstanding <= 0 ? "PAID" : directPaid > 0 ? "PARTIAL" : "UNPAID"} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500 mb-0.5">Claimed</p>
                  <p className="font-bold text-slate-900">{fmt$(claimItemsTotal)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <p className="text-green-600 mb-0.5">Paid</p>
                  <p className="font-bold text-green-900">{fmt$(directPaid)}</p>
                </div>
                <div className={`rounded-lg p-2 ${directOutstanding > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <p className={`mb-0.5 ${directOutstanding > 0 ? "text-red-600" : "text-green-600"}`}>Outstanding</p>
                  <p className={`font-bold ${directOutstanding > 0 ? "text-red-900" : "text-green-900"}`}>{fmt$(directOutstanding)}</p>
                </div>
              </div>
              {claimItemsTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Payment progress</span>
                    <span>{Math.min(100, Math.round((directPaid / claimItemsTotal) * 100))}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(100, (directPaid / claimItemsTotal) * 100)}%` }} />
                  </div>
                </div>
              )}
              {directOutstanding > 0 && !directFormOpen && (
                <button onClick={() => { setDirectFormOpen(true); setDirectForm(f => ({ ...f, amountPaid: directOutstanding.toFixed(2) })); setDirectError(""); }}
                  className="w-full bg-brand-600 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm">
                  Record Payment
                </button>
              )}
            </div>
            {directFormOpen && (
              <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Register Payment — Direct Claims</p>
                {directError && <p className="text-xs text-red-600">{directError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Amount ($) *</label>
                    <input type="number" min="0.01" step="0.01" value={directForm.amountPaid}
                      onChange={(e) => setDirectForm(f => ({ ...f, amountPaid: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Date Paid *</label>
                    <input type="date" value={directForm.datePaid}
                      onChange={(e) => setDirectForm(f => ({ ...f, datePaid: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Bank Reference / Memo</label>
                  <input type="text" placeholder="e.g. TRF001" value={directForm.reference}
                    onChange={(e) => setDirectForm(f => ({ ...f, reference: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleDirectPayment} disabled={directSaving}
                    className="flex-1 bg-brand-600 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                    {directSaving ? "Saving…" : "Confirm Payment"}
                  </button>
                  <button onClick={() => setDirectFormOpen(false)}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Claim cards */}
        {filtered.map((claim) => (
          <div key={claim.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Claim header */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Claim #{claim.claimNumber}</p>
                  <p className="text-xs text-slate-500">{fmtDate(claim.reportDate)} · {claim.submittedBy}</p>
                </div>
                <StatusBadge status={claim.payStatus} />
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500 mb-0.5">Claimed</p>
                  <p className="font-bold text-slate-900">{fmt$(claim.periodAmount)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <p className="text-green-600 mb-0.5">Paid</p>
                  <p className="font-bold text-green-900">{fmt$(claim.totalPaid)}</p>
                </div>
                <div className={`rounded-lg p-2 ${claim.outstanding > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <p className={`mb-0.5 ${claim.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>Outstanding</p>
                  <p className={`font-bold ${claim.outstanding > 0 ? "text-red-900" : "text-green-900"}`}>{fmt$(claim.outstanding)}</p>
                </div>
              </div>

              {/* Progress bar */}
              {claim.periodAmount > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Payment progress</span>
                    <span>{Math.min(100, Math.round((claim.totalPaid / claim.periodAmount) * 100))}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (claim.totalPaid / claim.periodAmount) * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Register Payment button */}
              {claim.outstanding > 0 && openFormId !== claim.id && (
                <button onClick={() => openForm(claim)}
                  className="w-full bg-brand-600 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm">
                  Register Payment
                </button>
              )}
            </div>

            {/* Register Payment form */}
            {openFormId === claim.id && (
              <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Register Payment — Claim #{claim.claimNumber}</p>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Amount ($) *</label>
                    <input type="number" min="0.01" step="0.01" value={form.amountPaid}
                      onChange={(e) => setForm(f => ({ ...f, amountPaid: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Date Paid *</label>
                    <input type="date" value={form.datePaid}
                      onChange={(e) => setForm(f => ({ ...f, datePaid: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Bank Reference / Memo</label>
                  <input type="text" placeholder="e.g. TRF001" value={form.reference}
                    onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Notes</label>
                  <input type="text" placeholder="Optional" value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleRegister(claim)} disabled={saving}
                    className="flex-1 bg-brand-600 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                    {saving ? "Saving…" : "Confirm Payment"}
                  </button>
                  <button onClick={() => setOpenFormId(null)}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Payment history for this claim */}
            {claim.claimPayments.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment History</p>
                {claim.claimPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-green-800">{fmt$(p.amountPaid)}</span>
                      <span className="text-slate-500 ml-2">{fmtDate(p.datePaid)}</span>
                      {p.reference && <span className="text-slate-400 ml-2">· {p.reference}</span>}
                    </div>
                    <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
