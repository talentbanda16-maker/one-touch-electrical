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
      .then((data) => {
        setComments(data);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 50);
      })
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
    <div className="border-t border-slate-100 mt-4">
      {/* Chat window */}
      <div className="bg-[#ece5dd] rounded-xl p-3 flex flex-col gap-1 max-h-80 overflow-y-auto mt-3">
        {comments.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">No messages yet.</p>
        )}
        {comments.map((c) => {
          const isMe = c.author.id === user?.id;
          return (
            <div key={c.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {/* Sender name (only for others) */}
              {!isMe && (
                <span className="text-[10px] font-semibold text-teal-700 px-2 mb-0.5">
                  {c.author.name} · {ROLE_LABELS[c.author.role] || c.author.role}
                </span>
              )}
              <div className={`relative max-w-[75%] px-3 py-2 rounded-xl text-sm shadow-sm ${
                isMe
                  ? "bg-[#dcf8c6] text-slate-800 rounded-tr-none"
                  : "bg-white text-slate-800 rounded-tl-none"
              }`}>
                <p className="break-words leading-snug">{c.body}</p>
                <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-slate-400">{timeAgo(c.createdAt)}</span>
                  {!c.synthetic && (c.author.id === user?.id || user?.role === "TECHNICAL_MANAGER") && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="text-[10px] text-red-400 hover:text-red-600 ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {/* Input bar */}
      <form onSubmit={submit} className="flex gap-2 mt-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 min-w-0 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          disabled={submitting}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="bg-[#25d366] text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-50 shrink-0 text-base"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
