import assert from "node:assert/strict";
import { RETAIL_CASES } from "./services/data/retail-case-data";
import { calculateCurrentMonthlyDebt, calculateIncomeAfterHaircut } from "./services/calculators/dti.calculator";
import { evaluateCreditRules } from "./services/rules/credit-rule-engine";
import { evaluateAutoApprovalPolicy } from "./services/rules/auto-approval-policy.service";
import { projectBusinessValue } from "./services/business/profitability-engine";

const assess = (caseId: string) => {
  const retailCase = RETAIL_CASES[caseId];
  return evaluateCreditRules(
    `test-${caseId}`,
    calculateIncomeAfterHaircut(retailCase.incomeSources),
    calculateCurrentMonthlyDebt(retailCase.currentDebts),
    retailCase
  );
};

const fastCase = RETAIL_CASES["case-fast-clean"];
const fastAssessment = assess("case-fast-clean");
assert.equal(fastAssessment.creditDecision, "PASS", "Clean fixture must pass deterministic credit rules");
assert.equal(evaluateAutoApprovalPolicy(fastCase, fastAssessment).eligible, true, "Clean fixture must satisfy every auto-policy gate");

const complexCase = RETAIL_CASES["case-complex-main"];
assert.equal(evaluateAutoApprovalPolicy(complexCase, assess("case-complex-main")).eligible, false, "Complex fixture must never enter auto approval");

const dtiFail = assess("case-dti-fail");
assert.equal(dtiFail.creditDecision, "FAIL", "Unaffordable fixture must fail after restructure search");

const value = projectBusinessValue({
  loanAmount: 500_000_000,
  tenureYears: 10,
  annualRate: 0.083,
  approvalMode: "AUTO_APPROVAL",
  source: "ORIGINAL_REQUEST",
});
assert.equal(value.profitable, true, "Representative clean loan should clear the demo profitability floor");
assert.ok(value.riskAdjustedProfit > 0);
assert.ok(value.estimatedProcessingCostSavedVnd > 0);

console.log("AI core checks passed: auto-policy, complex-lane guard, affordability rejection, profitability.");
