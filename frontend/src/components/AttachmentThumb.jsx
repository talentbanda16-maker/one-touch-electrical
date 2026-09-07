import { useEffect, useState } from "react";
import { api } from "../api";

// One authenticated image thumbnail that opens full-size on click. The
// download endpoint requires a Bearer token, which a plain <img src>
// can't send — so this fetches the bytes as a blob (via api.blob, same
// auth/401-retry handling as every other request) and points the <img>
// at an object URL instead. Non-image attachments (PDF, Word) fall back
// to a plain authenticated download link — no point trying to preview those.
export default function AttachmentThumb({ attachment }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const isImage = attachment.mimeType?.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let objectUrl;
    let cancelled = false;
    api
      .blob(`/attachments/${attachment.id}/file`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, isImage]);

  if (!isImage) {
    return (
      <a
        href={`/api/attachments/${attachment.id}/file`}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-600 underline self-center"
      >
        {attachment.fileName}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        title={attachment.fileName}
        className="w-16 h-16 rounded-md border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center"
      >
        {url ? (
          <img src={url} alt={attachment.fileName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-slate-400">{failed ? "Failed" : "…"}</span>
        )}
      </button>

      {open && url && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto"
          onClick={() => {
            setOpen(false);
            setActualSize(false);
          }}
        >
          <img
            src={url}
            alt={attachment.fileName}
            onClick={(e) => {
              e.stopPropagation();
              setActualSize((s) => !s);
            }}
            className={
              actualSize
                ? "max-w-none cursor-zoom-out"
                : "max-w-full max-h-full object-contain cursor-zoom-in"
            }
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setActualSize(false);
            }}
            className="fixed top-4 right-4 text-white bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-lg"
          >
            ×
          </button>
          <p className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
            Tap image to {actualSize ? "zoom out" : "zoom in"}
          </p>
        </div>
      )}
    </>
  );
}
