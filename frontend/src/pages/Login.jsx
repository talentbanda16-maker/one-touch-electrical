import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = (field) => ({
    width: "100%",
    borderRadius: 10,
    border: `1.5px solid ${focusedField === field ? "#1a56db" : "#e2e8f0"}`,
    padding: "11px 14px",
    fontSize: "0.875rem",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxShadow: focusedField === field ? "0 0 0 3px rgba(26,86,219,0.12)" : "none",
    color: "#0f172a",
    background: "#fafbff",
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #080e1f 0%, #0f1f3d 45%, #0a1830 100%)" }}>

      {/* Background glow orbs */}
      <div style={{ position: "fixed", top: -100, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(26,86,219,0.18)", filter: "blur(90px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -80, left: -60, width: 340, height: 340, borderRadius: "50%", background: "rgba(245,158,11,0.12)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "55%", right: "15%", width: 180, height: 180, borderRadius: "50%", background: "rgba(239,68,68,0.09)", filter: "blur(60px)", pointerEvents: "none" }} />

      {/* Grid overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.04,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Main card */}
        <div style={{
          background: "white",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>

          {/* Card header — dark navy */}
          <div style={{ background: "linear-gradient(145deg, #0f1f3d 0%, #162b55 100%)", padding: "1.75rem 1.75rem 1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
              <div style={{
                width: 54, height: 54, borderRadius: 14, background: "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.15)",
              }}>
                <img src="/logo.png" alt="One Touch" style={{ width: 40, height: 40, objectFit: "contain" }} />
              </div>
              <div>
                <p style={{ color: "white", fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, margin: 0 }}>One Touch Electrical</p>
                <p style={{ color: "#93c5fd", fontSize: "0.75rem", margin: "3px 0 0", fontWeight: 500 }}>Operations &amp; Project Management</p>
              </div>
            </div>


          </div>

          {/* Form area — white */}
          <div style={{ padding: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1875rem", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>Welcome back</h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0 0 1.5rem" }}>Sign in to your account to continue</p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {error && (
                <div style={{ fontSize: "0.8125rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px" }}>
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  style={inputStyle("email")}
                  autoComplete="username"
                  placeholder="you@onetouchelectrical.com"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  style={inputStyle("password")}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  background: submitting ? "#94a3b8" : "linear-gradient(135deg, #1a56db 0%, #1743b0 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  marginTop: 4,
                  letterSpacing: "0.01em",
                  boxShadow: submitting ? "none" : "0 4px 14px rgba(26,86,219,0.35)",
                  transition: "opacity 0.15s, box-shadow 0.15s",
                }}
              >
                {submitting ? "Signing in…" : "Sign in →"}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: "0.6875rem", marginTop: 18, letterSpacing: "0.02em" }}>
          © 2026 One Touch Electrical Service · All rights reserved
        </p>
      </div>
    </div>
  );
}
