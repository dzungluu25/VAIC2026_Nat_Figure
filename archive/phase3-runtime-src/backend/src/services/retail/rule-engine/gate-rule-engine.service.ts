import { GateStatus } from "../../../types/orchestration.types";
import { CreditAnalysis, LegalFinding } from "./rule-engine.types";

export const runGateRuleEngine = (credit: CreditAnalysis, findings: LegalFinding[]): GateStatus => {
  const consentOnly =
    findings.length === 1 && findings[0].ruleId === "PDPD-CONSENT-001" && findings[0].status === "CONSENT_REQUIRED";
  const insuranceFinding = findings.find((finding) => finding.ruleId === "TCTD-INSURANCE-TYING-001");
  const nonApprovalFindings = findings.filter((finding) => finding.blocksAt !== "APPROVAL");

  if (!credit.proposalPasses) {
    return "REJECT_OR_REQUEST_LOWER_AMOUNT";
  }

  if (consentOnly) {
    return "CONSENT_REQUIRED";
  }

  if (insuranceFinding && nonApprovalFindings.length === 0) {
    return "REPLAN_REQUIRED";
  }

  return "CONDITIONAL_PASS";
};
