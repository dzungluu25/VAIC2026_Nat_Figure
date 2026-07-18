import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppShell } from "./layouts/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { MetricsPage } from "./pages/MetricsPage";
import { DossierQueuePage } from "./pages/DossierQueuePage";
import { DossierDetailPage } from "./pages/DossierDetailPage";
import { PolicyConsolePage } from "./pages/PolicyConsolePage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";
import { ChecklistAdminPage } from "./pages/ChecklistAdminPage";
import { UsersPage } from "./pages/UsersPage";
import { AdminPage } from "./pages/AdminPage";
import { LoginPage } from "./pages/LoginPage";
import { LandingPage } from "./pages/LandingPage";
import { getDemoApproverSession } from "./services/authService";
import { useSessionStore } from "./store/sessionStore";

// Public routes never trigger the demo auto-login, so a logged-out user stays on them.
const PUBLIC_PATHS = ["/login", "/landing"];

const isTokenExpired = (token: string): boolean => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // Use standard base64 decoding supporting utf-8
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    if (typeof payload.exp !== "number") return true;
    return payload.exp < Date.now() / 1000 - 10;
  } catch {
    return true;
  }
};

const AutoLoginWrapper = ({ children }: { children: React.ReactNode }) => {
  const { accessToken, setSession } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const isPublicRoute = PUBLIC_PATHS.includes(window.location.pathname);

  useEffect(() => {
    if (isPublicRoute) {
      setLoading(false);
      return;
    }
    const hasValidToken = accessToken && !isTokenExpired(accessToken);
    if (!hasValidToken) {
      setLoading(true);
      getDemoApproverSession()
        .then(session => {
          setSession({
            accessToken: session.accessToken,
            role: session.role,
            tenantId: session.tenantId
          });
          setLoading(false);
        })
        .catch(err => {
          console.error("Auto login failed:", err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [accessToken, isPublicRoute, setSession]);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#0d0e12",
        color: "#ffffff",
        fontFamily: "Inter, sans-serif"
      }}>
        <div style={{
          width: "30px",
          height: "30px",
          border: "3px solid #1f2937",
          borderTop: "3px solid #10b981",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <p style={{ marginTop: "15px", fontSize: "14px", color: "#9ca3af" }}>Đang khởi tạo phiên làm việc...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
};

export const App = () => (
  <AutoLoginWrapper>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="dossiers" element={<DossierQueuePage />} />
          <Route path="dossiers/:id" element={<DossierDetailPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="policy" element={<PolicyConsolePage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="checklists" element={<ChecklistAdminPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="operations" element={<Navigate to="/workflows" replace />} />
          <Route path="metrics" element={<MetricsPage />} />
        </Route>
        <Route path="login" element={<LoginPage />} />
        <Route path="landing" element={<LandingPage />} />
        <Route path="workspace" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AutoLoginWrapper>
);
