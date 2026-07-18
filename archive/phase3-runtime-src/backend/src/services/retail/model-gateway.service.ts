import { config } from "../../config/env";
import { clock } from "../platform/clock.service";
import { getRuleEvidenceRetrievalStatus, queryKhcnRuleEvidence } from "../rag/khcn-rule-evidence.service";
import { getDocumentIngestionStatus } from "../ingestion/document-ingestion.service";
import { getWorkflowQueueStatus } from "../workflow/workflow-queue.service";
import { maskPiiForModel } from "../security/pii-masker.service";
import { RetailCaseRun } from "../../types/orchestration.types";
import { findKhcnCaseFixture } from "./case-fixture.service";
import { nowIso } from "./retail-common";

interface ModelGatewayCallInput {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type GatewayFetchResult =
  | { ok: true; payload: ChatCompletionResponse }
  | { ok: false; retryable: boolean; error: string };

let consecutiveFailures = 0;
let circuitOpenedUntil = 0;

const endpointFromBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
};

const isCircuitOpen = () => clock().nowMs() < circuitOpenedUntil;

const markGatewaySuccess = () => {
  consecutiveFailures = 0;
  circuitOpenedUntil = 0;
};

const markGatewayFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= config.llmCircuitBreakerThreshold) {
    circuitOpenedUntil = clock().nowMs() + config.llmCircuitBreakerCooldownMs;
  }
};

export const getModelGatewayStatus = () => ({
  enabled: config.llmEnabled,
  configured: Boolean(config.llmApiKey && config.llmBaseUrl),
  model: config.llmModel,
  baseUrlConfigured: Boolean(config.llmBaseUrl),
  apiKeyConfigured: Boolean(config.llmApiKey),
  circuitOpen: isCircuitOpen(),
  retryMax: config.llmMaxRetries,
  circuitBreakerThreshold: config.llmCircuitBreakerThreshold,
  circuitBreakerCooldownMs: config.llmCircuitBreakerCooldownMs,
  piiMaskingEnabled: true,
  ruleEvidenceEnabled: true,
  ruleEvidenceRetrieval: getRuleEvidenceRetrievalStatus(),
  documentIngestion: getDocumentIngestionStatus(),
  workflowStateBackend: config.workflowStateBackend,
  messageBrokerConfigured: Boolean(config.messageBrokerUrl),
  workflowQueue: getWorkflowQueueStatus(),
});

const fetchChatCompletion = async (input: ModelGatewayCallInput): Promise<GatewayFetchResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.llmTimeoutMs);

  try {
    const response = await fetch(endpointFromBaseUrl(config.llmBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      const errorText = await response.text();
      return {
        ok: false,
        retryable,
        error: `HTTP ${response.status}. ${errorText.slice(0, 160)}`,
      };
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    return { ok: true, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model gateway error";
    return { ok: false, retryable: true, error: message };
  } finally {
    clearTimeout(timeout);
  }
};

export const callModelGateway = async (input: ModelGatewayCallInput) => {
  const maskedSystem = maskPiiForModel(input.system);
  const maskedUser = maskPiiForModel(input.user);
  const maskedInput: ModelGatewayCallInput = {
    ...input,
    system: maskedSystem.text,
    user: maskedUser.text,
  };
  const status = getModelGatewayStatus();

  if (!status.enabled || !status.configured) {
    return {
      mode: "FALLBACK",
      model: config.llmModel,
      text:
        "LLM Gateway is not enabled or not configured. Deterministic demo outputs remain active; set LLM_ENABLED=true, LLM_BASE_URL and LLM_API_KEY to enable live model explanations.",
      usage: null,
      status,
      security: {
        maskedFieldCount: maskedSystem.maskedFieldCount + maskedUser.maskedFieldCount,
        maskedFields: [...maskedSystem.maskedFields, ...maskedUser.maskedFields],
      },
    };
  }

  if (isCircuitOpen()) {
    return {
      mode: "ERROR",
      model: config.llmModel,
      text: "LLM Gateway circuit breaker is open. Live model calls are paused and deterministic fallback remains active.",
      usage: null,
      status: getModelGatewayStatus(),
      security: {
        maskedFieldCount: maskedSystem.maskedFieldCount + maskedUser.maskedFieldCount,
        maskedFields: [...maskedSystem.maskedFields, ...maskedUser.maskedFields],
      },
    };
  }

  const attempts = Math.max(1, config.llmMaxRetries + 1);
  const errors: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await fetchChatCompletion(maskedInput);
    if (result.ok) {
      markGatewaySuccess();
      const text = result.payload.choices?.[0]?.message?.content?.trim() || "";

      return {
        mode: "LIVE",
        model: config.llmModel,
        text,
        usage: result.payload.usage ?? null,
        status: getModelGatewayStatus(),
        security: {
          maskedFieldCount: maskedSystem.maskedFieldCount + maskedUser.maskedFieldCount,
          maskedFields: [...maskedSystem.maskedFields, ...maskedUser.maskedFields],
        },
      };
    }

    errors.push(result.error);
    if (!result.retryable) {
      break;
    }
  }

  markGatewayFailure();
  return {
    mode: "ERROR",
    model: config.llmModel,
    text: `LLM Gateway request failed after ${errors.length} attempt(s). ${errors.at(-1) ?? "Unknown error"}`,
    usage: null,
    status: getModelGatewayStatus(),
    security: {
      maskedFieldCount: maskedSystem.maskedFieldCount + maskedUser.maskedFieldCount,
      maskedFields: [...maskedSystem.maskedFields, ...maskedUser.maskedFields],
    },
  };
};

export const explainRetailDecision = async (summary: Record<string, unknown>) => {
  const ruleEvidence = await queryKhcnRuleEvidence(JSON.stringify(summary), 6);

  const explanation = await callModelGateway({
    system:
      "You are a banking operations explainer. Use only the provided masked/synthetic fields and ruleEvidence. Do not invent legal citations, do not expose PII, and keep the explanation concise.",
    user: JSON.stringify(
      {
        task: "Explain the retail loan decision for an internal reviewer.",
        summary,
        ruleEvidence,
      },
      null,
      2
    ),
    temperature: 0.1,
    maxTokens: 450,
  });

  return {
    ...explanation,
    ruleEvidence,
  };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" ? value : fallback);

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asRecord) : [];

const collectDocumentEvidence = async (caseId: string) => {
  const fixture = await findKhcnCaseFixture(caseId);
  if (!fixture) {
    return [];
  }

  return Object.entries(fixture.parsedDocs).map(([documentName, document]) => {
    const provenance = asRecord(asRecord(document)._provenance);
    const pages = asRecordArray(provenance.pages);
    const fields = asRecordArray(provenance.fields);
    const confidenceValues = [
      ...pages.map((page) => asNumber(page.confidence, Number.NaN)),
      ...fields.map((field) => asNumber(field.confidence, Number.NaN)),
    ].filter(Number.isFinite);
    const minConfidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : undefined;
    const bboxCount =
      pages.reduce((sum, page) => sum + asNumber(page.bbox_count ?? page.bboxCount, 0), 0) +
      fields.filter((field) => Array.isArray(field.bbox)).length;
    const sourceHash = asString(provenance.source_hash ?? provenance.sourceHash);
    const hasGrounding = Boolean(sourceHash) && pages.length > 0 && fields.length > 0 && minConfidence !== undefined;

    return {
      documentName,
      documentId: asString(provenance.document_id ?? provenance.documentId, documentName),
      provider: asString(provenance.provider, "unknown"),
      sourceHash,
      pageCount: pages.length,
      minConfidence,
      bboxCount,
      fieldEvidenceCount: fields.length,
      status: hasGrounding ? "PASS" : "WARN",
    };
  });
};

const collectRuleIds = (run: RetailCaseRun) => {
  const ids = new Set<string>();
  run.conditions.forEach((condition) => ids.add(condition.basisRuleId));

  run.traces.forEach((trace) => {
    trace.toolCalls.forEach((call) => {
      const input = asRecord(call.input);
      const output = asRecord(call.output);
      [input.rule_id, input.ruleId, output.rule_id, output.ruleId].forEach((value) => {
        if (typeof value === "string") {
          ids.add(value);
        }
      });
    });

    if (trace.agent === "system") {
      ids.add("SHB-INJECTION-GUARD-RETAIL-001");
    }
  });

  if (run.riskTier) {
    ids.add("SHB-RISK-ROUTER-001");
  }
  if (run.gateStatus === "REJECT_OR_REQUEST_LOWER_AMOUNT") {
    ids.add("SHB-DTI-STRESS-001");
    ids.add("SHB-LTV-RETAIL-001");
  }
  if (run.approvalRoute === "HYBRID_APPROVAL") {
    ids.add("APPROVAL-GUARD-HIGH-SIDE-EFFECT-001");
  }

  return [...ids].sort();
};

const explainGate = (run: RetailCaseRun) => {
  switch (run.gateStatus) {
    case "AUTO_APPROVED":
      return "The request stayed within the fast-lane policy and executed deterministic auto-approval actions.";
    case "CONDITIONAL_PASS":
      return "The agents recommend approval only with controlled human review; HIGH side-effect tools remain guarded until approval.";
    case "REPLAN_REQUIRED":
      return "The gate stopped approval because an approval-level compliance issue requires the offer to be rebuilt.";
    case "CONSENT_REQUIRED":
      return "The gate stopped external data access because the required customer consent scope is missing.";
    case "REJECT_OR_REQUEST_LOWER_AMOUNT":
      return "The credit proposal cannot satisfy the stress affordability policy at a viable amount.";
    default:
      return `The gate returned ${run.gateStatus}.`;
  }
};

const buildReviewerChecklist = (run: RetailCaseRun) => {
  if (run.gateStatus === "AUTO_APPROVED") {
    return [
      "Confirm audit trail contains auto-policy token issuance.",
      "Confirm customer notification and LOS write are marked completed.",
    ];
  }

  if (run.gateStatus === "REPLAN_REQUIRED") {
    return [
      "Remove approval-level blocker from the offer before any approval action.",
      "Re-run the case after repricing or policy correction.",
    ];
  }

  if (run.gateStatus === "CONSENT_REQUIRED") {
    return [
      "Collect valid consent for INCOME_VERIFICATION_BHXH.",
      "Keep outbound income verification calls blocked until consent is recorded.",
    ];
  }

  if (run.gateStatus === "REJECT_OR_REQUEST_LOWER_AMOUNT") {
    return [
      "Request a lower amount or additional verified income.",
      "Do not override the stress DTI result without documented credit exception approval.",
    ];
  }

  const conditionItems = run.conditions.map(
    (condition) => `${condition.blocksAt}: ${condition.text} (${condition.basisRuleId})`
  );
  return [
    "Validate the proposed amount, DTI, LTV, and conditions before approval.",
    ...conditionItems,
    "Approve only if the approval intent still matches the current request state.",
  ];
};

export const buildRetailGovernanceReport = async (run: RetailCaseRun) => {
  const ruleIds = collectRuleIds(run);
  const documentEvidence = await collectDocumentEvidence(run.caseId);
  const query = [
    run.caseId,
    run.gateStatus,
    run.approvalRoute,
    run.finalAnswer,
    ...ruleIds,
    ...run.conditions.map((condition) => condition.text),
  ].join(" ");
  const ruleEvidence = await queryKhcnRuleEvidence(query, 8);
  const modelGateway = getModelGatewayStatus();
  const highActions = run.executionActions.filter((action) => action.sideEffect === "HIGH");
  const highActionsLocked = highActions.every((action) => action.status === "BLOCKED");
  const highActionsExecuted = highActions.length > 0 && highActions.every((action) => action.status !== "BLOCKED");
  const approvalIntent = `APPROVE:${run.requestId}:${run.gateStatus}:${run.conditions.length}`;
  const sourceLockedEvidenceCount = ruleEvidence.filter((evidence) => evidence.sourceType).length;
  const documentsWithProvenance = documentEvidence.filter((document) => document.status === "PASS").length;

  const controls = [
    {
      id: "PII_MASKING",
      label: "PII masking before model use",
      status: run.governance.rawPiiToLlm ? "FAIL" : "PASS",
      evidence: `${run.governance.maskedFieldCount} masked token(s); rawPiiToLlm=${run.governance.rawPiiToLlm}.`,
    },
    {
      id: "RULE_GROUNDING",
      label: "Rule evidence grounding",
      status: sourceLockedEvidenceCount > 0 ? "PASS" : "WARN",
      evidence: `${sourceLockedEvidenceCount} source-locked rule evidence item(s) matched.`,
    },
    {
      id: "HIGH_SIDE_EFFECT_GUARD",
      label: "HIGH side-effect guard",
      status:
        run.requiresHumanApproval && highActionsLocked
          ? "PASS"
          : run.status === "COMPLETED" && (highActionsExecuted || run.approvalRoute === "AUTO_APPROVAL")
            ? "PASS"
            : "WARN",
      evidence: `${highActions.filter((action) => action.status === "BLOCKED").length}/${highActions.length} HIGH action(s) currently blocked.`,
    },
    {
      id: "MODEL_GATEWAY",
      label: "LLM gateway safety mode",
      status: modelGateway.enabled && modelGateway.configured ? "PASS" : "WARN",
      evidence: modelGateway.enabled && modelGateway.configured ? "Live model gateway configured." : "Deterministic fallback is active; live model gateway is disabled or unconfigured.",
    },
    {
      id: "DOCUMENT_PROVENANCE",
      label: "Document provenance",
      status: documentEvidence.length > 0 && documentsWithProvenance === documentEvidence.length ? "PASS" : "WARN",
      evidence: `${documentsWithProvenance}/${documentEvidence.length} parsed document artifact(s) include source hash, page confidence, and field bounding boxes.`,
    },
    {
      id: "DOCUMENT_INGESTION",
      label: "Document ingestion production readiness",
      status: modelGateway.documentIngestion.productionReady ? "PASS" : "WARN",
      evidence: `${modelGateway.documentIngestion.provider}; productionReady=${modelGateway.documentIngestion.productionReady}.`,
    },
  ];

  const groundedClaims = [
    {
      claim: explainGate(run),
      evidenceRuleIds: ruleIds,
      traceAgents: run.traces.map((trace) => trace.agent),
    },
    {
      claim:
        run.approvalRoute === "HYBRID_APPROVAL"
          ? "Human approval is required before HIGH write tools can execute."
          : "Fast-lane policy issued an auto approval authorization for low-risk processing.",
      evidenceRuleIds: run.approvalRoute === "HYBRID_APPROVAL" ? ["APPROVAL-GUARD-HIGH-SIDE-EFFECT-001"] : ["SHB-RISK-ROUTER-001"],
      traceAgents: ["router", "gate", "operations"],
    },
  ];

  return {
    reportId: `GOV-${run.requestId}`,
    generatedAt: nowIso(),
    requestId: run.requestId,
    caseId: run.caseId,
    title: run.title,
    decision: {
      riskTier: run.riskTier,
      approvalRoute: run.approvalRoute,
      gateStatus: run.gateStatus,
      lifecycleStatus: run.status,
      requiresHumanApproval: run.requiresHumanApproval,
      finalAnswer: run.finalAnswer,
      narrative: explainGate(run),
    },
    approvalReadiness: {
      approvalIntent,
      readyForApproval: run.status === "WAITING_HUMAN_APPROVAL" && run.gateStatus === "CONDITIONAL_PASS",
      highActionsLocked,
      highActionsExecuted,
    },
    groundedClaims,
    controls,
    reviewerChecklist: buildReviewerChecklist(run),
    ruleEvidence,
    documentEvidence,
    modelGateway,
    auditCoverage: {
      auditEvents: run.audit.length,
      traces: run.traces.length,
      toolCalls: run.traces.flatMap((trace) => trace.toolCalls).length,
    },
  };
};
