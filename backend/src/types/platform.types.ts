export type WorkflowStatus = "draft" | "published" | "deprecated";
export type WorkflowNodeType = "start" | "router" | "planner" | "agent" | "retrieval" | "tool" | "validation" | "decision" | "human_gate" | "action" | "compensation" | "end";
export interface WorkflowNode { id: string; type: WorkflowNodeType; outputSchema?: Record<string, unknown>; citationRequired?: boolean; retryLimit?: number; risk?: "low" | "medium" | "high"; allowedTools?: string[]; compensationNodeId?: string; }
export interface WorkflowEdge { from: string; to: string; condition?: string; fallback?: boolean; }
export interface WorkflowDefinition { id: string; tenantId: string; name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; }
export interface WorkflowVersion { workflowId: string; tenantId: string; version: string; status: WorkflowStatus; definition: WorkflowDefinition; effectiveFrom?: string; createdBy: string; createdAt: string; publishedBy?: string; publishedAt?: string; }
export interface CitationPolicy { required: boolean; rejectIfMissing: boolean; minimumConfidence: number; allowedSourceTypes: string[]; }
export interface TenantRuntimeConfig {
  tenantId: string;
  version: string;
  thresholds: {
    minCreditScore: number;
    maxDti: number;
    maxLtvByPropertyType: { apartment: number; house: number; land: number };
    minimumMonthlyLivingExpenseVnd: number;
    incomeHaircuts: { salary: number; freelance: number; rental: number };
    maximumRepaymentAgeMargin: number;
    fraud: { incomeDebtRatioCeiling: number; collateralValueToLoanCeiling: number };
  };
  runtime: { maxRetriesPerAgent: number; maxSteps: number; maxTokens: number; timeoutSeconds: number };
  allowedModels: string[];
  citationPolicy: CitationPolicy;
  effectiveFrom: string;
  updatedBy: string;
}
export type SecurityScreeningStatus = "accepted" | "sanitized" | "rejected" | "requires_manual_review";
export interface SecurityScreeningResult { status: SecurityScreeningStatus; sanitizedInput: string; signals: string[]; containsPii: boolean; }
export type ValidationIssueCode = "INVALID_SCHEMA" | "MISSING_CITATION" | "INVALID_SOURCE" | "OUTDATED_SOURCE" | "UNSUPPORTED_CLAIM" | "SOURCE_CONFLICT" | "LOW_CONFIDENCE" | "BUSINESS_RULE_FAILED" | "LEGAL_VIOLATION" | "RETRY_EXCEEDED";
export interface ValidationIssue { code: ValidationIssueCode; message: string; nodeId?: string; claimId?: string; retryable: boolean; }
export interface ClaimCitation { claimId: string; documentId: string; version: string; section: string; chunkId: string; effectiveFrom: string; sourceType: string; retrievedAt: string; }
export type ApprovalDecision = "approved" | "rejected" | "more_information";
export interface ApprovalRecord { id: string; tenantId: string; runId: string; checkpointId: string; workflowId: string; workflowVersion: string; requiredRole: string; status: "pending" | ApprovalDecision | "expired"; expiresAt: string; decidedBy?: string; decidedAt?: string; comment?: string; createdAt: string; }
export interface ActionStepResult { stepId: string; status: "completed" | "failed" | "skipped"; idempotencyKey: string; attempts: number; output?: Record<string, unknown>; error?: string; }
export interface CompensationResult { stepId: string; status: "completed" | "failed"; output?: Record<string, unknown>; error?: string; }
export interface RuntimeState { runId: string; tenantId: string; workflowId: string; workflowVersion: string; configVersion: string; currentNode?: string; completedNodes: string[]; retryCounters: Record<string, number>; stepCount: number; tokenUsage: number; startedAt: string; approvalStatus?: ApprovalRecord["status"]; validationIssues: ValidationIssue[]; actionResults: ActionStepResult[]; compensationResults: CompensationResult[]; }
