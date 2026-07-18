import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { MetricsPage } from "./pages/MetricsPage";
import { DossierQueuePage } from "./pages/DossierQueuePage";
import { DossierDetailPage } from "./pages/DossierDetailPage";
import { PolicyConsolePage } from "./pages/PolicyConsolePage";
import { LoginPage } from "./pages/LoginPage";
import { useSessionStore } from "./store/sessionStore";
import type { ReactNode } from "react";
import type { UserRole } from "./types/api";

const RequireSession = () => useSessionStore(state => state.accessToken) ? <Outlet /> : <Navigate to="/login" replace />;
const RequireRole = ({ roles, children }: { roles: UserRole[]; children: ReactNode }) => {
  const role = useSessionStore(state => state.role);
  return role && roles.includes(role) ? children : <Navigate to="/dossiers" replace />;
};

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route path="workspace" element={<RequireRole roles={["CREDIT_OFFICER", "CREDIT_APPROVER"]}><DashboardPage /></RequireRole>} />
          <Route path="dossiers" element={<DossierQueuePage />} />
          <Route path="dossiers/:id" element={<DossierDetailPage />} />
          <Route path="agents" element={<RequireRole roles={["CREDIT_OFFICER", "CREDIT_APPROVER"]}><AgentsPage /></RequireRole>} />
          <Route path="policy" element={<RequireRole roles={["CREDIT_APPROVER"]}><PolicyConsolePage /></RequireRole>} />
          <Route path="metrics" element={<RequireRole roles={["CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"]}><MetricsPage /></RequireRole>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
