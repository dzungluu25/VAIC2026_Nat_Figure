import { ApprovedLoanTerms, BusinessValueProjection } from "../../types/product.types";
import { decisionPolicy } from "../../config/policy";

/** Illustrative, deterministic unit economics for comparing eligible offers in the demo. */
export const projectBusinessValue = (terms: ApprovedLoanTerms): BusinessValueProjection => {
  const policy = decisionPolicy.profitability;
  const annualInterestRevenue = Math.round(terms.loanAmount * terms.annualRate);
  const annualFundingCost = Math.round(terms.loanAmount * policy.fundingCostRate);
  const expectedCreditLoss = Math.round(terms.loanAmount * policy.expectedLossRate);
  const annualOperatingCost = policy.automatedCaseCostVnd;
  const capitalAllocated = terms.loanAmount * policy.capitalAllocationRate;
  const capitalCharge = capitalAllocated * policy.capitalHurdleRate;
  const riskAdjustedProfit = Math.round(annualInterestRevenue - annualFundingCost - expectedCreditLoss - annualOperatingCost - capitalCharge);
  const rarocPercent = capitalAllocated > 0 ? Number(((riskAdjustedProfit / capitalAllocated) * 100).toFixed(2)) : 0;

  return {
    annualInterestRevenue,
    annualFundingCost,
    expectedCreditLoss,
    annualOperatingCost,
    riskAdjustedProfit,
    rarocPercent,
    estimatedManualMinutesSaved: policy.manualProcessingMinutes,
    estimatedProcessingCostSavedVnd: policy.manualCaseCostVnd - policy.automatedCaseCostVnd,
    profitable: riskAdjustedProfit > 0 && rarocPercent >= policy.minimumRarocPercent,
    assumptions: [
      `Policy ${decisionPolicy.policyId}@${decisionPolicy.version}`,
      `Funding cost ${(policy.fundingCostRate * 100).toFixed(2)}%`,
      `Expected loss ${(policy.expectedLossRate * 100).toFixed(2)}%`,
      `Capital allocation ${(policy.capitalAllocationRate * 100).toFixed(2)}%`,
      `Capital hurdle ${(policy.capitalHurdleRate * 100).toFixed(2)}%`,
    ],
  };
};
