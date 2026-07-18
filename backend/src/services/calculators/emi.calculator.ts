/**
 * Equated Monthly Installment (EMI) Calculator using deterministic formula.
 * Formula: EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where P = principal, r = monthly interest rate, n = number of months.
 */
export const calculateEmi = (
  principal: number,
  annualInterestRate: number, // e.g., 0.135 for 13.5%
  tenureYears: number
): number => {
  if (principal <= 0 || tenureYears <= 0) return 0;
  if (annualInterestRate === 0) return Math.round(principal / (tenureYears * 12));

  const monthlyRate = annualInterestRate / 12;
  const totalMonths = tenureYears * 12;

  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths);
  const denominator = Math.pow(1 + monthlyRate, totalMonths) - 1;

  if (denominator === 0) return 0;

  return Math.round(numerator / denominator);
};
