import { beforeAll, describe, expect, it } from "vitest";
import { getKnowledgeGraphCatalog, validateKnowledgeGraphCatalog } from "@/services/data/knowledge-graph-seed.service";

describe("legal knowledge-graph catalog", () => {
  let catalog: ReturnType<typeof getKnowledgeGraphCatalog>;

  beforeAll(() => {
    validateKnowledgeGraphCatalog();
    catalog = getKnowledgeGraphCatalog();
  });

  it("uses the current consolidated asset-classification source", () => {
    expect(catalog.documents.some(d => d.documentId === "SBV_ASSET_CLASSIFICATION_CONSOLIDATED_2025")).toBe(true);
  });

  it("grounds consent decisions in a graph clause", () => {
    expect(catalog.clauses.some(c => c.clauseId === "Clause-Personal-Data-Consent")).toBe(true);
  });

  it("blocks the consent rule before any external data call", () => {
    expect(catalog.policyRules.some(r => r.ruleId === "LEGAL_CONSENT_MISSING" && r.gateId === "EXTERNAL_DATA_CALL")).toBe(true);
  });

  it("queries personal CIC data just in time rather than bulk-ingesting it", () => {
    expect(catalog.sourceSystems.find(s => s.sourceSystemId === "CIC")?.ingestionMode).toBe("QUERY_JUST_IN_TIME");
  });
});
