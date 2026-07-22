import { describe, expect, it } from "vitest";
import type { DecisionEnvelope } from "@/types/agent.types";
import type { AgentTrace } from "@/types/trace.types";
import { buildAnswerTransparency, groundLegalFindings } from "@/services/governance/citation-governance.service";
import { maskPiiPayload } from "@/services/governance/pii-masking.service";
import { assessDecisionConfidence } from "@/services/governance/decision-confidence.service";
import { decideNextAction } from "@/services/orchestration/decision-matrix.service";

const untrustedLegalFinding: DecisionEnvelope = {
  decisionId: "dec-legal-test-1",
  agent: "legal",
  status: "VIOLATION",
  severity: "BLOCKER",
  blocksAt: "APPROVAL",
  finding: "Phát hiện gắn bảo hiểm không bắt buộc với khoản vay.",
  evidence: { insuranceTyingApplied: true },
  ruleIds: ["LEGAL_INSURANCE_TYING_DETECTED"],
  citations: ["citation do model tự tạo"],
};

describe("citation governance", () => {
  it("replaces model-authored citations with the allow-listed source", () => {
    const grounded = groundLegalFindings([untrustedLegalFinding]);
    expect(grounded[0].citations).toEqual(["32/2024/QH15 - Điều 13, Điều 14 và khoản 5 Điều 15"]);
  });

  it("fails closed on an unknown rule instead of exposing an unverified citation", () => {
    expect(() => groundLegalFindings([{ ...untrustedLegalFinding, ruleIds: ["LEGAL_UNKNOWN_RULE"] }]))
      .toThrow(/Citation governance rejected/);
  });

  it("builds a fully covered, human-review-flagged transparency envelope", () => {
    const grounded = groundLegalFindings([untrustedLegalFinding]);
    const transparent = buildAnswerTransparency(
      "Kết luận kiểm thử.",
      [{
        id: "trace-legal-test",
        runId: "run-test",
        agent: "legal",
        task: "test",
        status: "blocked",
        summary: "test",
        toolCalls: [],
        findings: grounded,
        startedAt: new Date(0).toISOString(),
      }],
      "HUMAN_ESCALATION",
      "HYBRID_APPROVAL"
    );

    expect(transparent.transparency.evidenceCoveragePercent).toBe(100);
    expect(transparent.transparency.requiresHumanReview).toBe(true);
    expect(transparent.finalAnswer).toContain("[1]");
    expect(transparent.transparency.citations[0].verificationStatus).toBe("VERIFIED_OFFICIAL");
  });
});

describe("decision matrix", () => {
  it("routes missing guarantee evidence to review, not an unsupported rejection", () => {
    const missingGuaranteeEvidence: DecisionEnvelope = {
      ...untrustedLegalFinding,
      decisionId: "dec-legal-project-1",
      status: "BLOCKED",
      blocksAt: "DISBURSEMENT",
      finding: "Chưa xác minh được bằng chứng bảo lãnh dự án.",
      ruleIds: ["LEGAL_PROJECT_NOT_REGISTERED"],
    };

    expect(decideNextAction([], [], [missingGuaranteeEvidence]).finalDecision).toBe("HUMAN_ESCALATION");
  });
});

describe("PII masking", () => {
  it("masks every direct identifier in a structured payload", () => {
    const masked = maskPiiPayload({
      demographic: { name: "Nguyen Van Test", cccd: "012345678901", phone: "0912345678", email: "test.user@example.com" },
    });

    expect(masked.demographic.name).not.toBe("Nguyen Van Test");
    expect(masked.demographic.cccd).not.toBe("012345678901");
    expect(masked.demographic.phone).not.toBe("0912345678");
    expect(masked.demographic.email).not.toBe("test.user@example.com");
  });

  it("falls back to regex masking inside free-form strings", () => {
    expect(maskPiiPayload({ summary: "Khách hàng gọi từ 0912345678" }).summary).not.toContain("0912345678");
  });
});

describe("decision confidence abstention", () => {
  const trustedTrace = (agent: "profile" | "product" | "credit"): AgentTrace => ({
    id: `trace-${agent}`,
    runId: "run-confidence",
    agent,
    task: "confidence-test",
    status: "completed",
    summary: "verified",
    toolCalls: [{ toolName: "deterministic-check", input: {}, output: { verified: true }, status: "success" }],
    findings: [{ ...untrustedLegalFinding, decisionId: `dec-${agent}`, agent, ruleIds: [`${agent.toUpperCase()}_VERIFIED`] }],
    startedAt: new Date(0).toISOString(),
  });

  it("verifies a fast lane where every mandatory tool call succeeded", () => {
    const traces = [trustedTrace("profile"), trustedTrace("product"), trustedTrace("credit")];
    expect(assessDecisionConfidence("FAST", traces).status).toBe("VERIFIED");
  });

  it("abstains from an automated decision after a failed tool call", () => {
    const traces = [trustedTrace("profile"), trustedTrace("product"), trustedTrace("credit")];
    traces[2].toolCalls[0].status = "failed";

    const abstained = assessDecisionConfidence("FAST", traces);
    expect(abstained.status).toBe("NEEDS_REVIEW");
    expect(abstained.reasons).toContain("TOOL_FAILURE:credit");
  });
});
