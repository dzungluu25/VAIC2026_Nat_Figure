import { IncomeSource, Debt } from "../../types/case.types";
import { decisionPolicy } from "../../config/policy";

/**
 * Calculates valid monthly income after applying policy haircuts:
 * - Salary via SHB: 0% haircut (coefficient = 1.0)
 * - Freelance: 50% haircut (coefficient = 0.5)
 * - Rental: 30% haircut (coefficient = 0.7)
 */
export const calculateIncomeAfterHaircut = (
  incomeSources: IncomeSource[],
  incomeRecognitionFactors: Record<IncomeSource["type"], number> = decisionPolicy.credit.incomeRecognitionFactors
): number => {
  return incomeSources.reduce((total, source) => {
    const coefficient = incomeRecognitionFactors[source.type];
    return total + Math.round(source.amount * coefficient);
  }, 0);
};

/**
 * Subtracts the policy's minimum monthly living expense floor from recognized income
 * before it's used for DTI, so a thin-margin borrower's affordability isn't overstated.
 * Never goes negative — a borrower with insufficient income after the floor simply has
 * zero disposable income for DTI purposes, which the downstream DTI check will reject.
 */
export const applyLivingExpenseFloor = (
  validIncome: number,
  minimumMonthlyLivingExpenseVnd: number = decisionPolicy.credit.minimumMonthlyLivingExpenseVnd
): number => Math.max(0, validIncome - minimumMonthlyLivingExpenseVnd);

/**
 * Calculates current monthly debt obligations:
 * - For credit cards: 5% of the credit limit is used as the monthly obligation.
 * - For other debts: use the monthlyOwed value.
 */
export const calculateCurrentMonthlyDebt = (debts: Debt[]): number => {
  return debts.reduce((total, debt) => {
    if (debt.type === "credit_card" && debt.limit && debt.limit > 0) {
      return total + Math.round(debt.limit * decisionPolicy.credit.creditCardMonthlyObligationRate);
    }
    return total + debt.monthlyOwed;
  }, 0);
};

/**
 * Computes DTI (Debt-To-Income) percentage.
 * DTI = (Total Monthly Debt / Valid Monthly Income) * 100
 */
export const calculateDti = (totalMonthlyDebt: number, validIncome: number): number => {
  if (validIncome <= 0) return 0;
  return Number(((totalMonthlyDebt / validIncome) * 100).toFixed(2));
};
