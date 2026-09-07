import { useEffect, useState } from "react";
import { subscribeToQueue, syncPendingReports, discardPending, initOfflineSync } from "../lib/offlineQueue";

export default function OfflineBanner() {
  const [pending, setPending] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    initOfflineSync();
    const unsubscribe = subscribeToQueue(setPending);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (pending.length === 0 && online) return null;

  const failed = pending.filter((p) => p.attempts >= 5);

  async function handleSyncNow() {
    setSyncing(true);
    await syncPendingReports();
    setSyncing(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-50 border-t border-amber-300 px-4 py-2 text-sm">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
        <span className="text-amber-900">
          {!online && "You're offline. "}
          {pending.length > 0
            ? `${pending.length} report${pending.length > 1 ? "s" : ""} waiting to sync${failed.length > 0 ? ` (${failed.length} failing)` : ""}.`
            : online
            ? ""
            : "Reports will be saved locally until you're back online."}
        </span>
        {pending.length > 0 && online && (
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="shrink-0 text-amber-900 border border-amber-400 rounded-md px-3 py-1 font-medium disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
        )}
      </div>
      {failed.length > 0 && (
        <div className="max-w-2xl mx-auto mt-2 space-y-1">
          {failed.map((f) => (
            <div key={f.submissionId} className="flex items-center justify-between text-xs text-red-700">
              <span>
                {f.label}: {f.lastError}
              </span>
              <button onClick={() => discardPending(f.submissionId)} className="underline shrink-0 ml-2">
                Discard
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
