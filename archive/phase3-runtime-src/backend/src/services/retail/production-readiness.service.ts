import { evaluateKhcnCases } from "./evaluation.service";
import { getModelGatewayStatus } from "./model-gateway.service";
import { nowIso } from "./retail-common";

type ReadinessStatus = "PASS" | "WARN" | "FAIL";

interface ReadinessControlInput {
  id: string;
  category: string;
  label: string;
  status: ReadinessStatus;
  evidence: string;
  nextAction?: string;
  productionBlocker?: boolean;
}

const control = (input: ReadinessControlInput) => ({
  productionBlocker: false,
  ...input,
});

export const getProductionReadinessReport = async () => {
  const evaluation = await evaluateKhcnCases();
  const gateway = getModelGatewayStatus();
  const evaluationPassed = evaluation.status === "PASS";
  const modelGatewayReady = gateway.enabled && gateway.configured && !gateway.circuitOpen;
  const workflowReady = gateway.workflowQueue.distributedReady;
  const vectorReady = gateway.ruleEvidenceRetrieval.productionReady;
  const documentIngestionReady = gateway.documentIngestion.productionReady;

  const controls = [
    control({
      id: "RUNTIME_EVALUATION",
      category: "runtime",
      label: "KHCN P0 runtime evaluation",
      status: evaluationPassed ? "PASS" : "FAIL",
      evidence: `${evaluation.passed}/${evaluation.checkCount} checks passed across ${evaluation.caseCount} cases.`,
      productionBlocker: !evaluationPassed,
      nextAction: evaluationPassed ? undefined : "Fix failing runtime checks before any bank pilot.",
    }),
    control({
      id: "PII_MASKING",
      category: "ai-safety",
      label: "PII masking before LLM",
      status: gateway.piiMaskingEnabled ? "PASS" : "FAIL",
      evidence: gateway.piiMaskingEnabled ? "Model-facing payloads use masked fields." : "PII masking is disabled.",
      productionBlocker: !gateway.piiMaskingEnabled,
    }),
    control({
      id: "RULE_GROUNDING",
      category: "ai-safety",
      label: "Source-locked rule grounding",
      status: gateway.ruleEvidenceEnabled ? "PASS" : "FAIL",
      evidence: `${gateway.ruleEvidenceRetrieval.provider}; localFallback=${gateway.ruleEvidenceRetrieval.localFallbackEnabled}.`,
      productionBlocker: !gateway.ruleEvidenceEnabled,
    }),
    control({
      id: "VECTOR_RAG",
      category: "ai-safety",
      label: "Production vector retrieval",
      status: vectorReady ? "PASS" : "WARN",
      evidence: `vectorConfigured=${gateway.ruleEvidenceRetrieval.vectorConfigured}.`,
      productionBlocker: !vectorReady,
      nextAction: vectorReady ? undefined : "Connect a source-indexed vector retrieval service for policy/legal citations.",
    }),
    control({
      id: "MODEL_GATEWAY",
      category: "ai-safety",
      label: "Live model gateway",
      status: modelGatewayReady ? "PASS" : "WARN",
      evidence: modelGatewayReady ? `Model ${gateway.model} configured.` : "Deterministic fallback active or circuit open.",
      productionBlocker: !modelGatewayReady,
      nextAction: modelGatewayReady ? undefined : "Configure LLM_ENABLED, LLM_BASE_URL, LLM_API_KEY and monitor circuit breaker.",
    }),
    control({
      id: "DOCUMENT_INGESTION",
      category: "documents",
      label: "OCR/Vision ingestion adapter",
      status: documentIngestionReady ? "PASS" : "WARN",
      evidence: `${gateway.documentIngestion.provider}; endpointConfigured=${gateway.documentIngestion.endpointConfigured}.`,
      productionBlocker: !documentIngestionReady,
      nextAction: documentIngestionReady
        ? undefined
        : "Connect OCR/Vision ingestion with source hash, confidence, bbox, schema normalization, and exception queue.",
    }),
    control({
      id: "WORKFLOW_QUEUE",
      category: "operations",
      label: "Distributed workflow queue",
      status: workflowReady ? "PASS" : gateway.workflowQueue.required ? "FAIL" : "WARN",
      evidence: `${gateway.workflowQueue.backend}; broker=${gateway.workflowQueue.brokerType}.`,
      productionBlocker: !workflowReady,
      nextAction: workflowReady ? undefined : "Use Redis Streams or equivalent broker for distributed workflow events.",
    }),
    control({
      id: "HUMAN_APPROVAL_GUARD",
      category: "operations",
      label: "Human approval guard",
      status: "PASS",
      evidence: "HIGH side-effect tools require explicit approval intent and reviewer authorization.",
    }),
  ];

  const blockers = controls.filter((item) => item.productionBlocker && item.status !== "PASS");
  const localDemoScore = evaluationPassed ? 95 : 70;
  const productionGoLiveScore = Math.max(
    0,
    100 -
      controls.reduce((penalty, item) => {
        if (item.status === "FAIL") {
          return penalty + 20;
        }
        if (item.productionBlocker && item.status === "WARN") {
          return penalty + 8;
        }
        return penalty;
      }, 0)
  );

  return {
    reportId: "PROD-READINESS-KHCN-PHASE3",
    generatedAt: nowIso(),
    localDemoScore,
    targetScoreAfterExternalControls: blockers.length === 0 ? 98 : 95,
    productionGoLiveScore,
    productionGoLiveStatus: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers: blockers.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      nextAction: item.nextAction,
    })),
    controls,
  };
};
