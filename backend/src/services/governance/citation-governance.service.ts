import { DecisionEnvelope } from "../../types/agent.types";
import { AnswerClaim, AnswerTransparency, VerifiedCitation } from "../../types/orchestration.types";
import { AgentTrace } from "../../types/trace.types";
import citationCatalogJson from "../../policy/citation-catalog.json";

interface CitationCatalog {
  policyVersion: string;
  sources: Record<string, VerifiedCitation>;
  ruleSources: Record<string, string[]>;
  fallbacks: { internalPolicySourceId: string; securitySourceId: string; dataProtectionSourceIds: string[] };
}

const catalog = citationCatalogJson as CitationCatalog;
export const BANKING_AI_POLICY_VERSION = catalog.policyVersion;

const sourcesForRule = (ruleId: string): string[] => {
  if (catalog.ruleSources[ruleId]) return catalog.ruleSources[ruleId];
  if (ruleId.startsWith("CREDIT_") || ruleId.startsWith("PRODUCT_")) return [catalog.fallbacks.internalPolicySourceId];
  return [];
};

const citationLabel = (citation: VerifiedCitation): string => `${citation.documentNumber} - ${citation.locator}`;

/**
 * Attaches verified citations to a single finding, or returns null when its rules cannot be mapped
 * to an official source. Returning null (rather than fabricating a citation) keeps the fail-closed
 * guarantee: an ungrounded finding never exposes an unverified citation.
 */
const groundSingleFinding = (finding: DecisionEnvelope): DecisionEnvelope | null => {
  const citationIds = [...new Set(finding.ruleIds.flatMap(sourcesForRule))];
  if (!citationIds.length || citationIds.some(id => !catalog.sources[id])) return null;
  return { ...finding, agent: "legal", citations: citationIds.map(id => citationLabel(catalog.sources[id])) };
};

export const groundLegalFindings = (findings: DecisionEnvelope[]): DecisionEnvelope[] =>
  findings.map(finding => {
    const grounded = groundSingleFinding(finding);
    if (!grounded) {
      throw new Error(`Citation governance rejected unsupported legal rule: ${finding.ruleIds.join(", ") || "missing rule"}`);
    }
    return grounded;
  });

export interface GroundedFindingsResult {
  grounded: DecisionEnvelope[];
  quarantined: DecisionEnvelope[];
}

/**
 * Partitioning variant of groundLegalFindings. Grounded findings keep their verified citations;
 * findings whose rules cannot be mapped to an official source are quarantined (marked BLOCKED with
 * no citations and a required manual-review fix) instead of discarding the whole batch. Still
 * fail-closed — quarantined findings never carry unverified citations — but one bad finding no
 * longer throws away the valid ones.
 */
export const groundLegalFindingsSafely = (findings: DecisionEnvelope[]): GroundedFindingsResult => {
  const grounded: DecisionEnvelope[] = [];
  const quarantined: DecisionEnvelope[] = [];
  for (const finding of findings) {
    const result = groundSingleFinding(finding);
    if (result) {
      grounded.push(result);
      continue;
    }
    quarantined.push({
      ...finding,
      agent: "legal",
      status: "BLOCKED",
      blocksAt: "APPROVAL",
      citations: [],
      requiredFix: `Rule(s) ${finding.ruleIds.join(", ") || "thiếu rule"} chưa ánh xạ được tới nguồn trích dẫn chính thức; cần soát xét pháp lý thủ công.`,
    });
  }
  return { grounded, quarantined };
};

const allFindingsWithTrace = (traces: AgentTrace[]): { finding: DecisionEnvelope; traceId: string }[] =>
  traces.flatMap(trace => ((trace.findings ?? []) as DecisionEnvelope[]).map(finding => ({ finding, traceId: trace.id })));

export const buildAnswerTransparency = (
  baseAnswer: string,
  traces: AgentTrace[],
  finalDecision: string,
  approvalMode: string,
  reasonCodes: string[] = []
): { finalAnswer: string; transparency: AnswerTransparency } => {
  const findingsWithTrace = allFindingsWithTrace(traces);
  const findings = findingsWithTrace.map(entry => entry.finding);
  const materialFindings = findings.filter(finding => finding.severity !== "INFO");
  const ruleIds = [...new Set(materialFindings.flatMap(finding => finding.ruleIds))];
  const resolvedRuleIds = ruleIds.filter(ruleId => sourcesForRule(ruleId).length > 0);
  const citationIds = [...new Set(resolvedRuleIds.flatMap(sourcesForRule))];

  if (reasonCodes.some(reason => reason.includes("CONSENT"))) {
    citationIds.push("PERSONAL_DATA_2025", "PERSONAL_DATA_BANKING_2025");
  }

  if (!citationIds.length) {
    citationIds.push(finalDecision === "SECURITY_BLOCKED" ? catalog.fallbacks.securitySourceId : catalog.fallbacks.internalPolicySourceId);
  }
  const decisionCitationIdSet = new Set(citationIds);
  citationIds.push(...catalog.fallbacks.dataProtectionSourceIds);

  const citations = [...new Set(citationIds)].map(id => catalog.sources[id]).filter((source): source is VerifiedCitation => Boolean(source));
  const citationMarkers = citations
    .filter(citation => decisionCitationIdSet.has(citation.id))
    .map(citation => `[${citations.indexOf(citation) + 1}]`)
    .join(" ");

  const failedMandatoryAgent = traces.some(trace => trace.status === "failed");
  const hasInternalSource = citations.some(citation => citation.verificationStatus === "INTERNAL_REVIEW_REQUIRED");
  const evidenceCoveragePercent = ruleIds.length ? Math.round((resolvedRuleIds.length / ruleIds.length) * 100) : 100;
  const requiresHumanReview = approvalMode !== "AUTO_APPROVAL" || failedMandatoryAgent || evidenceCoveragePercent < 100;
  const confidence: AnswerTransparency["confidence"] = failedMandatoryAgent || evidenceCoveragePercent < 100
    ? "LOW"
    : hasInternalSource || requiresHumanReview ? "MEDIUM" : "HIGH";

  const decisionTraceIds = traces.filter(trace => ["credit", "product", "legal", "legal_audit", "risk"].includes(trace.agent)).map(trace => trace.id);
  const decisionCitationIds = citations.filter(citation => decisionCitationIdSet.has(citation.id)).map(citation => citation.id);
  const availableCitationIds = new Set(citations.map(citation => citation.id));
  const blockingStatuses: DecisionEnvelope["status"][] = ["VIOLATION", "BLOCKED", "FAIL"];

  // One claim per material finding, each carrying only the citations/trace it is actually derived
  // from — dynamic data lineage rather than a fixed pair of buckets.
  const findingClaims: AnswerClaim[] = findingsWithTrace
    .filter(entry => entry.finding.severity !== "INFO")
    .map(({ finding, traceId }) => ({
      claimId: `finding-${finding.decisionId}`,
      kind: blockingStatuses.includes(finding.status) ? "DECISION" : "FACT",
      text: finding.finding,
      citationIds: [...new Set(finding.ruleIds.flatMap(sourcesForRule))].filter(id => availableCitationIds.has(id)),
      traceIds: [traceId],
    }));

  const claims: AnswerClaim[] = [
    { claimId: "final-decision", kind: "DECISION", text: `Kết luận điều phối: ${finalDecision}.`, citationIds: decisionCitationIds, traceIds: decisionTraceIds },
    ...findingClaims,
    { claimId: "data-governance", kind: "FACT", text: "Luồng xử lý áp dụng che dữ liệu cá nhân và ghi nhật ký kiểm toán.", citationIds: catalog.fallbacks.dataProtectionSourceIds, traceIds: traces.map(trace => trace.id) },
  ];

  const limitations = ["Kết quả là hỗ trợ quyết định; không thay thế phê duyệt của người có thẩm quyền khi approvalMode không phải AUTO_APPROVAL."];
  if (hasInternalSource) limitations.push("Policy demo nội bộ phải được chủ sở hữu chính sách xác nhận phiên bản và hiệu lực trước khi vận hành thật.");
  if (evidenceCoveragePercent < 100) limitations.push(`Có ${ruleIds.length - resolvedRuleIds.length} rule ID chưa ánh xạ được tới nguồn; hệ thống yêu cầu soát xét.`);

  return {
    finalAnswer: citationMarkers ? `${baseAnswer} ${citationMarkers}` : baseAnswer,
    transparency: {
      generatedAt: new Date().toISOString(), confidence, evidenceCoveragePercent, requiresHumanReview,
      policyVersion: BANKING_AI_POLICY_VERSION, claims, citations, limitations,
    },
  };
};

export const getCitationCatalog = (): VerifiedCitation[] => Object.values(catalog.sources);
