import { apiFetch } from "./httpClient";
import type { ApprovalDecision, ApprovalRecord, AuditEvent, RunRecord, ValidationIssue, WorkflowDefinition, WorkflowVersion } from "../types/api";

interface RawAuditEvent {
  event_id?: string;
  eventId?: string;
  run_id?: string;
  runId?: string;
  timestamp: string;
  actor: string;
  action_type?: AuditEvent["actionType"];
  actionType?: AuditEvent["actionType"];
  status: AuditEvent["status"];
  details: string;
}

const normalizeAuditEvent = (event: RawAuditEvent): AuditEvent => ({
  eventId: event.eventId ?? event.event_id ?? `${event.run_id ?? event.runId}-${event.timestamp}`,
  runId: event.runId ?? event.run_id ?? "",
  timestamp: event.timestamp,
  actor: event.actor,
  actionType: event.actionType ?? event.action_type ?? "tool_call",
  status: event.status,
  details: event.details,
});

export const getRun = (token: string, runId: string): Promise<RunRecord> =>
  apiFetch<RunRecord>(`/api/runs/${encodeURIComponent(runId)}`, { token });

export const getRunEvents = async (token: string, runId: string): Promise<{ events: AuditEvent[] }> => {
  const result = await apiFetch<{ events: RawAuditEvent[] }>(`/api/runs/${encodeURIComponent(runId)}/events`, { token });
  return { events: result.events.map(normalizeAuditEvent) };
};

export const decideRunApproval = (
  token: string,
  runId: string,
  approvalId: string,
  decision: ApprovalDecision,
  comment?: string
): Promise<ApprovalRecord> =>
  apiFetch<ApprovalRecord>(`/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/decision`, {
    method: "POST",
    token,
    body: { decision, comment },
  });

export const resumeRun = (token: string, runId: string): Promise<RunRecord["response_payload"]> =>
  apiFetch<RunRecord["response_payload"]>(`/api/runs/${encodeURIComponent(runId)}/resume`, { method: "POST", token });

export const validateWorkflow = (
  token: string,
  definition: WorkflowDefinition
): Promise<{ valid: boolean; issues: ValidationIssue[] }> =>
  apiFetch<{ valid: boolean; issues: ValidationIssue[] }>("/api/workflows/validate", { method: "POST", token, body: definition });

export const createWorkflowVersion = (
  token: string,
  definition: WorkflowDefinition,
  version: string
): Promise<WorkflowVersion> =>
  apiFetch<WorkflowVersion>("/api/workflows", { method: "POST", token, body: { ...definition, version } });

export const publishWorkflowVersion = (
  token: string,
  workflowId: string,
  version: string
): Promise<WorkflowVersion> =>
  apiFetch<WorkflowVersion>(`/api/workflows/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(version)}/publish`, { method: "POST", token });

export const listWorkflowVersions = (
  token: string,
  workflowId: string
): Promise<{ versions: WorkflowVersion[] }> =>
  apiFetch<{ versions: WorkflowVersion[] }>(`/api/workflows/${encodeURIComponent(workflowId)}/versions`, { token });
