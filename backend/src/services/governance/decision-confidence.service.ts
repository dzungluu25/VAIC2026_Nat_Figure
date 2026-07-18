import { decisionPolicy, policyMetadata } from "../../config/policy";
import { DecisionEnvelope } from "../../types/agent.types";
import { DecisionConfidence } from "../../types/product.types";
import { AgentTrace } from "../../types/trace.types";

type RiskLane = "FAST" | "COMPLEX";

const hasEvidence = (finding: DecisionEnvelope): boolean =>
  Boolean(finding.evidence && Object.keys(finding.evidence).length && finding.ruleIds?.length);

export const assessDecisionConfidence = (lane: RiskLane, traces: Array<AgentTrace | undefined>): DecisionConfidence => {
  const policy = decisionPolicy.uncertainty;
  const reasons: string[] = [];
  const requiredAgents = policy.mandatoryAgentsByLane[lane];
  const traceByAgent = new Map(traces.filter((trace): trace is AgentTrace => Boolean(trace)).map(trace => [trace.agent, trace]));

  if (policy.requireAllMandatoryAgents) {
    for (const agent of requiredAgents) {
      const trace = traceByAgent.get(agent as AgentTrace["agent"]);
      if (!trace) reasons.push(`MISSING_AGENT:${agent}`);
      else if (["failed", "pending", "running"].includes(trace.status)) reasons.push(`UNTRUSTED_AGENT_STATUS:${agent}:${trace.status}`);
    }
  }

  const requiredTraces = requiredAgents
    .map(agent => traceByAgent.get(agent as AgentTrace["agent"]))
    .filter((trace): trace is AgentTrace => Boolean(trace));

  if (policy.requireSuccessfulToolCalls) {
    for (const trace of requiredTraces) {
      if (!trace.toolCalls.length) reasons.push(`NO_TOOL_EVIDENCE:${trace.agent}`);
      if (trace.toolCalls.some(call => call.status !== "success")) reasons.push(`TOOL_FAILURE:${trace.agent}`);
    }
  }

  const findings = requiredTraces.flatMap(trace => (trace.findings || []) as DecisionEnvelope[]);
  const evidencedFindings = findings.filter(hasEvidence);
  const evidenceCoverage = findings.length ? evidencedFindings.length / findings.length : 0;
  if (evidenceCoverage < policy.minimumEvidenceCoverage) reasons.push(`EVIDENCE_COVERAGE:${evidenceCoverage.toFixed(2)}`);

  if (policy.requireLegalCitations) {
    const legalFindings = (traceByAgent.get("legal")?.findings || []) as DecisionEnvelope[];
    if (lane === "COMPLEX" && legalFindings.some(finding => !finding.citations?.length)) reasons.push("LEGAL_CITATION_MISSING");
  }

  const score = Number(Math.max(0, 1 - reasons.length / 4).toFixed(2));
  return {
    status: reasons.length === 0 && score >= policy.minimumConfidenceScore ? "VERIFIED" : "NEEDS_REVIEW",
    score,
    evidenceCoverage: Number(evidenceCoverage.toFixed(2)),
    reasons,
    policyVersions: {
      decision: policyMetadata.decisionPolicy.version,
      routing: policyMetadata.routingCatalog.version,
      products: policyMetadata.productCatalog.version,
    },
  };
};
