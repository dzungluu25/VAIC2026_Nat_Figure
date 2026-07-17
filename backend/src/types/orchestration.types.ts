import { AgentTrace, AuditEvent, CostBudgetStatus } from "./trace.types";
import { ConditionPrecedent } from "./agent.types";
import { ApprovedLoanTerms, ApprovalMode, BusinessValueProjection } from "./product.types";

export interface OrchestrationRequest {
  prompt: string;
  caseId?: string;
  approvalToken?: string;
}

export interface OrchestrationResponse {
  runId: string;
  finalAnswer: string;
  traces: AgentTrace[];
  approvalTicketId?: string;
  conditions?: ConditionPrecedent[];
  budgetStatus?: CostBudgetStatus;
  auditEvents?: AuditEvent[];
  approvalMode?: ApprovalMode;
  approvedTerms?: ApprovedLoanTerms;
  businessValue?: BusinessValueProjection;
}

/**
 * Wire protocol for the streaming orchestration endpoint (NDJSON, one event per line).
 * "node_update" fires the moment a pipeline stage's trace appears in the LangGraph state
 * (i.e. that agent has just finished) — the client infers "in progress" for whichever node
 * is next in the known pipeline order rather than the backend faking a separate start signal.
 */
export type OrchestrationStreamEvent =
  | { type: "node_update"; node: AgentTrace["agent"]; trace: AgentTrace; riskTier?: "FAST" | "COMPLEX" }
  | { type: "final"; response: OrchestrationResponse }
  | { type: "error"; message: string };
