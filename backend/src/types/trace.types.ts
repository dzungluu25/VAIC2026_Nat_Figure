import type { AgentRole, AgentStatus } from "./agent.types";

export interface ToolCallTrace {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "success" | "failed";
}

export interface AgentTrace {
  id: string;
  runId: string;
  agent: AgentRole;
  stage?: string;
  task: string;
  status: AgentStatus;
  executionStatus?: "completed" | "skipped_by_policy" | "degraded" | "terminal_failure";
  statusReason?: string;
  summary: string;
  toolCalls: ToolCallTrace[];
  startedAt: string;
  completedAt?: string;
  findings?: any[]; // Holds decision envelopes if any
}

export interface AuditEvent {
  eventId: string;
  runId: string;
  timestamp: string;
  actor: string; // e.g. "legal-agent", "ops-agent", "planner-agent", "human-admin"
  actionType: "agent_call" | "tool_call" | "model_call" | "dashboard_output" | "human_approval";
  status: "allowed" | "blocked";
  details: string;
}

export interface CostBudgetStatus {
  piiMasked: boolean;
  missingConsentCalls: number;
  highWritesBeforeApproval: number;
  modelCallsUsed: number;
  maxModelCalls: number;
  estimatedCostUSD: number;
  replayMode: boolean;
}
