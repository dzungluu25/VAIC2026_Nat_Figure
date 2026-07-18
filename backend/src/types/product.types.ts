import { AgentRole } from "./agent.types";

export type BankUserRole = "RELATIONSHIP_MANAGER" | "CREDIT_OFFICER" | "CREDIT_APPROVER" | "RISK_COMPLIANCE" | "OPERATIONS" | "PRODUCT_OWNER";
export type ApprovalMode = "AUTO_APPROVAL" | "HYBRID_APPROVAL";

export interface AgentContract {
  agent: AgentRole;
  displayName: string;
  mission: string;
  primaryUsers: BankUserRole[];
  mayDecide: string[];
  mustNot: string[];
  slaMs: number;
  requiredEvidence: string[];
  failurePolicy: "FAIL_CLOSED" | "RETRY_THEN_ESCALATE";
}

export interface ApprovedLoanTerms {
  loanAmount: number;
  tenureYears: number;
  annualRate: number;
  approvalMode: ApprovalMode;
  source: "ORIGINAL_REQUEST" | "RESTRUCTURED_PROPOSAL";
}

export interface BusinessValueProjection {
  annualInterestRevenue: number;
  annualFundingCost: number;
  expectedCreditLoss: number;
  annualOperatingCost: number;
  riskAdjustedProfit: number;
  rarocPercent: number;
  estimatedManualMinutesSaved: number;
  estimatedProcessingCostSavedVnd: number;
  profitable: boolean;
  assumptions: string[];
}

export interface DecisionConfidence {
  status: "VERIFIED" | "NEEDS_REVIEW";
  score: number;
  evidenceCoverage: number;
  reasons: string[];
  policyVersions: Record<string, string>;
}
