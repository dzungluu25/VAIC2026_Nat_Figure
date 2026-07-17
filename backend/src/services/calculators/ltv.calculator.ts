/**
 * Computes Loan-To-Value (LTV) ratio.
 * LTV = (Loan Amount / Collateral Property Value) * 100
 */
export const calculateLtv = (loanAmount: number, propertyValue: number): number => {
  if (propertyValue <= 0) return 0;
  return Number(((loanAmount / propertyValue) * 100).toFixed(2));
};
