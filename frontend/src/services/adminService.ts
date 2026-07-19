import { apiFetch } from "./httpClient";

export type HealthStatus = "ok" | "degraded" | "error" | "not_configured";

export interface HealthEntry {
  name: string;
  status: HealthStatus;
  detail: string;
}

export interface ToolEntry {
  key: string;
  label: string;
  kind: "agent" | "tool";
  status: HealthStatus;
  note: string;
}

export interface AdminSystemOverview {
  generatedAt: string;
  health: HealthEntry[];
  tools: ToolEntry[];
  versions: {
    decisionPolicy: { id: string; version: string; effectiveFrom: string; profitabilityOverrides: string[] };
    routingCatalog: { id: string; version: string };
    productCatalog: { id: string; version: string };
    agentContracts: { id: string; version: string };
    regulatoryBaseline: { id: string; version: string };
  };
  stats: {
    dossiersByStatus: Record<string, number>;
    totalDossiers: number;
    runs: number;
    notificationsSent: number;
    emailsSent: number;
    emailsFailed: number;
    formRejections: number;
  };
}

export const getAdminSystem = (token: string): Promise<AdminSystemOverview> =>
  apiFetch<AdminSystemOverview>("/api/admin/system", { token });
