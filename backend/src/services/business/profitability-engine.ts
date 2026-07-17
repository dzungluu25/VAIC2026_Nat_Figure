import { ApprovedLoanTerms, BusinessValueProjection } from "../../types/product.types";

const FUNDING_COST_RATE = 0.045;
const EXPECTED_LOSS_RATE = 0.006;
const CAPITAL_ALLOCATION_RATE = 0.10;
const CAPITAL_HURDLE_RATE = 0.15;
const AUTOMATED_CASE_COST_VND = 85_000;
const MANUAL_CASE_COST_VND = 620_000;
const MANUAL_MINUTES = 180;

/** Illustrative, deterministic unit economics for comparing eligible offers in the demo. */
export const projectBusinessValue = (terms: ApprovedLoanTerms): BusinessValueProjection => {
  const annualInterestRevenue = Math.round(terms.loanAmount * terms.annualRate);
  const annualFundingCost = Math.round(terms.loanAmount * FUNDING_COST_RATE);
  const expectedCreditLoss = Math.round(terms.loanAmount * EXPECTED_LOSS_RATE);
  const annualOperatingCost = AUTOMATED_CASE_COST_VND;
  const capitalAllocated = terms.loanAmount * CAPITAL_ALLOCATION_RATE;
  const capitalCharge = capitalAllocated * CAPITAL_HURDLE_RATE;
  const riskAdjustedProfit = Math.round(annualInterestRevenue - annualFundingCost - expectedCreditLoss - annualOperatingCost - capitalCharge);
  const rarocPercent = capitalAllocated > 0 ? Number(((riskAdjustedProfit / capitalAllocated) * 100).toFixed(2)) : 0;

  return {
    annualInterestRevenue,
    annualFundingCost,
    expectedCreditLoss,
    annualOperatingCost,
    riskAdjustedProfit,
    rarocPercent,
    estimatedManualMinutesSaved: MANUAL_MINUTES,
    estimatedProcessingCostSavedVnd: MANUAL_CASE_COST_VND - AUTOMATED_CASE_COST_VND,
    profitable: riskAdjustedProfit > 0 && rarocPercent >= 8,
    assumptions: ["Cost of funds 4.5%", "Expected loss 0.6%", "Allocated capital 10%", "Capital hurdle 15%", "Illustrative demo economics"],
  };
};
