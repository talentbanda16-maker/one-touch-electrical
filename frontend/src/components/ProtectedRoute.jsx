import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// `roles`, when given, gates the route to those roles — without it, a
// user could type an admin/management URL straight into the address bar
// and see a fully live, interactive form (e.g. "+ Create user") that
// only fails once they actually submit it, because the backend was the
// only thing enforcing the boundary. Not a security hole on its own
// (every route the backend cares about already rejects the request),
// but a real trust/UX problem — someone can be led to believe an action
// worked right up until a 403 lands.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
