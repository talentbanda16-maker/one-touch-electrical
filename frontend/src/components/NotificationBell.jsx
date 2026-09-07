import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const POLL_INTERVAL_MS = 45000;

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef(null);

  function load() {
    api
      .get("/notifications")
      .then((data) => {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpenNotification(n) {
    if (!n.isRead) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Not worth blocking navigation over.
      }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    try {
      await api.post("/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silent — user can retry by reopening the panel.
    }
  }

  if (!user) return null;

  return (
    // Every page lays out its own header buttons independently (some
    // just "Back", some "Settings" + "Log out"), so there's no single
    // right-offset that clears all of them on a narrow phone screen —
    // dropping below the header row on small screens sidesteps that
    // entirely instead of guessing a horizontal gap per page.
    <div ref={containerRef} className="fixed top-16 right-3 z-50 sm:top-3 sm:right-40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative bg-white border border-slate-300 rounded-full w-11 h-11 flex items-center justify-center shadow-sm"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-medium rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-blue-600 underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 px-4 py-6 text-center">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-slate-50 last:border-0">
                  <button
                    onClick={() => handleOpenNotification(n)}
                    className={`w-full text-left px-4 py-3 text-sm ${n.isRead ? "bg-white" : "bg-blue-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-medium ${n.isRead ? "text-slate-700" : "text-slate-900"}`}>{n.title}</span>
                      <span className="text-xs text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                    {n.project && <p className="text-xs text-slate-400 mt-0.5">{n.project.name}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
