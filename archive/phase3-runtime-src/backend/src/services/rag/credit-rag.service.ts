import { queryKhcnRuleEvidence } from "./khcn-rule-evidence.service";

export const queryCreditPolicies = async (query: string): Promise<string[]> => {
  const retrieved = await queryKhcnRuleEvidence(query, 8);
  const policyEvidence = retrieved.filter(
    (item) => item.sourceType.includes("INTERNAL_POLICY") || item.packId.includes("POLICY")
  );
  const evidence = policyEvidence.length > 0 ? policyEvidence : retrieved.slice(0, 4);

  return evidence.map((item) => `[${item.ruleId}] ${item.title}: ${item.snippet}`);
};
