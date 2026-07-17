import { calculateEmi } from "../calculators/emi.calculator";
import { calculateDti } from "../calculators/dti.calculator";
import { calculateLtv } from "../calculators/ltv.calculator";
import { DecisionEnvelope } from "../../types/agent.types";
import { RetailCase, Debt, RequestedLoan } from "../../types/case.types";

export interface CreditScenario {
  loanAmount: number;
  tenureYears: number;
  emiEstimate: number;
  dtiStress: number;
  ltv: number;
  status: "PASS" | "FAIL";
}

export interface CreditAssessmentResult {
  validMonthlyIncome: number;
  currentMonthlyDebt: number;
  originalScenario: CreditScenario;
  restructureScenario?: CreditScenario;
  creditDecision: "PASS" | "RESTRUCTURE_REQUIRED" | "FAIL";
  findings: DecisionEnvelope[];
}

const STRESS_RATE = 0.135; // 13.5% stress interest rate
const DTI_LIMIT = 60.0;
const LTV_LIMIT = 70.0;
const MAX_MORTGAGE_TENURE_YEARS = 30;
const AUTO_LOAN_REFINANCE_TENURE_YEARS = 8; // standard consumer auto-loan refinance cap
const CREDIT_LIMIT_REDUCTION_FACTOR = 0.5; // condition offered during restructure to free up DTI headroom

interface RestructureOutcome {
  loanAmount: number;
  tenureYears: number;
  restructuredMonthlyDebt: number;
  emi: number;
  dti: number;
  ltv: number;
  success: boolean;
}

/**
 * Applies the bank's standard restructure levers to a single existing debt:
 * amortizing auto loans get refinanced out to the max consumer tenure (lowering
 * their EMI), and revolving credit cards get their limit cut, which lowers the
 * 5%-of-limit obligation. Debts with no such lever (e.g. "other") pass through
 * unchanged — restructuring never increases a debt's monthly obligation.
 */
const restructureExistingDebt = (debt: Debt): number => {
  if (debt.type === "auto" && debt.outstandingAmount > 0) {
    const refinancedEmi = calculateEmi(debt.outstandingAmount, STRESS_RATE, AUTO_LOAN_REFINANCE_TENURE_YEARS);
    return Math.min(debt.monthlyOwed, refinancedEmi);
  }
  if (debt.type === "credit_card" && debt.limit) {
    const reducedLimit = debt.limit * CREDIT_LIMIT_REDUCTION_FACTOR;
    return Math.min(debt.monthlyOwed, Math.round(reducedLimit * 0.05));
  }
  return debt.monthlyOwed;
};

/**
 * Searches for a loan amount/tenure combination that clears both DTI and LTV
 * under the stress rate, given the (already restructured) monthly debt load.
 * Loan amount is capped to whatever the LTV limit allows against the collateral;
 * tenure is stretched from the originally requested term up to the policy max,
 * taking the shortest tenure that clears DTI (never extending further than needed).
 */
const runRestructureEngine = (
  validIncome: number,
  restructuredMonthlyDebt: number,
  requestedLoan: RequestedLoan,
  propertyValue: number
): RestructureOutcome => {
  const loanAmount = Math.min(requestedLoan.amount, Math.floor(propertyValue * (LTV_LIMIT / 100)));
  const ltv = calculateLtv(loanAmount, propertyValue);

  for (let tenureYears = requestedLoan.tenureYears; tenureYears <= MAX_MORTGAGE_TENURE_YEARS; tenureYears++) {
    const emi = calculateEmi(loanAmount, STRESS_RATE, tenureYears);
    const dti = calculateDti(restructuredMonthlyDebt + emi, validIncome);
    if (dti <= DTI_LIMIT) {
      return { loanAmount, tenureYears, restructuredMonthlyDebt, emi, dti, ltv, success: true };
    }
  }

  const emi = calculateEmi(loanAmount, STRESS_RATE, MAX_MORTGAGE_TENURE_YEARS);
  return {
    loanAmount,
    tenureYears: MAX_MORTGAGE_TENURE_YEARS,
    restructuredMonthlyDebt,
    emi,
    dti: calculateDti(restructuredMonthlyDebt + emi, validIncome),
    ltv,
    success: false,
  };
};

export const evaluateCreditRules = (
  runId: string,
  validIncome: number,
  currentMonthlyDebt: number,
  retailCase: RetailCase
): CreditAssessmentResult => {
  const findings: DecisionEnvelope[] = [];
  const requestedLoan = retailCase.requestedLoan;
  const propertyValue = retailCase.property.value;

  // 1. Calculate Original Scenario
  const originalEmi = calculateEmi(requestedLoan.amount, STRESS_RATE, requestedLoan.tenureYears);
  const originalLtv = calculateLtv(requestedLoan.amount, propertyValue);
  
  // Note: DTI stress includes existing debts + requested loan EMI under stress rate
  const originalDti = calculateDti(currentMonthlyDebt + originalEmi, validIncome);

  let originalStatus: "PASS" | "FAIL" = "PASS";
  
  findings.push({
    decisionId: `dec-credit-income-${Date.now()}`,
    agent: "credit",
    status: "PASS",
    severity: "INFO",
    blocksAt: "NONE",
    finding: `Tính toán thu nhập hợp lệ của khách hàng sau khi giảm trừ (haircut) là ${validIncome.toLocaleString()} VND/tháng.`,
    evidence: { validIncome, rawIncomeSources: retailCase.incomeSources },
    ruleIds: ["CREDIT_VALID_INCOME_CALCULATED"],
    citations: ["Quy chế cấp tín dụng bán lẻ SHB - Mục 4.2"]
  });

  if (originalLtv > LTV_LIMIT) {
    originalStatus = "FAIL";
    findings.push({
      decisionId: `dec-credit-ltv-${Date.now()}`,
      agent: "credit",
      status: "FAIL",
      severity: "BLOCKER",
      blocksAt: "APPROVAL",
      finding: `Tỷ lệ LTV gốc (${originalLtv}%) vượt hạn mức tối đa quy định là ${LTV_LIMIT}%.`,
      evidence: { originalLtv, limit: LTV_LIMIT, loanAmount: requestedLoan.amount, propertyValue },
      ruleIds: ["CREDIT_LTV_EXCEEDS_LIMIT"],
      citations: ["Quy chế cấp tín dụng bán lẻ SHB - Mục 5.1"]
    });
  }

  if (originalDti > DTI_LIMIT) {
    originalStatus = "FAIL";
    findings.push({
      decisionId: `dec-credit-dti-${Date.now()}`,
      agent: "credit",
      status: "FAIL",
      severity: "BLOCKER",
      blocksAt: "APPROVAL",
      finding: `Tỷ lệ DTI stress gốc (${originalDti}%) vượt quá ngưỡng an toàn cho phép là ${DTI_LIMIT}%.`,
      evidence: { originalDti, limit: DTI_LIMIT, totalMonthlyDebt: currentMonthlyDebt + originalEmi, validIncome },
      ruleIds: ["CREDIT_DTI_EXCEEDS_LIMIT"],
      citations: ["Quy chế cấp tín dụng bán lẻ SHB - Mục 5.2 (Stress test)"]
    });
  }

  const originalScenario: CreditScenario = {
    loanAmount: requestedLoan.amount,
    tenureYears: requestedLoan.tenureYears,
    emiEstimate: originalEmi,
    dtiStress: originalDti,
    ltv: originalLtv,
    status: originalStatus
  };

  // 2. Decide and Restructure if needed
  if (originalStatus === "PASS") {
    return {
      validMonthlyIncome: validIncome,
      currentMonthlyDebt,
      originalScenario,
      creditDecision: "PASS",
      findings
    };
  }

  // Handle Restructure Scenario: apply the debt-restructuring playbook to each
  // existing debt, then search for a loan amount/tenure combination that clears
  // both DTI and LTV under the stress rate.
  const restructuredMonthlyDebt = retailCase.currentDebts.reduce(
    (total, debt) => total + restructureExistingDebt(debt),
    0
  );

  const restructureOutcome = runRestructureEngine(validIncome, restructuredMonthlyDebt, requestedLoan, propertyValue);

  const restructureScenario: CreditScenario = {
    loanAmount: restructureOutcome.loanAmount,
    tenureYears: restructureOutcome.tenureYears,
    emiEstimate: restructureOutcome.emi,
    dtiStress: restructureOutcome.dti,
    ltv: restructureOutcome.ltv,
    status: restructureOutcome.success ? "PASS" : "FAIL"
  };

  const decision = restructureOutcome.success ? "RESTRUCTURE_REQUIRED" : "FAIL";

  if (decision === "RESTRUCTURE_REQUIRED") {
    findings.push({
      decisionId: `dec-credit-restructure-${Date.now()}`,
      agent: "credit",
      status: "CONDITIONAL_PASS",
      severity: "CONDITION",
      blocksAt: "APPROVAL",
      finding: `Hồ sơ gốc bị từ chối. Đã tái cấu trúc thành công: Giảm khoản vay xuống ${restructureOutcome.loanAmount.toLocaleString()} VND (${restructureOutcome.ltv.toFixed(1)}% LTV), kéo dài thời hạn lên ${restructureOutcome.tenureYears} năm, cơ cấu nợ ô tô và hạ hạn mức thẻ tín dụng. Tỷ lệ DTI stress mới là ${restructureOutcome.dti}%.`,
      evidence: { restructureScenario },
      ruleIds: ["CREDIT_RESTRUCTURE_PASS"],
      citations: ["Quy chế tín dụng nội bộ SHB - Phụ lục Cấu trúc nợ"]
    });
  } else {
    findings.push({
      decisionId: `dec-credit-fail-${Date.now()}`,
      agent: "credit",
      status: "FAIL",
      severity: "BLOCKER",
      blocksAt: "APPROVAL",
      finding: `Không thể tái cấu trúc khoản vay. Tỷ lệ DTI stress tối ưu vẫn vượt quá ngưỡng cho phép của ngân hàng.`,
      evidence: { restructureScenario },
      ruleIds: ["CREDIT_RESTRUCTURE_FAILED"],
      citations: ["Chính sách kiểm soát rủi ro tín dụng SHB"]
    });
  }

  return {
    validMonthlyIncome: validIncome,
    currentMonthlyDebt,
    originalScenario,
    restructureScenario,
    creditDecision: decision,
    findings
  };
};
