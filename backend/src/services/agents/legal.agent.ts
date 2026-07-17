import { AgentTrace } from "../../types/trace.types";
import { DecisionEnvelope } from "../../types/agent.types";
import { loadRetailCase } from "../data/retail-case-loader";
import { runLegalComplianceReasoning } from "../rag/legal-reasoning.service";

const STATUS_RANK: Record<DecisionEnvelope["status"], number> = {
  PASS: 0,
  CONDITIONAL_PASS: 1,
  FAIL: 2,
  BLOCKED: 3,
  VIOLATION: 4,
};

const worstStatus = (findings: DecisionEnvelope[]): DecisionEnvelope["status"] =>
  findings.reduce<DecisionEnvelope["status"]>(
    (acc, f) => (STATUS_RANK[f.status] > STATUS_RANK[acc] ? f.status : acc),
    "PASS"
  );

export const runLegalAgent = async (
  runId: string,
  caseId: string,
  prompt: string,
  productFindings: any[], // To retrieve product pricing offer
  creditFindings: any[]   // To retrieve credit assessment details
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();

  const retailCase = await loadRetailCase(caseId);

  if (!retailCase) {
    return {
      id: `trace-legal-${Date.now()}`,
      runId,
      agent: "legal",
      task: "Verify compliance and legal regulations",
      status: "failed",
      summary: "Case data not found.",
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  // Structural facts already established elsewhere in the pipeline (not raw PII) — the LLM
  // reasons over these to decide which RAG-backed compliance checks apply and how to ground
  // each finding in an actual Neo4j lookup, instead of the fixed if/else branching this agent
  // used to run.
  const hasInsuranceTyingSignal = productFindings.some(
    f => f.ruleIds?.includes("PRODUCT_PRICING_INSURANCE_TYING") && f.evidence?.insuranceTyingApplied
  );

  let findings: DecisionEnvelope[];
  let toolCalls: AgentTrace["toolCalls"];

  try {
    const result = await runLegalComplianceReasoning(retailCase, prompt, hasInsuranceTyingSignal);
    findings = result.findings;
    toolCalls = result.toolCalls;
  } catch (err) {
    console.error("Legal Agent: LLM compliance reasoning failed:", err);
    return {
      id: `trace-legal-${Date.now()}`,
      runId,
      agent: "legal",
      task: "Verify compliance and legal regulations",
      status: "failed",
      summary: "Soát xét pháp lý bằng AI thất bại — hồ sơ cần được chuyển sang hàng đợi soát xét thủ công để đảm bảo an toàn tuân thủ.",
      toolCalls: [],
      findings: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  const gateStatus = worstStatus(findings);
  const isBlocking = gateStatus === "VIOLATION" || gateStatus === "BLOCKED" || gateStatus === "FAIL";

  let summary = `Soát xét tuân thủ hoàn tất (AI Reasoning + GraphRAG). Trạng thái Gate: ${gateStatus}. `;
  summary += findings.length === 0
    ? "Hồ sơ hoàn toàn hợp lệ, đáp ứng đủ các quy định của NHNN và SHB."
    : findings.map(f => f.finding).join(" ");

  return {
    id: `trace-legal-${Date.now()}`,
    runId,
    agent: "legal",
    task: "Verify compliance and legal regulations",
    status: isBlocking ? "blocked" : "completed",
    summary,
    toolCalls,
    findings,
    startedAt,
    completedAt: new Date().toISOString()
  };
};
