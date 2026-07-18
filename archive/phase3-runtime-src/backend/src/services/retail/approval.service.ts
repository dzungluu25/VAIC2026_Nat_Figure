import { ApprovalRoute, GateStatus } from "../../types/orchestration.types";
import { newId } from "./retail-common";

export interface AutoPolicyInput {
  amount: number;
  dtiBufferSafe: boolean;
  consentComplete: boolean;
  legalBlockers: number;
  policyExceptions: number;
}

export const evaluateAutoPolicy = (input: AutoPolicyInput) => ({
  autoPolicyPassed:
    input.amount <= 500000000 &&
    input.dtiBufferSafe &&
    input.consentComplete &&
    input.legalBlockers === 0 &&
    input.policyExceptions === 0,
  gateStatus: "AUTO_APPROVED" as GateStatus,
});

export const issueAutoApprovalToken = () => newId("auto-token");

export const issueHumanApprovalToken = () => newId("human-token");

export const canExecuteHighSideEffect = (
  approvalRoute: ApprovalRoute,
  autoApprovalToken?: string,
  humanApprovalToken?: string
) => {
  if (approvalRoute === "AUTO_APPROVAL") {
    return Boolean(autoApprovalToken);
  }

  return Boolean(humanApprovalToken);
};
