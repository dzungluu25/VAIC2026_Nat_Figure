import { describe, expect, it } from "vitest";
import {
  buildDeterministicLegalFindings,
  runDeterministicLegalFallback,
  type LegalReasoningInput,
} from "@/services/rag/legal-reasoning.service";
import { normalizeLlmProviderError } from "@/services/llm/provider-error.service";

const legalInput = (overrides: Partial<LegalReasoningInput> = {}): LegalReasoningInput => ({
  maritalStatus: "single",
  hasInsuranceTyingSignal: false,
  propertyStatus: "completed",
  projectCode: null,
  consent: { credit_check: true, tax_income_check: true, social_insurance_check: true, marketing: false },
  maritalSignatureWarning: false,
  loanPurpose: "mortgage",
  ...overrides,
});

describe("deterministic legal findings", () => {
  it("carries only the collateral-registration disclosure on a clean case", () => {
    // Decree 99/2022/NĐ-CP registration is never system-verifiable, so it is a
    // CONDITION that coexists with an otherwise-clean file rather than a blocker.
    const findings = buildDeterministicLegalFindings(legalInput());
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleIds[0]).toBe("LEGAL_COLLATERAL_REGISTRATION_UNVERIFIED");
    expect(findings[0].severity).toBe("CONDITION");
  });

  it("blocks an external data call when consent is missing", () => {
    const findings = buildDeterministicLegalFindings(legalInput({
      consent: { credit_check: false, tax_income_check: true, social_insurance_check: true, marketing: false },
    }));
    expect(findings[0].ruleIds[0]).toBe("LEGAL_CONSENT_MISSING");
    expect(findings[0].blocksAt).toBe("EXTERNAL_DATA_CALL");
  });

  it("warns but does not block on marital property", () => {
    const findings = buildDeterministicLegalFindings(legalInput({ maritalStatus: "married" }));
    expect(findings[0].ruleIds[0]).toBe("LEGAL_MARITAL_PROPERTY_WARNING");
    expect(findings[0].severity).toBe("CONDITION");
  });

  it("escalates a missing spousal signature to a blocker", () => {
    const findings = buildDeterministicLegalFindings(legalInput({
      maritalStatus: "married",
      maritalSignatureWarning: true,
    }));
    expect(findings[0].ruleIds[0]).toBe("LEGAL_MARITAL_SIGNATURE_MISSING");
    expect(findings[0].severity).toBe("BLOCKER");
  });

  it("blocks an unregistered off-plan project", () => {
    const findings = buildDeterministicLegalFindings(legalInput({
      propertyStatus: "future_project",
      projectCode: "PROJECT-NOT-VERIFIED",
    }));
    expect(findings[0].ruleIds[0]).toBe("LEGAL_PROJECT_NOT_REGISTERED");
    expect(findings[0].status).toBe("BLOCKED");
  });

  it("always blocks an unverified refinance purpose", () => {
    const findings = buildDeterministicLegalFindings(legalInput({ loanPurpose: "refinance" }));
    const refinance = findings.find(f => f.ruleIds[0] === "LEGAL_REFINANCE_PURPOSE_UNVERIFIED");
    expect(refinance).toBeDefined();
    expect(refinance!.status).toBe("BLOCKED");
    expect(refinance!.severity).toBe("BLOCKER");
  });
});

describe("legal LLM fallback", () => {
  const providerError = normalizeLlmProviderError({
    status: 400,
    message: "400 status code (no body)",
    requestID: "req-legal-400",
    headers: { get: (key: string) => (key === "x-model" ? "GLM-5.1" : null) },
  }, { model: "GLM-5.1", operation: "legalComplianceReasoning" });

  it("classifies a bodyless 400 as an unsupported tool call", () => {
    expect(providerError.code).toBe("MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED");
  });

  it("falls back to deterministic findings when the provider rejects the call", async () => {
    const fallback = await runDeterministicLegalFallback(legalInput(), providerError, {
      queryRegulationClause: async () => null,
      queryProjectGuarantee: async () => null,
    });

    expect(fallback.mode).toBe("deterministic_fallback");
    expect(fallback.findings).toHaveLength(1);
    expect(fallback.findings[0].ruleIds[0]).toBe("LEGAL_COLLATERAL_REGISTRATION_UNVERIFIED");
    expect(fallback.toolCalls[0]).toMatchObject({ toolName: "legalDeterministicFallback", status: "success" });
  });
});
