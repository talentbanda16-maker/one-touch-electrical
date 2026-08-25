import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ForemanReport from "./pages/ForemanReport";
import QsReport from "./pages/QsReport";
import SheReport from "./pages/SheReport";
import StoresReport from "./pages/StoresReport";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/foreman"
            element={
              <ProtectedRoute>
                <ForemanReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/qs"
            element={
              <ProtectedRoute>
                <QsReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/she"
            element={
              <ProtectedRoute>
                <SheReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/stores"
            element={
              <ProtectedRoute>
                <StoresReport />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
