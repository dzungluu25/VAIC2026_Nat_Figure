import { randomUUID } from "crypto";
import { AuditEvent, ExecutionAction } from "../../types/orchestration.types";
import { AgentRole } from "../../types/agent.types";
import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { clock } from "../platform/clock.service";

export const nowIso = () => clock().nowIso();

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

export const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

export const auditEvent = (
  requestId: string,
  actor: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
): AuditEvent => ({
  id: newId("audit"),
  requestId,
  actor,
  eventType,
  message,
  timestamp: nowIso(),
  metadata,
});

export const agentTrace = (
  runId: string,
  agent: AgentRole,
  task: string,
  summary: string,
  toolCalls: ToolCallTrace[] = [],
  status: AgentTrace["status"] = "completed"
): AgentTrace => {
  const startedAt = nowIso();
  return {
    id: newId(`trace-${agent}`),
    runId,
    agent,
    task,
    status,
    summary,
    toolCalls,
    startedAt,
    completedAt: nowIso(),
  };
};

export const highAction = (
  tool: string,
  status: ExecutionAction["status"],
  message: string
): ExecutionAction => ({
  tool,
  sideEffect: "HIGH",
  status,
  requiresApprovalToken: true,
  message,
});
