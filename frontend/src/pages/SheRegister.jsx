import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TITLES = {
  complaints:     "SHE Complaints",
  legal:          "Legal Register",
  risk:           "Risk Register",
};

export default function SheRegister() {
  const { type } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const title = TITLES[type] || "SHE Register";
  const today = new Date().toISOString().slice(0, 10);

  const storageKey = `she-register-${type}`;

  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved).map((e) => ({ ...e, file: null }));
    } catch {}
    return [];
  });
  const [success, setSuccess] = useState("");
  const [saved, setSaved] = useState(false);

  function addEntry() {
    setEntries((e) => [
      {
        id: crypto.randomUUID(),
        refNo: "",
        date: today,
        description: "",
        file: null,
        fileUrl: null,
        fileName: "",
        fileType: "",
        notes: "",
        editing: false,
      },
      ...e,
    ]);
  }

  function updateEntry(id, field, val) {
    setEntries((e) => e.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function handleFile(id, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEntries((e) => e.map((r) => r.id === id ? {
        ...r, file, fileUrl: ev.target.result, fileName: file.name, fileType: file.type, editing: false,
      } : r));
    };
    reader.readAsDataURL(file);
  }

  function removeEntry(id) {
    setEntries((e) => e.filter((r) => r.id !== id));
  }

  function handleSave() {
    try {
      const toStore = entries.map(({ file, ...rest }) => rest);
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {}
    setSaved(true);
    setSuccess("Register saved successfully.");
    setTimeout(() => setSuccess(""), 4000);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">{title}</h1>
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
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-black text-base text-slate-800 text-center">
                  SHEQ MANAGEMENT SYSTEM
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-green-600 text-center">
                  {title.toUpperCase()}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-700">Department: SHEQ</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center w-24">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-10 text-center">
            <p className="text-slate-400 text-sm mb-4">No entries yet. Add your first record below.</p>
          </div>
        )}

        {entries.map((entry, idx) => (
          <div key={entry.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Entry header */}
            <div className="px-4 py-3 bg-brand-900 text-white flex items-center justify-between">
              <p className="text-sm font-bold">Entry {idx + 1}</p>
              <button onClick={() => removeEntry(entry.id)}
                className="text-xs text-red-300 hover:text-red-100 font-semibold">✕ Remove</button>
            </div>

            <div className="px-4 py-4 space-y-3">

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ref No.</label>
                  <input type="text" value={entry.refNo} onChange={(e) => updateEntry(entry.id, "refNo", e.target.value)}
                    placeholder="e.g. SHE-001"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                  <input type="date" value={entry.date} onChange={(e) => updateEntry(entry.id, "date", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description / Title</label>
                <input type="text" value={entry.description} onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                  placeholder="Brief description of this record…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Document / Photo</label>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => handleFile(entry.id, e.target.files[0])} />

                {!entry.fileUrl ? (
                  <button onClick={() => { fileRef.current.setAttribute("data-id", entry.id); fileRef.current.click(); }}
                    className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 hover:text-blue-500 transition-colors">
                    <span className="text-3xl">📎</span>
                    <span className="text-sm font-semibold">Tap to upload image or PDF</span>
                    <span className="text-xs">Photo of document, scan, or certificate</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    {entry.fileType.startsWith("image/") ? (
                      <img src={entry.fileUrl} alt="uploaded" className="w-full rounded-xl border border-slate-200 object-contain max-h-72" />
                    ) : (
                      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                        <span className="text-3xl">📄</span>
                        <span className="text-sm text-slate-700 flex-1 truncate">{entry.fileName}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => fileRef.current.click()}
                        className="flex-1 border border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-400 rounded-xl py-2 text-xs font-semibold transition-colors">
                        Replace
                      </button>
                      <button onClick={() => setEntries((e) => e.map((r) => r.id === entry.id ? { ...r, fileUrl: null, fileName: "", fileType: "", file: null } : r))}
                        className="flex-1 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-400 rounded-xl py-2 text-xs font-semibold transition-colors">
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes / Edit section */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Edits</label>
                <textarea
                  value={entry.notes}
                  onChange={(e) => {
                    updateEntry(entry.id, "notes", e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  rows={3}
                  placeholder="Add comments, corrections or additional information about this document…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                />
              </div>

            </div>
          </div>
        ))}

        {/* Add entry */}
        <button onClick={addEntry}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-500 rounded-2xl py-4 text-sm font-bold transition-colors">
          + Add New Entry
        </button>

      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 z-40">
        <button onClick={handleSave}
          className="w-full max-w-2xl mx-auto block bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
          {saved ? "✓ Saved" : "Save Register"}
        </button>
      </div>

      <div style={{ height: 72 }} />
    </div>
  );
}
