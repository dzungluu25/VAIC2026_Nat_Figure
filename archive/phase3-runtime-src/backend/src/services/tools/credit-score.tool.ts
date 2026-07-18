export const checkCreditScore = async (customerId: string): Promise<Record<string, unknown>> => {
  return {
    customerId,
    status: "EXTERNAL_CONNECTOR_REQUIRED",
    decisionImpact: "NO_AUTOMATED_APPROVAL",
    message: "Credit bureau score is not synthesized by this system. Connect an authorized CIC provider before using this tool for decisions.",
  };
};
