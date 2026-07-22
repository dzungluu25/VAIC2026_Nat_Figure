import { describe, expect, it } from "vitest";
import type { AgentTrace } from "@/types/trace.types";
import { assertPersistedRetailCase, canonicalJson, validateRetailCase } from "@/services/data/data-integrity.service";
import {
  resolveValidationRoute,
  validateAgentTrace,
  validateDecisionOutput,
} from "@/services/orchestration/orchestration-validation.service";
import { AGENT_EXECUTION_POLICIES, buildStageTerminalFailure } from "@/services/orchestration/agent-execution-policy";
import { persistableCaseFixture } from "../fixtures/retail-cases";

const now = new Date().toISOString();
const validTrace: AgentTrace = {
  id: "trace-profile-test",
  runId: "run-test",
  agent: "profile",
  task: "Load profile",
  status: "completed",
  summary: "Profile loaded and normalized.",
  toolCalls: [
    { toolName: "loadCustomerProfile", input: {}, output: { ok: true }, status: "success" },
    { toolName: "loadConsentRegistry", input: {}, output: { ok: true }, status: "success" },
  ],
  startedAt: now,
  completedAt: now,
};

describe("agent trace validation", () => {
  it("accepts a complete trace", () => {
    expect(validateAgentTrace(validTrace, {
      runId: "run-test",
      agent: "profile",
      requiredTools: ["loadCustomerProfile", "loadConsentRegistry"],
    })).toEqual([]);
  });

  it("rejects a failed trace", () => {
    const errors = validateAgentTrace({ ...validTrace, status: "failed" }, { runId: "run-test", agent: "profile" });
    expect(errors.some(e => e.includes("failed"))).toBe(true);
  });

  it("names the mandatory tool that never ran", () => {
    const errors = validateAgentTrace({ ...validTrace, toolCalls: validTrace.toolCalls.slice(0, 1) }, {
      runId: "run-test",
      agent: "profile",
      requiredTools: ["loadCustomerProfile", "loadConsentRegistry"],
    });
    expect(errors.some(e => e.includes("loadConsentRegistry"))).toBe(true);
  });
});

describe("self-correction routing", () => {
  it.each([
    [[], 0, 0, 30, undefined, "continue"],
    [["invalid"], 1, 1, 30, undefined, "retry"],
    [["invalid"], 2, 2, 30, undefined, "retry"],
    [["invalid"], 3, 3, 30, undefined, "fail"],
    [["invalid"], 1, 30, 30, undefined, "fail"],
    [["invalid"], 1, 1, 30, 0, "fail"],
    [["invalid"], 3, 3, 30, 3, "retry"],
  ] as const)("routes %j at attempt %i to %s", (errors, stageAttempts, totalAttempts, budget, override, expected) => {
    expect(resolveValidationRoute([...errors], stageAttempts, totalAttempts, budget, override)).toBe(expected);
  });
});

describe("stage execution policy", () => {
  it("stops the run when a mandatory stage fails", () => {
    expect(AGENT_EXECUTION_POLICIES.profile.failureAction).toBe("STOP");
  });

  it("allows the optional fraud stage to be skipped", () => {
    expect(AGENT_EXECUTION_POLICIES.fraud.skipAllowed).toBe(true);
  });

  it("builds a terminal failure that records the blocked downstream work", () => {
    expect(buildStageTerminalFailure("credit", 3, ["credit: missing trace"])).toEqual({
      code: "MULTI_AGENT_STAGE_FAILED",
      stage: "credit",
      agent: "credit",
      severity: "blocking",
      attempts: 3,
      errors: ["credit: missing trace"],
      action: "STOP",
      message: "Required stage credit failed after 3 validation attempt(s); downstream agents and operations were not executed.",
    });
  });
});

describe("decision output validation", () => {
  it("accepts a verified decision carrying approved terms", () => {
    expect(validateDecisionOutput({
      finalDecision: "PASS",
      approvalMode: "HYBRID_APPROVAL",
      approvedTerms: { loanAmount: 1_000_000_000, tenureYears: 20, annualRate: 0.08 },
      confidenceStatus: "VERIFIED",
      requiredFixes: [],
    })).toEqual([]);
  });

  it("rejects an unverified PASS with no approved terms", () => {
    expect(validateDecisionOutput({
      finalDecision: "PASS",
      approvalMode: "HYBRID_APPROVAL",
      confidenceStatus: "UNVERIFIED",
      requiredFixes: [],
    }).length).toBeGreaterThan(0);
  });
});

describe("persistence integrity", () => {
  it("round-trips a valid case", () => {
    expect(validateRetailCase(persistableCaseFixture)).toEqual(persistableCaseFixture);
  });

  it("canonicalises key order so hashes are stable", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it("accepts a faithful round-trip through the database", () => {
    expect(() => assertPersistedRetailCase(persistableCaseFixture, JSON.parse(JSON.stringify(persistableCaseFixture))))
      .not.toThrow();
  });

  it("detects an identity mismatch after persistence", () => {
    expect(() => assertPersistedRetailCase(persistableCaseFixture, { ...persistableCaseFixture, customerId: "wrong-customer" }))
      .toThrow(/identity mismatch/);
  });

  it("rejects a negative loan amount", () => {
    expect(() => validateRetailCase({
      ...persistableCaseFixture,
      requestedLoan: { ...persistableCaseFixture.requestedLoan, amount: -1 },
    })).toThrow(/validation failed/);
  });
});
