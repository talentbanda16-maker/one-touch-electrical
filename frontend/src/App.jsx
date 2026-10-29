import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ForemanReport from "./pages/ForemanReport";
import QsReport from "./pages/QsReport";
import SheReport from "./pages/SheReport";
import SheReportPeriod from "./pages/SheReportPeriod";
import SheIncidentReport from "./pages/SheIncidentReport";
import ShePolicy from "./pages/ShePolicy";
import SheInductionTraining from "./pages/SheInductionTraining";
import SheInternalTraining from "./pages/SheInternalTraining";
import SheExternalTraining from "./pages/SheExternalTraining";
import DeckTubingChecklist from "./pages/DeckTubingChecklist";
import SlabTubingChecklist from "./pages/SlabTubingChecklist";
import TrenchingChecklist from "./pages/TrenchingChecklist";
import GrinderProcedure from "./pages/GrinderProcedure";
import DocumentedInfoControl from "./pages/DocumentedInfoControl";
import SystemProcedureIndex from "./pages/SystemProcedureIndex";
import SheMonthlyReport from "./pages/SheMonthlyReport";
import SheWeeklyReport from "./pages/SheWeeklyReport";
import HousekeepingInspection from "./pages/HousekeepingInspection";
import SheRegister from "./pages/SheRegister";
import SheReportsMenu from "./pages/SheReportsMenu";
import SheProcedureMenu from "./pages/SheProcedureMenu";
import SheTrainingMenu from "./pages/SheTrainingMenu";
import SheInspectionsMenu from "./pages/SheInspectionsMenu";
import StoresReport from "./pages/StoresReport";
import MaterialReceived from "./pages/MaterialReceived";
import MaterialIssued from "./pages/MaterialIssued";
import MaterialRequest from "./pages/MaterialRequest";
import StockCount from "./pages/StockCount";
import ReturnToSupplier from "./pages/ReturnToSupplier";
import StockReport from "./pages/StockReport";
import FinanceReport from "./pages/FinanceReport";
import FinanceDashboard from "./pages/FinanceDashboard";
import FinancePaymentHistory from "./pages/FinancePaymentHistory";
import FinanceProcurementSpend from "./pages/FinanceProcurementSpend";
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
import QsDashboard from "./pages/QsDashboard";
import EngineerDashboard from "./pages/EngineerDashboard";
import ProjectKpis from "./pages/ProjectKpis";
import ActivityTimeline from "./pages/ActivityTimeline";
import QsPayments from "./pages/QsPayments";
import SiteProgress from "./pages/SiteProgress";
import QsProcurement from "./pages/QsProcurement";
import QsInvoiceChart from "./pages/QsInvoiceChart";
import ProductivityReportPrint from "./pages/ProductivityReportPrint";
import SupervisorReview from "./pages/SupervisorReview";
import ProductivityFinalize from "./pages/ProductivityFinalize";

// Every role except Management — Management is read-only and should
// never even see a live, submittable report form, not just have the
// submit fail server-side after the fact.
const NON_MANAGEMENT_ROLES = ["TECHNICAL_MANAGER", "ENGINEER", "FOREMAN", "QS", "SHE_OFFICER", "STORESMAN", "FINANCE", "GENERAL_WORKER"];

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
            path="/dashboard/engineer"
            element={
              <ProtectedRoute roles={["ENGINEER", "TECHNICAL_MANAGER"]}>
                <EngineerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/qs"
            element={
              <ProtectedRoute roles={["QS", "TECHNICAL_MANAGER"]}>
                <QsDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/finance"
            element={
              <ProtectedRoute roles={["FINANCE"]}>
                <FinanceDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/payment-history"
            element={
              <ProtectedRoute roles={["FINANCE"]}>
                <FinancePaymentHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/procurement-spend"
            element={
              <ProtectedRoute roles={["FINANCE"]}>
                <FinanceProcurementSpend />
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
            path="/reports/she-period/:period"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheReportPeriod />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/she-incident"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheIncidentReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/policy"
            element={
              <ProtectedRoute roles={["SHE_OFFICER", "TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ShePolicy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/training/induction"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheInductionTraining />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/training/internal"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheInternalTraining />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/training/external"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheExternalTraining />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/inspections/quality/deck-tubing"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <DeckTubingChecklist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/inspections/quality/slab-tubing"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SlabTubingChecklist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/register/:type"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheRegister />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/inspections/housekeeping"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <HousekeepingInspection />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/weekly-report"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheWeeklyReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/monthly-report"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheMonthlyReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/procedure/system-index"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SystemProcedureIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/procedure/documented-information"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <DocumentedInfoControl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/procedure/grinder"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <GrinderProcedure />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/inspections/quality/trenching"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <TrenchingChecklist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/reports-menu"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheReportsMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/procedure-menu"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheProcedureMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/training-menu"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheTrainingMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/she/inspections-menu"
            element={
              <ProtectedRoute roles={["SHE_OFFICER"]}>
                <SheInspectionsMenu />
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
            path="/reports/material-received"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <MaterialReceived />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/material-issued"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <MaterialIssued />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/material-request"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <MaterialRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/stock-count"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <StockCount />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/return-to-supplier"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <ReturnToSupplier />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/stock-report"
            element={
              <ProtectedRoute roles={NON_MANAGEMENT_ROLES}>
                <StockReport />
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
            path="/dashboard/kpis"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ProjectKpis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/timeline"
            element={
              <ProtectedRoute roles={["TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <ActivityTimeline />
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
          <Route
            path="/qs-payments"
            element={
              <ProtectedRoute roles={["FINANCE", "TECHNICAL_MANAGER"]}>
                <QsPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/site-progress"
            element={
              <ProtectedRoute roles={["QS", "TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <SiteProgress />
              </ProtectedRoute>
            }
          />
          <Route
            path="/procurement"
            element={
              <ProtectedRoute roles={["QS", "TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <QsProcurement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoice-chart"
            element={
              <ProtectedRoute roles={["QS", "TECHNICAL_MANAGER", "MANAGEMENT"]}>
                <QsInvoiceChart />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
