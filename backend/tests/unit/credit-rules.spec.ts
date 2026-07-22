import { describe, expect, it } from "vitest";
import type { RetailCase } from "@/types/case.types";
import { calculateCurrentMonthlyDebt, calculateIncomeAfterHaircut } from "@/services/calculators/dti.calculator";
import { evaluateCreditRules } from "@/services/rules/credit-rule-engine";
import { evaluateAutoApprovalPolicy } from "@/services/rules/auto-approval-policy.service";
import { projectBusinessValue } from "@/services/business/profitability-engine";
import { complexCaseFixture, dtiFailCaseFixture, fastCaseFixture } from "../fixtures/retail-cases";

const assess = (retailCase: RetailCase) =>
  evaluateCreditRules(
    `test-${retailCase.caseId}`,
    calculateIncomeAfterHaircut(retailCase.incomeSources),
    calculateCurrentMonthlyDebt(retailCase.currentDebts),
    retailCase
  );

describe("deterministic credit rules", () => {
  it("passes a clean file", () => {
    expect(assess(fastCaseFixture).creditDecision).toBe("PASS");
  });

  it("fails an unaffordable file after the restructure search", () => {
    expect(assess(dtiFailCaseFixture).creditDecision).toBe("FAIL");
  });
});

describe("auto-approval policy gates", () => {
  it("admits a file that satisfies every gate", () => {
    expect(evaluateAutoApprovalPolicy(fastCaseFixture, assess(fastCaseFixture)).eligible).toBe(true);
  });

  it("never admits a complex file into the auto lane", () => {
    expect(evaluateAutoApprovalPolicy(complexCaseFixture, assess(complexCaseFixture)).eligible).toBe(false);
  });
});

describe("profitability projection", () => {
  const value = projectBusinessValue({
    loanAmount: 500_000_000,
    tenureYears: 10,
    annualRate: 0.083,
    approvalMode: "AUTO_APPROVAL",
    source: "ORIGINAL_REQUEST",
  });

  it("clears the demo profitability floor for a representative clean loan", () => {
    expect(value.profitable).toBe(true);
  });

  it("reports a positive risk-adjusted profit and processing saving", () => {
    expect(value.riskAdjustedProfit).toBeGreaterThan(0);
    expect(value.estimatedProcessingCostSavedVnd).toBeGreaterThan(0);
  });
});
