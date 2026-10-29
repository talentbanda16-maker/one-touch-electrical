import { createContext, useContext, useEffect, useState } from "react";
import { api, setAccessToken } from "../api";

const API_BASE = "https://sun-hunter-focuses-cape.trycloudflare.com";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On page load there's no access token in memory yet (it's never
    // persisted to storage), so try the refresh cookie to resume a session.
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          const me = await api.get("/auth/me");
          setUser(me);
        }
      } catch {
        // no valid session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const data = await api.post("/auth/login", { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
