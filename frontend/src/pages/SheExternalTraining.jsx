import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function SheExternalTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [trainingName, setTrainingName] = useState("");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState(today);
  const [comments, setComments] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const id = (() => { try { return localStorage.getItem("active_project") || ""; } catch { return ""; } })();
    if (!id) return;
    setProjectId(id);
    api.get("/projects").then((list) => {
      const p = list.find((x) => x.id === id);
      if (p) setProjectName(p.name);
    }).catch(() => {});
  }, []);

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview({ type: "image", url, name: f.name });
    } else {
      setPreview({ type: "doc", name: f.name });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!file) return setError("Please attach your certificate.");
    if (!projectId) return setError("No active project selected. Go back to dashboard and select one.");

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("notes", JSON.stringify({ trainingName, provider, date, comments, submittedBy: user?.name }));

      await api.upload(`/projects/${projectId}/documents`, formData);
      setSuccess("External training certificate submitted successfully.");
      setFile(null); setPreview(null);
      setTrainingName(""); setProvider(""); setComments("");
      setDate(today);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">External Training</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {error   && <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-300 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

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
                  EXTERNAL TRAINING CERTIFICATE SUBMISSION
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

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Training details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Project / Site</label>
                <div className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-slate-50 text-slate-700">
                  {projectName || "—"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date of Training</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Training Name</label>
              <input type="text" required value={trainingName} onChange={(e) => setTrainingName(e.target.value)}
                placeholder="e.g. First Aid Level 3"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Training Provider</label>
              <input type="text" required value={provider} onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Red Cross, NOSA, SETA"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">SHE Officer Comments</label>
              <textarea required value={comments} onChange={(e) => setComments(e.target.value)} rows={3}
                placeholder="Comment on the training — relevance, quality, what was learned..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {/* Certificate upload */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <p className="text-sm font-bold text-slate-800">Certificate</p>
            <p className="text-xs text-slate-500">Upload your training certificate (PDF, JPG or PNG — max 10MB)</p>

            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                file ? "border-green-400 bg-green-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
              }`}
            >
              {preview ? (
                preview.type === "image" ? (
                  <img src={preview.url} alt="certificate" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-14 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-red-600">PDF</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{preview.name}</p>
                  </div>
                )
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-500">Tap to upload certificate</p>
                  <p className="text-xs text-slate-400">PDF, JPG, PNG</p>
                </div>
              )}
            </div>
            {file && (
              <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="text-xs text-red-500 hover:text-red-700 font-semibold">
                Remove file
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} className="hidden" />
          </div>

          <button type="submit" disabled={submitting || !projectId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
            {submitting ? "Submitting..." : "Submit Certificate"}
          </button>
        </form>
      </div>
    </div>
  );
}
