import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { ProtectedRoute } from "./pages/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MetricsPage } from "./pages/MetricsPage";

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  </BrowserRouter>
);
