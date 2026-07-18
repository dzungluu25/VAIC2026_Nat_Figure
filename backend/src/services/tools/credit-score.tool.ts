/** Legacy adapter kept for compatibility. It never fabricates an external credit score. */
export const checkCreditScore = async (customerId: string): Promise<Record<string, unknown>> => ({
  customerId,
  creditScore: null,
  verified: false,
  status: "SOURCE_UNAVAILABLE",
  reason: "No authoritative credit-bureau connector is configured.",
});
