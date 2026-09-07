import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ForemanReport from "./pages/ForemanReport";
import QsReport from "./pages/QsReport";
import SheReport from "./pages/SheReport";
import StoresReport from "./pages/StoresReport";
import FinanceReport from "./pages/FinanceReport";
import Approvals from "./pages/Approvals";
import Instructions from "./pages/Instructions";
import Actions from "./pages/Actions";
import ProjectAnalytics from "./pages/ProjectAnalytics";
import ProjectsComparison from "./pages/ProjectsComparison";
import CombinedReport from "./pages/CombinedReport";
import QsAnalytics from "./pages/QsAnalytics";
import StoresAnalytics from "./pages/StoresAnalytics";
import SheAnalytics from "./pages/SheAnalytics";
import ForemanAnalytics from "./pages/ForemanAnalytics";
import FinanceAnalytics from "./pages/FinanceAnalytics";
import OfflineBanner from "./components/OfflineBanner";
import NotificationBell from "./components/NotificationBell";
import ProjectSettings from "./pages/ProjectSettings";
import ManagementDashboard from "./pages/ManagementDashboard";
import ReportCenter from "./pages/ReportCenter";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import GeneralWorkerReport from "./pages/GeneralWorkerReport";
import ProductivityReportPrint from "./pages/ProductivityReportPrint";
import SupervisorReview from "./pages/SupervisorReview";
import ProductivityFinalize from "./pages/ProductivityFinalize";

// Every role except Management — Management is read-only and should
// never even see a live, submittable report form, not just have the
// submit fail server-side after the fact.
const NON_MANAGEMENT_ROLES = ["TECHNICAL_MANAGER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "GENERAL_WORKER"];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineBanner />
        <NotificationBell />
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
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <ForemanReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/qs"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <QsReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/she"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <SheReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/stores"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <StoresReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/finance"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <FinanceReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/productivity"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <GeneralWorkerReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productivity/review"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "FOREMAN"]}>
                <SupervisorReview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productivity/finalize"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ProductivityFinalize />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productivity/:id/print"
            element={
              <ProtectedRoute>
                <ProductivityReportPrint />
              </ProtectedRoute>
            }
          />
          <Route
            path="/approvals"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER"]}>
                <Approvals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructions"
            element={
              <ProtectedRoute>
                <Instructions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/actions"
            element={
              <ProtectedRoute>
                <Actions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ProjectAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/compare"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ProjectsComparison />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/combined"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER"]}>
                <CombinedReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/qs"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <QsAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/stores"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <StoresAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/she"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <SheAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/foreman"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ForemanAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/finance"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <FinanceAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER"]}>
                <ProjectSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/management"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ManagementDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/generate"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "FINANCE", "MANAGEMENT"]}>
                <ReportCenter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-log"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER"]}>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
