import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Load OpenCV from the CDN as a standalone script (the bundled build breaks
// under Vite). Resolves with the ready `cv` object once its WASM is live.
let cvPromise = null;
function loadOpenCv() {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const ready = (c) => c && c.Mat && typeof c.matchTemplate === "function";
    if (ready(window.cv)) return resolve(window.cv);
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.onload = () => {
      const start = Date.now();
      const poll = () => {
        if (ready(window.cv)) return resolve(window.cv);
        if (Date.now() - start > 45000) return reject(new Error("OpenCV loaded but didn't initialise in time."));
        setTimeout(poll, 100);
      };
      if (window.cv && typeof window.cv.then === "function") window.cv.then((c) => { window.cv = c; poll(); });
      else poll();
    };
    script.onerror = () => { cvPromise = null; reject(new Error("Could not download OpenCV — check the internet connection.")); };
    document.body.appendChild(script);
  });
  return cvPromise;
}

// OpenCV symbol counter: renders the drawing to a canvas, lets the user drag a
// box around ONE symbol, then template-matches it across the whole drawing and
// counts the hits. No AI, no quota — pure client-side computer vision.
// Honest limits: one symbol at a time, same size/orientation only, counts
// shapes (can't read ratings or names).
export default function SymbolCounter({ projectId, drawing, onClose, onCounted }) {
  const baseRef = useRef(null);    // the rendered drawing
  const overlayRef = useRef(null); // selection box + match markers
  const wrapRef = useRef(null);
  const renderTaskRef = useRef(null);
  const cvRef = useRef(null);
  const [status, setStatus] = useState("Loading…");
  const [ready, setReady] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);
  const [sel, setSel] = useState(null);       // {x,y,w,h} in natural px
  const [drag, setDrag] = useState(null);      // in-progress drag
  const [threshold, setThreshold] = useState(0.72);
  const [count, setCount] = useState(null);
  const [counting, setCounting] = useState(false);
  const [err, setErr] = useState("");

  // ── Load the drawing into the base canvas ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Render the drawing FIRST so the user sees it right away.
        setStatus("Fetching drawing…");
        const blob = await api.blob(`/attachments/${drawing.id}/file`);
        const canvas = baseRef.current;
        const ctx = canvas.getContext("2d");

        if (drawing.mimeType === "application/pdf") {
          setStatus("Rendering page…");
          const buf = await blob.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          renderTaskRef.current?.cancel?.();
          const task = page.render({ canvasContext: ctx, viewport });
          renderTaskRef.current = task;
          try { await task.promise; }
          catch (e) { if (e?.name === "RenderingCancelledException") return; throw e; }
        } else {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.src = url;
          await img.decode();
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
        }
        if (cancelled) return;
        const ov = overlayRef.current;
        ov.width = canvas.width; ov.height = canvas.height;
        setReady(true);
        setStatus("Loading OpenCV engine…");

        // Then load the OpenCV engine from CDN — the drawing is already visible.
        cvRef.current = await loadOpenCv();
        if (cancelled) return;
        setCvLoaded(true);
        setStatus("");
      } catch (e) {
        if (!cancelled) { setErr(e?.message || "Could not load."); setStatus(""); }
      }
    })();
    return () => { cancelled = true; renderTaskRef.current?.cancel?.(); };
  }, [drawing.id, drawing.mimeType]);

  // ── Map a pointer event to natural-canvas coordinates ──────────────────────
  const toNatural = useCallback((e) => {
    const ov = overlayRef.current;
    const rect = ov.getBoundingClientRect();
    const scaleX = ov.width / rect.width;
    const scaleY = ov.height / rect.height;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: Math.max(0, cx * scaleX), y: Math.max(0, cy * scaleY) };
  }, []);

  const drawOverlay = useCallback((box, matches) => {
    const ov = overlayRef.current;
    if (!ov) return;
    const ctx = ov.getContext("2d");
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (matches) {
      ctx.lineWidth = Math.max(2, ov.width / 500);
      ctx.strokeStyle = "#16a34a";
      matches.forEach((m) => ctx.strokeRect(m.x, m.y, m.w, m.h));
    }
    if (box && box.w > 2 && box.h > 2) {
      ctx.lineWidth = Math.max(2, ov.width / 400);
      ctx.strokeStyle = "#2563eb";
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
    }
  }, []);

  function onDown(e) { e.preventDefault(); const p = toNatural(e); setDrag({ x0: p.x, y0: p.y, x: p.x, y: p.y }); setCount(null); }
  function onMove(e) {
    if (!drag) return;
    const p = toNatural(e);
    const nd = { ...drag, x: p.x, y: p.y };
    setDrag(nd);
    drawOverlay({ x: Math.min(nd.x0, nd.x), y: Math.min(nd.y0, nd.y), w: Math.abs(nd.x - nd.x0), h: Math.abs(nd.y - nd.y0) }, null);
  }
  function onUp() {
    if (!drag) return;
    const box = { x: Math.round(Math.min(drag.x0, drag.x)), y: Math.round(Math.min(drag.y0, drag.y)), w: Math.round(Math.abs(drag.x - drag.x0)), h: Math.round(Math.abs(drag.y - drag.y0)) };
    setDrag(null);
    if (box.w > 5 && box.h > 5) { setSel(box); drawOverlay(box, null); } else { setSel(null); drawOverlay(null, null); }
  }

  // ── Run template matching ──────────────────────────────────────────────────
  function runCount() {
    if (!sel) { setErr("Draw a box around one symbol first."); return; }
    setErr(""); setCounting(true); setCount(null);
    // Let the spinner paint before the (blocking) CV work.
    setTimeout(() => {
      const cv = cvRef.current;
      let src, gray, small, templ, result;
      try {
        if (!cv) throw new Error("OpenCV not ready yet");
        src = cv.imread(baseRef.current);
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Downscale big drawings so matchTemplate stays fast (never freezes).
        const f = Math.min(1, 1100 / Math.max(gray.cols, gray.rows));
        if (f < 1) { small = new cv.Mat(); cv.resize(gray, small, new cv.Size(Math.round(gray.cols * f), Math.round(gray.rows * f)), 0, 0, cv.INTER_AREA); }
        const img = small || gray;

        const rx = Math.round(sel.x * f), ry = Math.round(sel.y * f);
        const rw = Math.max(4, Math.round(sel.w * f)), rh = Math.max(4, Math.round(sel.h * f));
        if (rx + rw > img.cols || ry + rh > img.rows) throw new Error("selection is off the drawing");
        templ = img.roi(new cv.Rect(rx, ry, rw, rh)).clone();
        result = new cv.Mat();
        cv.matchTemplate(img, templ, result, cv.TM_CCOEFF_NORMED);

        // Grid-based peak picking + NMS (bounded work, no O(n²) blow-up).
        const W = result.cols, H = result.rows, data = result.data32F;
        const cellW = Math.max(1, Math.floor(rw * 0.6)), cellH = Math.max(1, Math.floor(rh * 0.6));
        const cols = Math.ceil(W / cellW);
        const best = new Map();
        for (let y = 0; y < H; y++) {
          const rowBase = y * W, cy = Math.floor(y / cellH) * cols;
          for (let x = 0; x < W; x++) {
            const v = data[rowBase + x];
            if (v < threshold) continue;
            const ci = cy + Math.floor(x / cellW);
            const cur = best.get(ci);
            if (!cur || v > cur.v) best.set(ci, { x, y, v });
          }
        }
        let peaks = [...best.values()].sort((a, b) => b.v - a.v);
        if (peaks.length > 4000) peaks = peaks.slice(0, 4000);
        const kept = [];
        const minDx = rw * 0.6, minDy = rh * 0.6;
        for (const c of peaks) {
          let ok = true;
          for (const k of kept) { if (Math.abs(c.x - k.x) < minDx && Math.abs(c.y - k.y) < minDy) { ok = false; break; } }
          if (ok) kept.push(c);
        }
        const inv = 1 / f; // scale match coords back up to the display canvas
        const matches = kept.map((k) => ({ x: k.x * inv, y: k.y * inv, w: sel.w, h: sel.h }));
        drawOverlay(sel, matches);
        setCount(matches.length);
      } catch (e) {
        setErr("Matching failed: " + (e?.message || e));
      } finally {
        src?.delete?.(); gray?.delete?.(); small?.delete?.(); templ?.delete?.(); result?.delete?.();
        setCounting(false);
      }
    }, 30);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70">
      <div className="flex items-center justify-between px-4 py-2.5 bg-brand-900 text-white">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">Count a symbol · {drawing.fileName}</p>
          <p className="text-[11px] text-slate-300">Drag a box around ONE symbol, then Count</p>
        </div>
        <button onClick={onClose} className="text-xs border border-slate-500 rounded-lg px-3 py-1.5 hover:bg-white/10">Close</button>
      </div>

      {/* Controls */}
      <div className="bg-slate-100 px-4 py-2 flex flex-wrap items-center gap-3 border-b border-slate-300">
        <button onClick={runCount} disabled={!cvLoaded || !sel || counting}
          className="text-sm font-semibold rounded-lg px-4 py-1.5 bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700">
          {counting ? "Counting…" : !cvLoaded ? "Loading engine…" : "🔍 Count this symbol"}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Match strictness
          <input type="range" min="0.5" max="0.95" step="0.01" value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-28" />
          <span className="tabular-nums w-8">{threshold.toFixed(2)}</span>
        </label>
        {count != null && (
          <span className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1">
            Found {count}
          </span>
        )}
        {count != null && onCounted && (
          <button onClick={() => onCounted(count)} className="text-xs rounded-lg px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50">
            ➕ Add to take-off
          </button>
        )}
        {sel && <button onClick={() => { setSel(null); setCount(null); drawOverlay(null, null); }} className="text-xs text-slate-500 underline">clear box</button>}
      </div>

      {err && <p className="text-xs text-red-200 bg-red-900/60 px-4 py-1.5">{err}</p>}
      {status && <p className="text-xs text-slate-200 px-4 py-1.5">{status}</p>}

      {/* Canvas area */}
      <div ref={wrapRef} className="flex-1 overflow-auto bg-slate-800 p-3">
        <div className="relative inline-block mx-auto" style={{ lineHeight: 0 }}>
          <canvas ref={baseRef} className="max-w-full h-auto block bg-white" style={{ width: "100%", maxWidth: 1400 }} />
          <canvas ref={overlayRef}
            className="absolute inset-0 cursor-crosshair touch-none"
            style={{ width: "100%", height: "100%" }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
        </div>
      </div>

      <div className="bg-slate-100 px-4 py-2 text-[11px] text-slate-500 border-t border-slate-300">
        Counts copies of the <b>same</b> symbol (same size & rotation). Rotated/overlapping ones may be missed — nudge <b>Match strictness</b> down to catch more, up to catch fewer false hits.
      </div>
    </div>
  );
}
