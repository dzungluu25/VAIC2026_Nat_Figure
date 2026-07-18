import { DecisionEnvelope } from "../../types/agent.types";
import { AgentTrace } from "../../types/trace.types";
import { productCatalog } from "../../config/policy";
import { groundLegalFindings } from "../governance/citation-governance.service";
import { getCachedPolicy, setCachedPolicy } from "../governance/semantic-cache.service";
import { loadRetailCase } from "../data/retail-case-loader";
import { queryProjectGuarantee } from "../rag/policy-rag.service";
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
    (acc, finding) => (STATUS_RANK[finding.status] > STATUS_RANK[acc] ? finding.status : acc),
    "PASS"
  );

const legalFinding = (
  finding: Omit<DecisionEnvelope, "agent" | "citations">
): DecisionEnvelope => ({
  ...finding,
  agent: "legal",
  citations: [],
});

const ground = (findings: DecisionEnvelope[]): DecisionEnvelope[] =>
  findings.length ? groundLegalFindings(findings) : [];

export const runLegalPrecheckAgent = async (
  runId: string,
  caseId: string
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();
  const retailCase = await loadRetailCase(caseId);

  if (!retailCase) {
    return {
      id: `trace-legal-precheck-${Date.now()}`,
      runId,
      agent: "legal",
      task: "Run deterministic legal pre-checks",
      status: "failed",
      summary: "Case data not found.",
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const rawFindings: DecisionEnvelope[] = [];
  const toolCalls: AgentTrace["toolCalls"] = [];

  if (!retailCase.consent.credit_check || !retailCase.consent.tax_income_check || !retailCase.consent.social_insurance_check) {
    rawFindings.push(legalFinding({
      decisionId: `legal-consent-${Date.now()}`,
      status: "BLOCKED",
      severity: "BLOCKER",
      blocksAt: "EXTERNAL_DATA_CALL",
      finding: "Khach hang chua co day du consent rieng cho external data enrichment; external calls must be blocked.",
      evidence: {
        credit_check: retailCase.consent.credit_check,
        tax_income_check: retailCase.consent.tax_income_check,
        social_insurance_check: retailCase.consent.social_insurance_check,
      },
      ruleIds: ["LEGAL_CONSENT_MISSING"],
      requiredFix: "Collect valid customer consent before calling CIC, tax, social insurance, or any third-party data source.",
    }));
  }

  if (retailCase.demographic.maritalStatus === "married") {
    rawFindings.push(legalFinding({
      decisionId: `legal-marital-${Date.now()}`,
      status: "CONDITIONAL_PASS",
      severity: "CONDITION",
      blocksAt: "CONTRACT_SIGNING",
      finding: "Collateral formed during marriage requires spouse signature or evidence that it is separate property before contract signing.",
      evidence: {
        maritalStatus: retailCase.demographic.maritalStatus,
        propertyStatus: retailCase.property.status,
      },
      ruleIds: ["LEGAL_MARITAL_SIGNATURE_MISSING"],
      requiredFix: "Add spouse signature or proof of separate property before signing the secured transaction contract.",
    }));
  }

  if (retailCase.property.status === "future_project") {
    const project = retailCase.property.projectCode ? await queryProjectGuarantee(retailCase.property.projectCode) : null;
    toolCalls.push({
      toolName: "get_project_guarantee_status",
      input: { projectCode: retailCase.property.projectCode ?? null },
      output: project ? { ...project, found: true } : { found: false },
      status: "success",
      sideEffectLevel: "LOW",
    });

    if (!project?.isGuaranteedBySHB) {
      rawFindings.push(legalFinding({
        decisionId: `legal-project-${Date.now()}`,
        status: "CONDITIONAL_PASS",
        severity: "CONDITION",
        blocksAt: "DISBURSEMENT",
        finding: "Future-property project guarantee or lien-release evidence is not verified in the demo knowledge graph.",
        evidence: {
          projectCode: retailCase.property.projectCode,
          guaranteeFound: Boolean(project?.isGuaranteedBySHB),
        },
        ruleIds: ["LEGAL_FUTURE_PROPERTY_GUARANTEE"],
        requiredFix: "Provide project guarantee or lien-release evidence before disbursement.",
      }));
    }
  }

  const findings = ground(rawFindings);
  const blocking = findings.some(finding => finding.status === "BLOCKED" || finding.status === "VIOLATION" || finding.status === "FAIL");

  return {
    id: `trace-legal-precheck-${Date.now()}`,
    runId,
    agent: "legal",
    task: "Run deterministic legal pre-checks",
    status: blocking ? "blocked" : "completed",
    summary: findings.length
      ? `Legal pre-check completed with ${findings.length} finding(s): ${findings.map(finding => finding.ruleIds.join(",")).join("; ")}.`
      : "Legal pre-check completed. No consent, marital-property, or future-property blocker found in the P0 rule pack.",
    toolCalls,
    findings,
    startedAt,
    completedAt: new Date().toISOString(),
  };
};

export const runLegalGateAgent = async (
  runId: string,
  caseId: string,
  prompt: string,
  productFindings: DecisionEnvelope[],
  creditFindings: DecisionEnvelope[],
  precheckFindings: DecisionEnvelope[] = []
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
      completedAt: new Date().toISOString(),
    };
  }

  const hasInsuranceTyingSignal = productFindings.some(
    finding => finding.ruleIds.includes(productCatalog.ruleIds.insuranceTying) && Boolean(finding.evidence.insuranceTyingApplied)
  );

  const gateFindings = hasInsuranceTyingSignal
    ? ground([legalFinding({
      decisionId: `legal-insurance-${Date.now()}`,
      status: "VIOLATION",
      severity: "BLOCKER",
      blocksAt: "APPROVAL",
      finding: "Preferential loan pricing must not be conditioned on purchasing non-mandatory insurance.",
      evidence: {
        insuranceTyingApplied: true,
        productRuleIds: productFindings.flatMap(finding => finding.ruleIds),
      },
      ruleIds: [productCatalog.ruleIds.legalInsuranceTying],
      requiredFix: "Remove insurance_purchase from pricing function and re-price.",
    })])
    : [];

  const cacheKey = `legal-gate:${caseId}:tying:${hasInsuranceTyingSignal}:precheck:${precheckFindings.map(finding => finding.ruleIds.join("|")).join(",")}`;
  const cachedTraceStr = await getCachedPolicy(cacheKey);
  if (cachedTraceStr) {
    try {
      const cachedTrace = JSON.parse(cachedTraceStr) as AgentTrace;
      cachedTrace.id = `trace-legal-${Date.now()}`;
      cachedTrace.runId = runId;
      cachedTrace.startedAt = startedAt;
      cachedTrace.completedAt = new Date().toISOString();
      return cachedTrace;
    } catch (error) {
      console.warn("Failed to parse cached legal gate trace, recalculating:", error);
    }
  }

  let findings = [...precheckFindings, ...gateFindings];
  let toolCalls: AgentTrace["toolCalls"] = [];
  let reasoningMode = "deterministic_fallback";

  try {
    const result = await runLegalComplianceReasoning(retailCase, prompt, hasInsuranceTyingSignal);
    const llmFindings = groundLegalFindings(result.findings);
    const seen = new Set(findings.map(finding => finding.ruleIds.join("|")));
    findings = [...findings, ...llmFindings.filter(finding => !seen.has(finding.ruleIds.join("|")))];
    toolCalls = result.toolCalls;
    reasoningMode = "llm_graphrag_with_deterministic_guard";
  } catch (error) {
    console.warn("Legal Agent: LLM/GraphRAG unavailable; using deterministic legal fallback:", error);
  }

  const gateStatus = worstStatus(findings);
  const blocking = gateStatus === "VIOLATION" || gateStatus === "BLOCKED" || gateStatus === "FAIL";
  const traceResult: AgentTrace = {
    id: `trace-legal-${Date.now()}`,
    runId,
    agent: "legal",
    task: "Verify compliance and legal regulations",
    status: blocking ? "blocked" : "completed",
    summary: findings.length
      ? `Legal gate completed in ${reasoningMode}. Gate status: ${gateStatus}. ${findings.map(finding => finding.finding).join(" ")}`
      : `Legal gate completed in ${reasoningMode}. No compliance blocker found in the P0 rule pack.`,
    toolCalls: [
      ...toolCalls,
      {
        toolName: "legalReasoningMode",
        input: { hasInsuranceTyingSignal, creditFindingsCount: creditFindings.length },
        output: { reasoningMode },
        status: "success",
        sideEffectLevel: "LOW",
      },
    ],
    findings,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  await setCachedPolicy(cacheKey, JSON.stringify(traceResult));
  return traceResult;
};

export const runLegalAgent = async (
  runId: string,
  caseId: string,
  prompt: string,
  productFindings: DecisionEnvelope[],
  creditFindings: DecisionEnvelope[]
): Promise<AgentTrace> => {
  const precheckTrace = await runLegalPrecheckAgent(runId, caseId);
  return runLegalGateAgent(runId, caseId, prompt, productFindings, creditFindings, precheckTrace.findings ?? []);
};
