// Reads a drawing into a rough electrical take-off — no AI, no quota.
// 1) If the PDF has a real text layer, read that (exact, instant).
// 2) If not (labels drawn as graphics), render the page and OCR it (slower,
//    rougher) so graphics-only layouts can still be read.
// Then pattern-match the text into components. Counts from unique IDs are
// reliable; others are best-effort and meant to be reviewed by the QS.
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Tesseract from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ── Text layer ──────────────────────────────────────────────────────────────
export async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((i) => i.str).join(" "));
  }
  return pages.join(" \n ");
}

// ── Render page 1 to a canvas (for OCR / fallback) ──────────────────────────
export async function renderPdfToCanvas(arrayBuffer, scale = 2.6) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

export async function imageToCanvas(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

// Run OCR over a canvas; onProgress(0..1) for the recognising phase.
export async function ocrCanvas(canvas, onProgress) {
  const { data } = await Tesseract.recognize(canvas, "eng", {
    logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); },
  });
  return data.text || "";
}

// ── Parse text → items ──────────────────────────────────────────────────────
export function parseDrawingText(raw) {
  const T = (raw || "").replace(/\s+/g, " ").toUpperCase();
  const items = [];
  const add = (name, qty, rating = "", unit = "nr") => items.push({ name, qty, rating, unit });
  const count = (re) => (T.match(re) || []).length;
  const addIf = (name, n, rating = "") => { if (n > 0) add(name, n, rating); };

  // Feeder Pillars — unique numbers
  const fp = new Set();
  for (const m of T.matchAll(/FEEDER PILLAR[S]?\s*(\d+)/g)) fp.add(m[1]);
  if (fp.size) add("Feeder Pillar", fp.size, "FP " + [...fp].sort().join(","));

  // Distribution boards with IDs (SDB/T01, DB-SEC/E/L1 …)
  const sdb = new Set();
  for (const m of T.matchAll(/SDB\s*\/?\s*T?\s*0*(\d+)/g)) sdb.add("SDB" + parseInt(m[1], 10));
  for (const m of T.matchAll(/DB[-\s]?SEC[\w/]*\/?\s*L?\s*(\d+)/g)) sdb.add("DBSEC" + m[1]);
  if (sdb.size) add("Distribution Board", sdb.size);

  // Automatic Transfer Switches
  addIf("Automatic Transfer Switch (ATS)", count(/AUTOMATIC TRANSFER SWITCH/g));

  // Breakers / MCBs grouped by rating (approximate)
  const brk = {};
  for (const m of T.matchAll(/(\d{1,4})\s*A\s*(TP|SP|DP)\b(?:\s*(MCB|MCCB))?/g)) {
    const k = `${m[1]}A ${m[2]}${m[3] ? " " + m[3] : ""}`; brk[k] = (brk[k] || 0) + 1;
  }
  for (const m of T.matchAll(/\b(TP|SP|DP)\s*(\d{1,4})\s*A\b/g)) {
    const k = `${m[2]}A ${m[1]}`; brk[k] = (brk[k] || 0) + 1;
  }
  Object.entries(brk).forEach(([r, n]) => add("MCB / Breaker (review count)", n, r));

  // Fire-alarm & detection components
  addIf("Smoke Detector", count(/SMOKE DETECTOR/g));
  addIf("Heat Detector", count(/HEAT DETECTOR/g));
  addIf("Manual Call Point", count(/MANUAL CALL POINT|BREAK GLASS/g));
  addIf("Sounder Beacon", count(/SOUNDER BEACON|SOUNDER\/BEACON/g));
  addIf("Fire Alarm Panel (FAP)", count(/FIRE ALARM PANEL/g));
  addIf("Beam Detector", count(/BEAM\s*(RECEIVER|TRANSMITTER|REFLECTOR)/g));

  // Light fittings by type, with wattage from the legend if present
  const lights = [
    ["Downlight", /DOWNLIGHT/], ["Pendant", /PENDANT/], ["Flood Light", /FLOOD\s*LIGHT/],
    ["Bulkhead", /BULKHEAD/], ["Linear Lighting", /LINEAR LIGHTING/], ["Fluorescent Fitting", /FLUORESCENT/],
  ];
  lights.forEach(([name, re]) => {
    const n = count(new RegExp(re.source, "g"));
    if (n > 0) {
      const w = T.match(new RegExp(re.source + "[^0-9]{0,30}?\\(?(\\d{1,5})\\s*W", "i"));
      add(name, n, w ? `${w[1]}W` : "");
    }
  });

  // Switches with gang + rating (e.g. "10A 2 GANG SWITCH")
  const sw = {};
  for (const m of T.matchAll(/(\d{1,3})\s*A\s*(\d)\s*GANG(\s*2\s*WAY)?\s*SWITCH/g)) {
    const k = `${m[1]}A ${m[2]}-gang${m[3] ? " 2-way" : ""}`; sw[k] = (sw[k] || 0) + 1;
  }
  Object.entries(sw).forEach(([r, n]) => add("Switch", n, r));

  // Socket outlets
  addIf("Socket Outlet", count(/SOCKET OUTLET|POWER POINT|\bSSO\b/g));

  // Cables — specs containing PVC/SWA
  const cables = new Set();
  for (const m of T.matchAll(/((?:\d+\s*NO\.?\s*X\s*)?\d+\s*MM[²2]?\s*\d*\s*C?\s*PVC\s*\/?\s*SWA[\w.\/+² ]{0,55}?BCEW)/g)) {
    const s = m[1].replace(/\s+/g, " ").trim(); if (s.length > 6) cables.add(s);
  }
  for (const m of T.matchAll(/(\d\s*CORE\s*[\d.]+\s*(?:SQ\.?M?M?M?|MM²?)[\w. ]{0,25}?(?:FP\s*RED\s*)?CABLE)/g)) {
    const s = m[1].replace(/\s+/g, " ").trim(); if (s.length > 6) cables.add(s);
  }
  [...cables].slice(0, 40).forEach((c) => add("Cable", 1, c, "m"));

  return items;
}
