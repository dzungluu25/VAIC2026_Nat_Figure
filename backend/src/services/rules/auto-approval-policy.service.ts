import { RetailCase } from "../../types/case.types";
import { CreditAssessmentResult } from "./credit-rule-engine";
import { decisionPolicy } from "../../config/policy";

export interface AutoApprovalResult {
  eligible: boolean;
  reasonCodes: string[];
}

/** Hard gate for the low-risk lane. No LLM output can override these checks. */
export const evaluateAutoApprovalPolicy = (
  retailCase: RetailCase,
  credit: CreditAssessmentResult,
  hasProductConflict = false,
  maximumDtiPercent = decisionPolicy.autoApproval.maximumDtiPercent,
  maximumLtvPercent = decisionPolicy.autoApproval.maximumLtvPercent
): AutoApprovalResult => {
  const policy = decisionPolicy.autoApproval;
  const codes = policy.reasonCodes;
  const checks: Array<[boolean, string]> = [
    [retailCase.requestedLoan.amount <= policy.maximumLoanAmountVnd, codes.amount],
    [credit.originalScenario.dtiStress <= maximumDtiPercent, codes.dti],
    [credit.originalScenario.ltv <= maximumLtvPercent, codes.ltv],
    [credit.creditDecision === "PASS", codes.credit],
    [retailCase.property.status === policy.requiredPropertyStatus, codes.collateral],
    [!policy.requireNoExistingDebt || retailCase.currentDebts.length === 0, codes.debt],
    [policy.requiredConsentFields.every(field => retailCase.consent[field]), codes.consent],
    [retailCase.demographic.age >= policy.minimumApplicantAge && retailCase.demographic.age <= policy.maximumApplicantAge, codes.age],
    [!hasProductConflict, codes.product],
  ];

  const failed = checks.filter(([passed]) => !passed).map(([, code]) => `${code}_FAILED`);
  return { eligible: failed.length === 0, reasonCodes: failed.length ? failed : checks.map(([, code]) => code) };
};
