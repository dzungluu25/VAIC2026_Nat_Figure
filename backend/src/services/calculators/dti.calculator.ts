import { IncomeSource, Debt } from "../../types/case.types";

/**
 * Calculates valid monthly income after applying policy haircuts:
 * - Salary via SHB: 0% haircut (coefficient = 1.0)
 * - Freelance: 50% haircut (coefficient = 0.5)
 * - Rental: 30% haircut (coefficient = 0.7)
 */
export const calculateIncomeAfterHaircut = (incomeSources: IncomeSource[]): number => {
  return incomeSources.reduce((total, source) => {
    let coefficient = 1.0;
    if (source.type === "freelance") {
      coefficient = 0.5;
    } else if (source.type === "rental") {
      coefficient = 0.7; // 30% haircut means keeping 70%
    }
    return total + Math.round(source.amount * coefficient);
  }, 0);
};

/**
 * Calculates current monthly debt obligations:
 * - For credit cards: 5% of the credit limit is used as the monthly obligation.
 * - For other debts: use the monthlyOwed value.
 */
export const calculateCurrentMonthlyDebt = (debts: Debt[]): number => {
  return debts.reduce((total, debt) => {
    if (debt.type === "credit_card" && debt.limit && debt.limit > 0) {
      return total + Math.round(debt.limit * 0.05); // 5% of limit
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
