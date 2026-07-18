import { AgentRole, AgentStatus, DecisionEnvelope } from "./agent.types";

export interface ToolCallTrace {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "success" | "failed";
  sideEffectLevel?: "LOW" | "MEDIUM" | "HIGH";
}

export interface AgentTrace {
  id: string;
  runId: string;
  agent: AgentRole;
  task: string;
  status: AgentStatus;
  summary: string;
  toolCalls: ToolCallTrace[];
  startedAt: string;
  completedAt?: string;
  findings?: DecisionEnvelope[];
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
