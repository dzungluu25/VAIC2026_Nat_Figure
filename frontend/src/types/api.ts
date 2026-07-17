// Mirrors backend/src/types/{agent,trace,orchestration}.types.ts — the wire contract
// between this frontend and the Express/LangGraph backend.

export type AgentRole =
  | "planner"
  | "profile"
  | "credit"
  | "product"
  | "legal"
  | "risk"
  | "operations"
  | "governance";

export type AgentStatus = "pending" | "running" | "completed" | "blocked" | "failed";

export type FindingSeverity = "INFO" | "CONDITION" | "WARNING" | "BLOCKER";

export type BlocksAt = "APPROVAL" | "CONTRACT_SIGNING" | "DISBURSEMENT" | "EXTERNAL_DATA_CALL" | "NONE";

export interface DecisionEnvelope {
  decisionId: string;
  agent: AgentRole;
  status: "PASS" | "CONDITIONAL_PASS" | "VIOLATION" | "BLOCKED" | "FAIL";
  severity: FindingSeverity;
  blocksAt: BlocksAt;
  finding: string;
  evidence: Record<string, unknown>;
  ruleIds: string[];
  citations: string[];
  requiredFix?: string;
}

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
  task: string;
  status: AgentStatus | "completed" | "failed" | "blocked";
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
  actor: string;
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

export interface ConditionPrecedent {
  id: string;
  description: string;
  blocksAt: BlocksAt;
  status: "pending" | "fulfilled";
}

export interface OrchestrationResponse {
  runId: string;
  finalAnswer: string;
  traces: AgentTrace[];
  approvalTicketId?: string;
  conditions?: ConditionPrecedent[];
  budgetStatus?: CostBudgetStatus;
  auditEvents?: AuditEvent[];
}

export type RiskTier = "FAST" | "COMPLEX";

export type OrchestrationStreamEvent =
  | { type: "node_update"; node: AgentRole; trace: AgentTrace; riskTier?: RiskTier }
  | { type: "final"; response: OrchestrationResponse }
  | { type: "error"; message: string };

export type UserRole = "CREDIT_OFFICER" | "CREDIT_APPROVER";

export interface AuthUser {
  sub: string;
  role: UserRole;
}
