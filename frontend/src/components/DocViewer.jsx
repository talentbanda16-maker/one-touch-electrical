import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { api } from "../api";

// Shows a project document (PDF / image / Word) inside the app, in a modal —
// no download needed. Word (.docx) is rendered with docx-preview.
export default function DocViewer({ attachment, onClose, inline = false }) {
  const docxRef = useRef(null);
  const [kind, setKind] = useState("loading"); // loading | pdf | image | docx | unsupported | error
  const [url, setUrl] = useState("");

  useEffect(() => {
    let objUrl = "";
    let cancelled = false;

    (async () => {
      try {
        const blob = await api.blob(`/attachments/${attachment.id}/file`);
        if (cancelled) return;
        const mime = attachment.mimeType || blob.type || "";
        const name = (attachment.fileName || "").toLowerCase();

        if (mime === "application/pdf" || name.endsWith(".pdf")) {
          objUrl = URL.createObjectURL(blob);
          setUrl(objUrl);
          setKind("pdf");
        } else if (mime.startsWith("image/")) {
          objUrl = URL.createObjectURL(blob);
          setUrl(objUrl);
          setKind("image");
        } else if (mime.includes("word") || name.endsWith(".docx") || name.endsWith(".doc")) {
          setKind("docx");
          // render after the container is in the DOM
          setTimeout(async () => {
            if (cancelled || !docxRef.current) return;
            try {
              docxRef.current.innerHTML = "";
              await renderAsync(blob, docxRef.current, null, { inWrapper: true, className: "docx-view" });
            } catch {
              setKind("error");
            }
          }, 30);
        } else {
          setKind("unsupported");
        }
      } catch {
        if (!cancelled) setKind("error");
      }
    })();

    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [attachment]);

  const body = (
    <div className={inline ? "overflow-auto bg-slate-100 rounded-lg border border-slate-200" : "flex-1 min-h-0 overflow-auto bg-slate-100"} style={inline ? { maxHeight: "70vh" } : undefined}>
      {kind === "loading" && <p className="text-sm text-slate-400 text-center py-10">Loading…</p>}
      {kind === "pdf" && <iframe title="document" src={url} className="w-full border-0" style={{ height: inline ? "70vh" : "100%" }} />}
      {kind === "image" && (
        <div className="flex items-center justify-center p-4"><img src={url} alt={attachment.fileName} className="max-w-full" /></div>
      )}
      {kind === "docx" && <div ref={docxRef} className="bg-white mx-auto my-4 shadow p-2" style={{ maxWidth: 900 }} />}
      {kind === "unsupported" && (
        <p className="text-sm text-slate-500 text-center py-10">This file type can't be previewed in the app. Use the ⬇️ button to open it.</p>
      )}
      {kind === "error" && (
        <p className="text-sm text-red-500 text-center py-10">Couldn't load this document.</p>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 shrink-0">
          <span className="text-sm font-semibold text-slate-800 truncate">{attachment.fileName}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">✕ Close</button>
        </div>
        {body}
      </div>
    </div>
  );
}
