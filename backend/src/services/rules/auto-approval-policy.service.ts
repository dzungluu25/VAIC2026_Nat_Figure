import { RetailCase } from "../../types/case.types";
import { CreditAssessmentResult } from "./credit-rule-engine";

export interface AutoApprovalResult {
  eligible: boolean;
  reasonCodes: string[];
}

/** Hard gate for the low-risk lane. No LLM output can override these checks. */
export const evaluateAutoApprovalPolicy = (retailCase: RetailCase, credit: CreditAssessmentResult, hasProductConflict = false): AutoApprovalResult => {
  const checks: Array<[boolean, string]> = [
    [retailCase.requestedLoan.amount <= 500_000_000, "AUTO_AMOUNT_WITHIN_LIMIT"],
    [credit.originalScenario.dtiStress <= 40, "AUTO_DTI_WITHIN_40"],
    [credit.originalScenario.ltv <= 50, "AUTO_LTV_WITHIN_50"],
    [credit.creditDecision === "PASS", "AUTO_CREDIT_RULES_PASS"],
    [retailCase.property.status === "completed", "AUTO_COLLATERAL_COMPLETED"],
    [retailCase.currentDebts.length === 0, "AUTO_NO_EXISTING_DEBT"],
    [retailCase.consent.credit_check && retailCase.consent.tax_income_check, "AUTO_REQUIRED_CONSENT_PRESENT"],
    [retailCase.demographic.age >= 18 && retailCase.demographic.age <= 60, "AUTO_AGE_WITHIN_POLICY"],
    [!hasProductConflict, "AUTO_PRODUCT_COMPLIANCE_CLEAN"],
  ];

  const failed = checks.filter(([passed]) => !passed).map(([, code]) => `${code}_FAILED`);
  return { eligible: failed.length === 0, reasonCodes: failed.length ? failed : checks.map(([, code]) => code) };
};
