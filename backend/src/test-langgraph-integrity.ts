import assert from "node:assert/strict";
import { AgentTrace } from "./types/trace.types";
import { RetailCase } from "./types/case.types";
import {
  assertPersistedRetailCase,
  canonicalJson,
  validateRetailCase,
} from "./services/data/data-integrity.service";
import {
  resolveValidationRoute,
  validateAgentTrace,
  validateDecisionOutput,
} from "./services/orchestration/orchestration-validation.service";
import { AGENT_EXECUTION_POLICIES, buildStageTerminalFailure } from "./services/orchestration/agent-execution-policy";

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

assert.deepEqual(validateAgentTrace(validTrace, {
  runId: "run-test",
  agent: "profile",
  requiredTools: ["loadCustomerProfile", "loadConsentRegistry"],
}), []);

assert.ok(validateAgentTrace({ ...validTrace, status: "failed" }, {
  runId: "run-test",
  agent: "profile",
}).some(error => error.includes("failed")));

assert.ok(validateAgentTrace({ ...validTrace, toolCalls: validTrace.toolCalls.slice(0, 1) }, {
  runId: "run-test",
  agent: "profile",
  requiredTools: ["loadCustomerProfile", "loadConsentRegistry"],
}).some(error => error.includes("loadConsentRegistry")));

assert.equal(resolveValidationRoute([], 0, 0, 30), "continue");
assert.equal(resolveValidationRoute(["invalid"], 1, 1, 30), "retry");
assert.equal(resolveValidationRoute(["invalid"], 2, 2, 30), "retry");
assert.equal(resolveValidationRoute(["invalid"], 3, 3, 30), "fail");
assert.equal(resolveValidationRoute(["invalid"], 1, 30, 30), "fail");
assert.equal(resolveValidationRoute(["invalid"], 1, 1, 30, 0), "fail");
assert.equal(resolveValidationRoute(["invalid"], 3, 3, 30, 3), "retry");
assert.equal(AGENT_EXECUTION_POLICIES.profile.failureAction, "STOP");
assert.equal(AGENT_EXECUTION_POLICIES.fraud.skipAllowed, true);
assert.deepEqual(buildStageTerminalFailure("credit", 3, ["credit: missing trace"]), {
  code: "MULTI_AGENT_STAGE_FAILED",
  stage: "credit",
  agent: "credit",
  severity: "blocking",
  attempts: 3,
  errors: ["credit: missing trace"],
  action: "STOP",
  message: "Required stage credit failed after 3 validation attempt(s); downstream agents and operations were not executed.",
});

assert.deepEqual(validateDecisionOutput({
  finalDecision: "PASS",
  approvalMode: "HYBRID_APPROVAL",
  approvedTerms: { loanAmount: 1_000_000_000, tenureYears: 20, annualRate: 0.08 },
  confidenceStatus: "VERIFIED",
  requiredFixes: [],
}), []);
assert.ok(validateDecisionOutput({
  finalDecision: "PASS",
  approvalMode: "HYBRID_APPROVAL",
  confidenceStatus: "UNVERIFIED",
  requiredFixes: [],
}).length > 0);

const validCase: RetailCase = {
  caseId: "case-test",
  customerId: "customer-test",
  demographic: {
    name: "Nguyen Van A",
    age: 35,
    maritalStatus: "single",
    cccd: "012345678901",
    phone: "0900000000",
    email: "customer@example.com",
  },
  incomeSources: [{ type: "salary", amount: 50_000_000, evidence: "payroll" }],
  currentDebts: [],
  requestedLoan: { type: "mortgage", amount: 1_000_000_000, tenureYears: 20 },
  property: { type: "apartment", value: 1_800_000_000, status: "completed", evidence: "valuation" },
  consent: {
    credit_check: true,
    tax_income_check: true,
    social_insurance_check: true,
    marketing: false,
  },
  insurancePreference: "declined",
};

assert.deepEqual(validateRetailCase(validCase), validCase);
assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
assert.doesNotThrow(() => assertPersistedRetailCase(validCase, JSON.parse(JSON.stringify(validCase))));
assert.throws(
  () => assertPersistedRetailCase(validCase, { ...validCase, customerId: "wrong-customer" }),
  /identity mismatch/
);
assert.throws(
  () => validateRetailCase({ ...validCase, requestedLoan: { ...validCase.requestedLoan, amount: -1 } }),
  /validation failed/
);

console.log("LangGraph correction and database integrity tests passed.");
