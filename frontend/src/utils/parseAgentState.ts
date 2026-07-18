import type { AgentRole, AgentTrace, RiskTier } from "../types/api";

export type StepKey =
  | "planner"
  | "planning"
  | "profile"
  | "product"
  | "credit"
  | "fraud"
  | "auto_policy"
  | "legal"
  | "self-correction"
  | "legal_audit"
  | "risk"
  | "human_approval"
  | "operations";

export const STEP_LABELS: Record<StepKey, string> = {
  planner: "Planner - classify/router",
  planning: "Planner - MCP pre-flight",
  profile: "Customer Profile Agent",
  product: "Product & Policy Agent",
  credit: "Credit Risk Agent",
  fraud: "Fraud Investigation Agent",
  auto_policy: "Auto-Policy Gate",
  legal: "Legal & Compliance Agent",
  "self-correction": "Planner - self-correction loop",
  legal_audit: "Legal Audit Agent",
  risk: "Risk Consolidation",
  human_approval: "Human Approval Gate",
  operations: "Operations Agent",
};

export const STEP_AGENT: Record<StepKey, AgentRole> = {
  planner: "planner",
  planning: "planner",
  profile: "profile",
  product: "product",
  credit: "credit",
  fraud: "fraud",
  auto_policy: "auto_policy",
  legal: "legal",
  "self-correction": "planner",
  legal_audit: "legal_audit",
  risk: "risk",
  human_approval: "human_approval",
  operations: "operations",
};

export const FAST_LANE_STEPS: StepKey[] = [
  "planner",
  "planning",
  "profile",
  "product",
  "credit",
  "fraud",
  "auto_policy",
  "human_approval",
  "operations",
];

export const COMPLEX_LANE_STEPS: StepKey[] = [
  "planner",
  "planning",
  "profile",
  "product",
  "credit",
  "fraud",
  "legal",
  "legal_audit",
  "risk",
  "human_approval",
  "operations",
];

export const stepTemplateForRiskTier = (riskTier: RiskTier | undefined): StepKey[] =>
  riskTier === "FAST" ? FAST_LANE_STEPS : COMPLEX_LANE_STEPS;

export const deriveStepKey = (trace: AgentTrace): StepKey => {
  if (trace.stage === "planning" || trace.id.startsWith("trace-planning-")) return "planning";
  if (trace.stage === "autoPolicy") return "auto_policy";
  if (trace.stage === "humanApproval") return "human_approval";
  if (trace.id.startsWith("trace-planner-loop-")) return "self-correction";
  return trace.agent as StepKey;
};
