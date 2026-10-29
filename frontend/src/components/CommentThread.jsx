import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const ROLE_LABELS = {
  TECHNICAL_MANAGER: "TM",
  MANAGEMENT: "Mgmt",
  QS: "QS",
  FOREMAN: "Foreman",
  STORESMAN: "Stores",
  FINANCE: "Finance",
  SHE_OFFICER: "SHE",
  ENGINEER: "Engineer",
  GENERAL_WORKER: "Worker",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

// entityType: "MaterialRequisition" | "Action" | "Instruction"
// entityId: UUID
export default function CommentThread({ entityType, entityId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!entityId) return;
    api.get(`/comments/${entityType}/${entityId}`)
      .then(setComments)
      .catch(() => {});
  }, [entityType, entityId]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await api.post(`/comments/${entityType}/${entityId}`, { body: body.trim() });
      setComments((prev) => [...prev, created]);
      setBody("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(err.message || "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(id) {
    try {
      await api.delete(`/comments/${id}`);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4 mt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Comments {comments.length > 0 && <span className="text-slate-400">({comments.length})</span>}
      </p>

      {comments.length === 0 && (
        <p className="text-sm text-slate-400 mb-3">No comments yet. Be the first.</p>
      )}

      <ul className="space-y-2 mb-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {c.author.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-800">{c.author.name}</span>
                <span className="text-xs text-slate-400">{ROLE_LABELS[c.author.role] || c.author.role}</span>
                <span className="text-xs text-slate-300">·</span>
                <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                {(c.authorId === user?.id || user?.role === "TECHNICAL_MANAGER") && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="text-xs text-red-400 hover:text-red-600 ml-auto"
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 mt-0.5 break-words">{c.body}</p>
            </div>
          </li>
        ))}
        <div ref={bottomRef} />
      </ul>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          disabled={submitting}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 shrink-0"
        >
          {submitting ? "…" : "Post"}
        </button>
      </form>
    </div>
  );
}
