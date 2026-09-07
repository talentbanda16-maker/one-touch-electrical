import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import ProductivityReportDocument from "../components/ProductivityReportDocument";

export default function ProductivityReportPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/productivity-reports/${id}`).then(setReport).catch((err) => setError(err.message || "Failed to load report"));
  }, [id]);

  if (error) {
    return <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md m-4">{error}</div>;
  }
  if (!report) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="max-w-3xl mx-auto mb-4 flex justify-between px-6 print:hidden">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-2 bg-white">
          Back
        </button>
        <button onClick={() => window.print()} className="text-sm bg-blue-600 text-white rounded-md px-3 py-2 font-medium">
          Print / Save as PDF
        </button>
      </div>
      <ProductivityReportDocument report={report} />
    </div>
  );
}
