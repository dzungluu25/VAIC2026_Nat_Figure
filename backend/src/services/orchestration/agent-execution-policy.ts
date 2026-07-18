import type { AgentRole } from "../../types/agent.types";
import type { OrchestrationTerminalFailure } from "../../types/orchestration.types";
import type { CorrectableStage } from "./orchestration-validation.service";

export type StageCriticality = "REQUIRED" | "CONDITIONAL_REQUIRED" | "OPTIONAL_DEGRADABLE";
export type StageFailureAction = "STOP" | "CONTINUE_WITH_WARNING";

export interface AgentExecutionPolicy {
  stage: CorrectableStage;
  agent: AgentRole;
  criticality: StageCriticality;
  failureAction: StageFailureAction;
  skipAllowed: boolean;
  skipPolicy?: string;
}

export const AGENT_EXECUTION_POLICIES: Record<CorrectableStage, AgentExecutionPolicy> = {
  classify: {
    stage: "classify",
    agent: "planner",
    criticality: "REQUIRED",
    failureAction: "STOP",
    skipAllowed: false,
  },
  profile: {
    stage: "profile",
    agent: "profile",
    criticality: "REQUIRED",
    failureAction: "STOP",
    skipAllowed: false,
  },
  product: {
    stage: "product",
    agent: "product",
    criticality: "REQUIRED",
    failureAction: "STOP",
    skipAllowed: false,
  },
  credit: {
    stage: "credit",
    agent: "credit",
    criticality: "REQUIRED",
    failureAction: "STOP",
    skipAllowed: false,
  },
  fraud: {
    stage: "fraud",
    agent: "fraud",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: true,
    skipPolicy: "Only when the planning stage completed and produced no fraud-investigation flag.",
  },
  autoPolicy: {
    stage: "autoPolicy",
    agent: "auto_policy",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: false,
  },
  legal: {
    stage: "legal",
    agent: "legal",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: true,
    skipPolicy: "Only outside the complex lane after a verified FAST_PASS.",
  },
  selfCorrection: {
    stage: "selfCorrection",
    agent: "planner",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: true,
    skipPolicy: "Only when legal completed and no insurance-tying violation remains.",
  },
  legalAudit: {
    stage: "legalAudit",
    agent: "legal_audit",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: true,
    skipPolicy: "Only outside the complex lane after a verified FAST_PASS.",
  },
  risk: {
    stage: "risk",
    agent: "risk",
    criticality: "CONDITIONAL_REQUIRED",
    failureAction: "STOP",
    skipAllowed: true,
    skipPolicy: "Only outside the complex lane after a verified FAST_PASS.",
  },
};

export const agentForStage = (stage: CorrectableStage): AgentRole =>
  AGENT_EXECUTION_POLICIES[stage].agent;

export const buildStageTerminalFailure = (
  stage: CorrectableStage,
  attempts: number,
  errors: string[]
): OrchestrationTerminalFailure => {
  const policy = AGENT_EXECUTION_POLICIES[stage];
  return {
    code: "MULTI_AGENT_STAGE_FAILED",
    stage,
    agent: policy.agent,
    severity: "blocking",
    attempts,
    errors,
    action: "STOP",
    message: `Required stage ${stage} failed after ${attempts} validation attempt(s); downstream agents and operations were not executed.`,
  };
};
