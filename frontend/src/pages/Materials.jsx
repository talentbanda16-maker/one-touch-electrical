import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../api";

export default function Materials() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get("/projects").then(setProjects).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!projectId) { setMaterials([]); return; }
    setLoading(true);
    api.get(`/projects/${projectId}/materials`)
      .then(setMaterials).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const projectName = projects.find((p) => p.id === projectId)?.name || "Project";

  const grouped = useMemo(() => {
    const g = []; const map = new Map();
    for (const m of materials) {
      const key = m.bill || "Materials";
      if (!map.has(key)) { map.set(key, []); g.push({ bill: key, rows: map.get(key) }); }
      map.get(key).push(m);
    }
    return g;
  }, [materials]);

  function downloadExcel() {
    const aoa = [[`MATERIALS — ${projectName}`], [], ["#", "Item", "Description", "Unit", "Qty", "Bill"]];
    materials.forEach((m, i) => aoa.push([i + 1, m.itemNumber || "", m.description, m.unit || "", m.quantity ?? "", m.bill || ""]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 8 }, { wch: 60 }, { wch: 8 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    const safe = projectName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    XLSX.writeFile(wb, `Materials_${safe || "project"}.xlsx`);
  }

  return (
    <div className="p-4 max-w-[1000px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-full pl-2 pr-3.5 py-1.5 shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Materials</h1>
          <p className="text-xs text-slate-500">The supply items pulled out of the tender BOQ.</p>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 mb-3">{msg}</p>}

      {!projectId && <p className="text-sm text-slate-400">Pick a project to see its materials.</p>}

      {projectId && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-700">
              {materials.length} material{materials.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              {materials.length > 0 && (
                <button onClick={downloadExcel} className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50">⬇️ Download Excel</button>
              )}
            </div>
          </div>

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && materials.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-1">No materials yet.</p>
              <p className="text-xs text-slate-400">Upload a BOQ for this project and the materials fill in here automatically.</p>
            </div>
          )}

          {materials.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-2 w-10">#</th>
                    <th className="py-1.5 pr-2 w-16">Item</th>
                    <th className="py-1.5 pr-2">Material</th>
                    <th className="py-1.5 pr-2 w-14">Unit</th>
                    <th className="py-1.5 pr-2 text-right w-20">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let n = 0;
                    return grouped.map((g) => {
                      const start = n;
                      n += g.rows.length;
                      return <GroupBlock key={g.bill} bill={g.bill} rows={g.rows} startIndex={start} />;
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupBlock({ bill, rows, startIndex }) {
  return (
    <>
      <tr className="bg-brand-900/90">
        <td colSpan={5} className="px-2 py-1.5 text-xs font-bold text-white uppercase tracking-wide">{bill}</td>
      </tr>
      {rows.map((m, i) => (
        <tr key={m.id} className="border-b border-slate-100">
          <td className="py-1.5 pr-2 text-slate-400 text-xs">{startIndex + i + 1}</td>
          <td className="py-1.5 pr-2 font-mono text-xs text-slate-400 align-top">{m.itemNumber}</td>
          <td className="py-1.5 pr-2 align-top">{m.description}</td>
          <td className="py-1.5 pr-2 text-slate-500 align-top">{m.unit}</td>
          <td className="py-1.5 pr-2 text-right tabular-nums align-top">{m.quantity != null ? Number(m.quantity).toLocaleString() : ""}</td>
        </tr>
      ))}
    </>
  );
}
