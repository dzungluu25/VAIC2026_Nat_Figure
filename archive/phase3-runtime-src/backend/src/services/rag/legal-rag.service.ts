import { queryKhcnRuleEvidence } from "./khcn-rule-evidence.service";

export const queryLegalRequirements = async (query: string): Promise<string[]> => {
  const retrieved = await queryKhcnRuleEvidence(query, 8);
  const legalEvidence = retrieved.filter(
    (item) => item.sourceType.includes("LEGAL") || item.packId.includes("LEGAL")
  );
  const evidence = legalEvidence.length > 0 ? legalEvidence : retrieved.slice(0, 4);

  return evidence.map((item) => `[${item.ruleId}] ${item.title}: ${item.snippet}`);
};
