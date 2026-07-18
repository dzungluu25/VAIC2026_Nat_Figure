import { AgentTrace } from "./trace.types";

export interface OrchestrationRequest {
  prompt: string;
}

export interface OrchestrationResponse {
  runId: string;
  finalAnswer: string;
  traces: AgentTrace[];
  approvalTicketId?: string;
}

export type RiskTier = "FAST" | "COMPLEX";

export type ApprovalRoute = "AUTO_APPROVAL" | "HYBRID_APPROVAL";

export type RequestLifecycleStatus =
  | "CREATED"
  | "ROUTED"
  | "ANALYZING"
  | "WAITING_HUMAN_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type GateStatus =
  | "AUTO_APPROVED"
  | "CONDITIONAL_PASS"
  | "REPLAN_REQUIRED"
  | "CONSENT_REQUIRED"
  | "REJECT_OR_REQUEST_LOWER_AMOUNT"
  | "REJECT"
  | "ESCALATE";

export interface DemoCaseSummary {
  caseId: string;
  title: string;
  product: string;
  description: string;
  riskTier: RiskTier;
  approvalRoute: ApprovalRoute;
  targetSlaHours: number;
  trapCount: number;
  expectedOutcome: string;
}

export interface AuditEvent {
  id: string;
  requestId: string;
  actor: string;
  eventType: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionAction {
  tool: string;
  sideEffect: "NONE" | "LOW" | "HIGH" | "CRITICAL";
  status: "PENDING" | "BLOCKED" | "CREATED" | "SENT" | "APPENDED";
  requiresApprovalToken: boolean;
  message: string;
}

export interface DecisionCondition {
  conditionId: string;
  blocksAt: "APPROVAL" | "CONTRACT_SIGNING" | "DISBURSEMENT" | "EXTERNAL_DATA_CALL";
  text: string;
  basisRuleId: string;
}

export interface GovernanceSummary {
  tier: RiskTier;
  approvalRoute: ApprovalRoute;
  modelCallsUsed: number;
  modelCallsBudget: number;
  estimatedCostUsd: number;
  maxCostUsd: number;
  rawPiiToLlm: boolean;
  maskedFieldCount: number;
  replayMode: boolean;
  cacheHitCount: number;
}

export interface RetailCaseRun {
  requestId: string;
  caseId: string;
  title: string;
  product: string;
  riskTier: RiskTier;
  approvalRoute: ApprovalRoute;
  status: RequestLifecycleStatus;
  gateStatus: GateStatus;
  finalAnswer: string;
  autoApprovalToken?: string;
  humanApprovalToken?: string;
  requiresHumanApproval: boolean;
  customerRequest: Record<string, unknown>;
  systemProposal: Record<string, unknown>;
  conditions: DecisionCondition[];
  executionActions: ExecutionAction[];
  governance: GovernanceSummary;
  traces: AgentTrace[];
  audit: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}
