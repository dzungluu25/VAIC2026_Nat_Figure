import type { AgentRole } from "../../types/agent.types";
import type { AgentTrace } from "../../types/trace.types";
import type { ApprovalMode } from "../../types/product.types";

export const MAX_STAGE_CORRECTIONS = 2;

export type CorrectableStage =
  | "classify"
  | "profile"
  | "product"
  | "credit"
  | "fraud"
  | "autoPolicy"
  | "legal"
  | "selfCorrection"
  | "legalAudit"
  | "risk";

export type ValidationRoute = "continue" | "retry" | "fail";

interface TraceValidationOptions {
  runId: string;
  agent: AgentRole;
  requiredTools?: string[];
  requireAnyTool?: boolean;
  allowEmptyBlockedFindings?: boolean;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isValidDate = (value: unknown): boolean =>
  isNonEmptyString(value) && Number.isFinite(Date.parse(value));

export const validateAgentTrace = (
  trace: AgentTrace | undefined,
  options: TraceValidationOptions
): string[] => {
  const errors: string[] = [];
  if (!trace) return [`${options.agent}: missing agent trace`];

  if (!isNonEmptyString(trace.id)) errors.push(`${options.agent}: missing trace id`);
  if (trace.runId !== options.runId) errors.push(`${options.agent}: trace runId mismatch`);
  if (trace.agent !== options.agent) errors.push(`${options.agent}: unexpected trace agent ${trace.agent}`);
  if (!isNonEmptyString(trace.task)) errors.push(`${options.agent}: missing task`);
  if (!isNonEmptyString(trace.summary)) errors.push(`${options.agent}: missing summary`);
  if (!isValidDate(trace.startedAt)) errors.push(`${options.agent}: invalid startedAt`);
  if (!isValidDate(trace.completedAt)) errors.push(`${options.agent}: invalid completedAt`);
  if (trace.status === "failed" || trace.status === "pending" || trace.status === "running") {
    errors.push(`${options.agent}: non-terminal or failed status ${trace.status}`);
  }

  if (!Array.isArray(trace.toolCalls)) {
    errors.push(`${options.agent}: toolCalls is not an array`);
  } else {
    for (const call of trace.toolCalls) {
      if (!isNonEmptyString(call.toolName)) errors.push(`${options.agent}: tool call has no name`);
      if (call.status !== "success") errors.push(`${options.agent}: tool ${call.toolName || "unknown"} failed`);
      if (!call.input || typeof call.input !== "object") errors.push(`${options.agent}: invalid tool input`);
      if (!call.output || typeof call.output !== "object") errors.push(`${options.agent}: invalid tool output`);
    }

    for (const requiredTool of options.requiredTools ?? []) {
      if (!trace.toolCalls.some(call => call.toolName === requiredTool && call.status === "success")) {
        errors.push(`${options.agent}: missing successful tool ${requiredTool}`);
      }
    }
    if (options.requireAnyTool && !trace.toolCalls.some(call => call.status === "success")) {
      errors.push(`${options.agent}: no successful evidence-producing tool call`);
    }
  }

  if (trace.findings !== undefined && !Array.isArray(trace.findings)) {
    errors.push(`${options.agent}: findings is not an array`);
  }
  if (trace.status === "blocked" && !options.allowEmptyBlockedFindings && (!trace.findings || trace.findings.length === 0)) {
    errors.push(`${options.agent}: blocked trace has no finding`);
  }

  for (const [index, finding] of (trace.findings ?? []).entries()) {
    if (!finding || typeof finding !== "object") {
      errors.push(`${options.agent}: finding ${index} is not an object`);
      continue;
    }
    if (!isNonEmptyString(finding.decisionId)) errors.push(`${options.agent}: finding ${index} has no decisionId`);
    if (!isNonEmptyString(finding.finding)) errors.push(`${options.agent}: finding ${index} has no description`);
    if (!Array.isArray(finding.ruleIds)) errors.push(`${options.agent}: finding ${index} has invalid ruleIds`);
    if (!Array.isArray(finding.citations)) errors.push(`${options.agent}: finding ${index} has invalid citations`);
    if (!finding.evidence || typeof finding.evidence !== "object") errors.push(`${options.agent}: finding ${index} has invalid evidence`);
  }

  return [...new Set(errors)];
};

interface DecisionValidationInput {
  finalDecision: string;
  approvalMode: ApprovalMode;
  approvedTerms?: { loanAmount: number; tenureYears: number; annualRate: number };
  confidenceStatus?: string;
  requiredFixes: string[];
}

export const validateDecisionOutput = (input: DecisionValidationInput): string[] => {
  const errors: string[] = [];
  const allowedDecisions = new Set(["FAST_PASS", "PASS", "CONDITIONAL_PASS", "REJECTED", "HUMAN_ESCALATION"]);
  if (!allowedDecisions.has(input.finalDecision)) errors.push(`risk: invalid final decision ${input.finalDecision}`);

  if (input.finalDecision === "FAST_PASS" && input.approvalMode !== "AUTO_APPROVAL") {
    errors.push("risk: FAST_PASS requires AUTO_APPROVAL");
  }
  if (["FAST_PASS", "PASS", "CONDITIONAL_PASS"].includes(input.finalDecision)) {
    const terms = input.approvedTerms;
    if (
      !terms ||
      !Number.isFinite(terms.loanAmount) || terms.loanAmount <= 0 ||
      !Number.isInteger(terms.tenureYears) || terms.tenureYears <= 0 ||
      !Number.isFinite(terms.annualRate) || terms.annualRate <= 0
    ) {
      errors.push(`risk: ${input.finalDecision} requires valid approved terms`);
    }
    if (input.confidenceStatus !== "VERIFIED") {
      errors.push(`risk: ${input.finalDecision} requires VERIFIED confidence`);
    }
  }
  if (input.finalDecision === "HUMAN_ESCALATION" && input.requiredFixes.length === 0) {
    errors.push("risk: HUMAN_ESCALATION requires an actionable reason");
  }
  return errors;
};

export const resolveValidationRoute = (
  errors: string[],
  failedValidations: number,
  modelCallsUsed: number,
  maximumModelCalls: number,
  maximumStageCorrections = MAX_STAGE_CORRECTIONS
): ValidationRoute => {
  if (errors.length === 0) return "continue";
  if (failedValidations <= maximumStageCorrections && modelCallsUsed < maximumModelCalls) return "retry";
  return "fail";
};
