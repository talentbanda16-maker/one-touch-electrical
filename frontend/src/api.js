// A handful of backend routes send zod's error.flatten() shape —
// { formErrors: [...], fieldErrors: { field: [...] } } — as the "error"
// value instead of a plain string (e.g. any report submission with an
// out-of-range field). Passed straight into `new Error(...)`, an object
// stringifies to the literal text "[object Object]" — this turns it
// into an actual readable message first.
function errorMessageFrom(data, fallback) {
  const err = data?.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const fieldMessages = Object.entries(err.fieldErrors || {}).flatMap(([field, msgs]) =>
      (msgs || []).map((m) => `${field}: ${m}`)
    );
    const messages = [...(err.formErrors || []), ...fieldMessages];
    if (messages.length > 0) return messages.join("; ");
  }
  return fallback;
}

// Empty by default — every call below just hits a relative "/api/..."
// path, which works because Vite's dev proxy (and, in a real deployment,
// the same server serving both frontend and backend) forwards it to the
// backend automatically. Set VITE_API_URL only when the frontend is
// hosted somewhere separate from the backend (e.g. Vercel talking to a
// backend on a different domain) — then every request is sent there
// directly instead.
const API_BASE = import.meta.env.VITE_API_URL || "";

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function request(path, { method = "GET", body, retry = true } = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { method, body, retry: false });
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(errorMessageFrom(data, `Request failed: ${res.status}`));
  }

  if (res.status === 204) return null;
  return res.json();
}

// Downloads a binary response (PDF/Excel export) and saves it via the
// browser, reusing the same auth + 401-retry handling as request() —
// fetch() has no JSON-body shortcut so this can't just call request().
async function downloadFile(path, fallbackName, retry = true) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return downloadFile(path, fallbackName, false);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(errorMessageFrom(data, `Request failed: ${res.status}`));
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Fetches a protected file as a Blob for inline display (e.g. showing an
// attachment as an <img>, which can't send an Authorization header on
// its own) — same auth + 401-retry handling as request()/downloadFile(),
// just returns the blob instead of triggering a save-as.
async function fetchBlob(path, retry = true) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchBlob(path, false);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(errorMessageFrom(data, `Request failed: ${res.status}`));
  }

  return res.blob();
}

// File uploads (FormData) can't go through request() — a JSON body and
// a multipart body need different headers — but need the same base URL
// and bearer-token handling every other call gets. Every page that
// uploads a photo/document/evidence file used to hand-roll this fetch
// itself, each one hardcoding a plain "/api/..." path that would silently
// point at the wrong server the moment frontend and backend aren't on
// the same domain any more.
async function uploadFile(path, formData) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(errorMessageFrom(data, "Upload failed"));
  }
  return res.json();
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  delete: (path) => request(path, { method: "DELETE" }),
  download: downloadFile,
  blob: fetchBlob,
  upload: uploadFile,
};
