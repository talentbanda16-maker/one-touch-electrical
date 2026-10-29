import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function qty(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

export default function StoresAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [error, setError] = useState("");
  const isTM = user?.role === "TECHNICAL_MANAGER";

  useEffect(() => {
    api.get("/projects").then((list) => {
      setProjects(list);
      if (list.length > 0) setProjectId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setError("");
    api
      .get(`/projects/${projectId}/stores-analytics`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load Stores analytics"));
    api
      .get(`/projects/${projectId}/requisitions`)
      .then(setRequisitions)
      .catch(() => setRequisitions([]));
  }, [projectId]);

  const pendingRequisitions = requisitions.filter((r) => r.status === "PENDING");
  const rejectedRequisitions = requisitions.filter((r) => r.status === "REJECTED");

  async function handleApproveReq(id, approved, rejectionReason) {
    try {
      await api.patch(`/requisitions/${id}/approve`, { approved, rejectionReason });
      api.get(`/projects/${projectId}/requisitions`).then(setRequisitions).catch(() => {});
    } catch (err) {
      setError(err.message || "Failed to update requisition");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Stores — Material Tracking</p>
          <p className="font-medium text-slate-900">{user?.name}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
        >
          Back
        </button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-3 text-base"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {pendingRequisitions.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <h2 className="font-semibold text-slate-900 text-sm">Pending material requisitions</h2>
                  <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {pendingRequisitions.length}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {pendingRequisitions.map((r) => (
                    <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {r.refNumber && (
                          <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 mr-2">
                            {r.refNumber}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-900">{r.itemName}</span>
                        <span className="text-sm text-slate-500 ml-1">× {r.quantityRequested}{r.unit ? ` ${r.unit}` : ""}</span>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {r.urgency} priority · by {r.requestedBy?.name}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </div>
                      </div>
                      {isTM && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleApproveReq(r.id, true)}
                            className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 hover:bg-green-100"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = window.prompt("Reason for rejection (optional):");
                              if (reason !== null) handleApproveReq(r.id, false, reason || undefined);
                            }}
                            className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 hover:bg-red-100"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

        {rejectedRequisitions.length > 0 && (
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <h2 className="font-semibold text-slate-900 text-sm">Rejected requisitions</h2>
              <span className="ml-auto text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                {rejectedRequisitions.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {rejectedRequisitions.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.refNumber && (
                      <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                        {r.refNumber}
                      </span>
                    )}
                    <span className="text-sm font-medium text-slate-900">{r.itemName}</span>
                    <span className="text-sm text-slate-500">× {r.quantityRequested}{r.unit ? ` ${r.unit}` : ""}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">by {r.requestedBy?.name}</div>
                  {r.rejectionReason && (
                    <div className="mt-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                      Reason: {r.rejectionReason}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && (
          <>
            {data.items.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
                No approved Stores reports yet.
              </div>
            )}

            {data.shortages.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
                <h2 className="font-medium text-red-900">Shortages / urgent requirements</h2>
                {data.shortages.map((s, i) => (
                  <p key={i} className="text-sm text-red-800">
                    {new Date(s.date).toLocaleDateString()} — {s.note}
                  </p>
                ))}
              </div>
            )}

            {data.trend.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-medium text-slate-900 mb-3">Movement over time</h2>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="received" name="Received" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="issued" name="Issued" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.items.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
                <h2 className="font-medium text-slate-900 mb-3">Stock balance by item</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1 pr-2">Item</th>
                      <th className="py-1 pr-2">Received</th>
                      <th className="py-1 pr-2">Issued</th>
                      <th className="py-1 pr-2">Returned</th>
                      <th className="py-1 pr-2">Damaged/lost</th>
                      <th className="py-1 pr-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((i) => (
                      <tr key={i.itemName} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-2">{i.itemName}</td>
                        <td className="py-1 pr-2">{qty(i.received)}</td>
                        <td className="py-1 pr-2">{qty(i.issued)}</td>
                        <td className="py-1 pr-2">{qty(i.returned)}</td>
                        <td className="py-1 pr-2">{qty(i.damagedLost)}</td>
                        <td className={`py-1 pr-2 font-medium ${i.balance < 0 ? "text-red-600" : "text-slate-900"}`}>
                          {qty(i.balance)} {i.unit || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
