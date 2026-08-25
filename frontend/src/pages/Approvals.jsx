import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const TYPE_LABELS = {
  FOREMAN: "Foreman",
  QS: "QS",
  SHE: "SHE",
  STORES: "Stores",
  FINANCE: "Finance",
};

export default function Approvals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [returnReasonFor, setReturnReasonFor] = useState(null);
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPending();
  }, []);

  function loadPending() {
    api.get("/reports/pending").then(setPending).catch(() => setPending([]));
  }

  async function toggleExpand(reportId) {
    if (expandedId === reportId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(reportId);
    setDetail(null);
    const full = await api.get(`/reports/${reportId}/full`);
    setDetail(full);
  }

  async function handleApprove(reportId) {
    setError("");
    setBusy(true);
    try {
      await api.post(`/reports/${reportId}/approve`);
      setExpandedId(null);
      setDetail(null);
      loadPending();
    } catch (err) {
      setError(err.message || "Failed to approve report");
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn(reportId) {
    if (!returnReason.trim()) {
      setError("A reason is required to return a report");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.post(`/reports/${reportId}/return`, { reason: returnReason });
      setReturnReasonFor(null);
      setReturnReason("");
      setExpandedId(null);
      setDetail(null);
      loadPending();
    } catch (err) {
      setError(err.message || "Failed to return report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Pending Approvals</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {pending.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
            Nothing waiting for review.
          </div>
        )}

        {pending.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleExpand(r.id)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">
                  {TYPE_LABELS[r.type]} · {r.project.name}
                </span>
                <span className="text-xs text-slate-500">{new Date(r.reportDate).toLocaleDateString()}</span>
              </div>
              <div className="text-sm text-slate-500">
                {r.submittedBy.name} · submitted {new Date(r.submittedAt).toLocaleString()}
              </div>
            </button>

            {expandedId === r.id && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {!detail ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : (
                  <>
                    <ReportDetailView report={detail} />

                    {detail.revisions?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Revision history ({detail.revisions.length})
                        </p>
                        <ul className="space-y-2">
                          {detail.revisions.map((rev) => (
                            <li key={rev.id} className="text-xs bg-amber-50 border border-amber-200 rounded-md p-2">
                              <div className="text-amber-800 font-medium">
                                Returned {new Date(rev.returnedAt).toLocaleString()} by {rev.returnedBy?.name}
                              </div>
                              <div className="text-slate-700">Reason: {rev.reason}</div>
                              <div className="text-slate-500 mt-1">
                                Content at that time: {summarizeSnapshot(rev.snapshot)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {detail.attachments?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Attachments ({detail.attachments.length})
                        </p>
                        <ul className="text-xs text-slate-600 list-disc pl-4">
                          {detail.attachments.map((a) => (
                            <li key={a.id}>{a.fileName}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {returnReasonFor === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder="Reason for returning this report..."
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReturn(r.id)}
                            className="flex-1 bg-red-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                          >
                            Confirm return
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReturnReasonFor(null);
                              setReturnReason("");
                            }}
                            className="flex-1 border border-slate-300 rounded-md py-2 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleApprove(r.id)}
                          className="flex-1 bg-green-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setReturnReasonFor(r.id)}
                          className="flex-1 bg-white border border-red-300 text-red-700 rounded-md py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Return for correction
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}

// Short one-line summary of a revision snapshot — the full detail view
// is for the live report; this is just enough to see what changed.
function summarizeSnapshot(snapshot) {
  switch (snapshot.type) {
    case "FOREMAN":
      return snapshot.foremanDetail?.workCompleted || "(no work completed text)";
    case "QS":
      return `${snapshot.qsDetail?.lines?.length || 0} BOQ line(s)`;
    case "SHE":
      return snapshot.sheDetail?.toolboxTalksConducted || "(no toolbox talks text)";
    case "STORES":
      return `${snapshot.storesDetail?.lines?.length || 0} stock line(s)`;
    case "FINANCE":
      return `${snapshot.financeDetail?.lines?.length || 0} transaction line(s)`;
    default:
      return "";
  }
}

function ReportDetailView({ report }) {
  switch (report.type) {
    case "FOREMAN": {
      const d = report.foremanDetail;
      return (
        <dl className="text-sm space-y-1">
          <Row label="Site" value={d.siteLocation} />
          <Row label="Workers on site" value={d.workersOnSite} />
          <Row label="% progress" value={`${d.percentProgress}%`} />
          <Row label="Work completed" value={d.workCompleted} />
          <Row label="Work in progress" value={d.workInProgress} />
          <Row label="Materials required" value={d.materialsRequired} />
          <Row label="Constraints" value={d.constraints} />
        </dl>
      );
    }
    case "QS":
      return (
        <div className="text-sm space-y-2">
          {report.qsDetail.comments && <p className="text-slate-600">{report.qsDetail.comments}</p>}
          {report.qsDetail.lines.map((l) => (
            <div key={l.id} className="border border-slate-100 rounded-md p-2">
              {l.boqItemNumber} — {l.description}: {l.percentCompletion}% (balance {l.balanceQuantity})
            </div>
          ))}
        </div>
      );
    case "SHE": {
      const d = report.sheDetail;
      return (
        <dl className="text-sm space-y-1">
          <Row label="Toolbox talks" value={d.toolboxTalksConducted} />
          <Row label="Inspections" value={d.safetyInspections} />
          <Row label="PPE compliance" value={d.ppeCompliance} />
          <Row label="Corrective actions" value={d.correctiveActions} />
          <Row label="Incidents / near misses" value={`${d.incidentCount} / ${d.nearMissCount}`} />
          <Row label="Description" value={d.incidentsDescription} />
        </dl>
      );
    }
    case "STORES":
      return (
        <div className="text-sm space-y-2">
          {report.storesDetail.shortagesAndRequirements && (
            <p className="text-red-600">Shortage: {report.storesDetail.shortagesAndRequirements}</p>
          )}
          {report.storesDetail.lines.map((l) => (
            <div key={l.id} className="border border-slate-100 rounded-md p-2">
              {l.itemName} — {l.direction.replace("_", "/")}: {l.quantity} {l.unit || ""}
            </div>
          ))}
        </div>
      );
    case "FINANCE":
      return (
        <div className="text-sm space-y-2">
          {report.financeDetail.comments && <p className="text-slate-600">{report.financeDetail.comments}</p>}
          {report.financeDetail.lines.map((l) => (
            <div key={l.id} className="border border-slate-100 rounded-md p-2">
              {l.type.replace("_", " ")} · {l.category.replace("_", " ")}: {l.amount}
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
