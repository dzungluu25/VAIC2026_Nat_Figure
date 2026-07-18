export type BadgeTone = "default" | "success" | "warning" | "error";

export interface DemoCaseSummary {
  caseId: string;
  title: string;
  product: string;
  description: string;
  riskTier: string;
  approvalRoute: string;
  targetSlaHours: number;
  trapCount: number;
  expectedOutcome: string;
}

export interface ExecutionAction {
  tool: string;
  sideEffect: "NONE" | "LOW" | "HIGH" | "CRITICAL";
  status: string;
  requiresApprovalToken: boolean;
  message: string;
}

export interface DecisionCondition {
  conditionId: string;
  blocksAt: string;
  text: string;
  basisRuleId: string;
}

export interface ToolCallTrace {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
}

export interface AgentTrace {
  id: string;
  runId: string;
  agent: string;
  task: string;
  summary: string;
  toolCalls: ToolCallTrace[];
  status: string;
  startedAt: string;
  completedAt?: string;
}

export interface RetailCaseRun {
  requestId: string;
  caseId: string;
  title: string;
  product: string;
  riskTier: string;
  approvalRoute: string;
  status: string;
  gateStatus: string;
  finalAnswer: string;
  autoApprovalToken?: string;
  humanApprovalToken?: string;
  requiresHumanApproval: boolean;
  customerRequest: Record<string, unknown>;
  systemProposal: Record<string, unknown>;
  conditions: DecisionCondition[];
  executionActions: ExecutionAction[];
  governance: {
    modelCallsUsed: number;
    modelCallsBudget: number;
    estimatedCostUsd: number;
    maxCostUsd: number;
    rawPiiToLlm: boolean;
    maskedFieldCount: number;
    replayMode: boolean;
    cacheHitCount: number;
  };
  traces: AgentTrace[];
}

export interface GovernanceReport {
  reportId: string;
  generatedAt: string;
  requestId: string;
  caseId: string;
  decision: {
    riskTier: string;
    approvalRoute: string;
    gateStatus: string;
    lifecycleStatus: string;
    requiresHumanApproval: boolean;
    finalAnswer: string;
    narrative: string;
  };
  approvalReadiness: {
    approvalIntent: string;
    readyForApproval: boolean;
    highActionsLocked: boolean;
    highActionsExecuted: boolean;
  };
  controls: Array<{
    id: string;
    label: string;
    status: "PASS" | "WARN" | "FAIL";
    evidence: string;
  }>;
  reviewerChecklist: string[];
  ruleEvidence: Array<{
    ruleId: string;
    title: string;
    packId: string;
    sourceType: string;
    sourceName?: string;
    severity?: string;
    ruleType?: string;
    snippet: string;
    score: number;
  }>;
  documentEvidence: Array<{
    documentName: string;
    documentId: string;
    provider: string;
    sourceHash: string;
    pageCount: number;
    minConfidence?: number;
    bboxCount: number;
    fieldEvidenceCount: number;
    status: "PASS" | "WARN";
  }>;
  auditCoverage: {
    auditEvents: number;
    traces: number;
    toolCalls: number;
  };
}

export interface EvaluationReport {
  caseCount: number;
  checkCount: number;
  passed: number;
  failed: number;
  status: string;
  runs: Array<{
    requestId: string;
    caseId: string;
    approvalRoute: string;
    gateStatus: string;
    status: string;
  }>;
}

export interface ModelGatewayStatus {
  enabled: boolean;
  configured: boolean;
  model: string;
  circuitOpen: boolean;
  piiMaskingEnabled: boolean;
  ruleEvidenceEnabled: boolean;
  ruleEvidenceRetrieval: {
    provider: string;
    vectorConfigured: boolean;
    localFallbackEnabled: boolean;
    productionReady: boolean;
  };
  documentIngestion: {
    provider: string;
    configured: boolean;
    endpointConfigured: boolean;
    productionReady: boolean;
    requiredForProduction: string[];
  };
  workflowQueue: {
    backend: string;
    brokerConfigured: boolean;
    brokerType: string;
    required: boolean;
    distributedReady: boolean;
    checkedAt: string;
  };
}

export interface ProductionReadinessReport {
  reportId: string;
  generatedAt: string;
  localDemoScore: number;
  targetScoreAfterExternalControls: number;
  productionGoLiveScore: number;
  productionGoLiveStatus: "READY" | "BLOCKED";
  blockers: Array<{
    id: string;
    label: string;
    status: "PASS" | "WARN" | "FAIL";
    nextAction?: string;
  }>;
  controls: Array<{
    id: string;
    category: string;
    label: string;
    status: "PASS" | "WARN" | "FAIL";
    evidence: string;
    nextAction?: string;
    productionBlocker: boolean;
  }>;
}

export interface AgentNetworkReport {
  reportId: string;
  requestId: string;
  caseId: string;
  title: string;
  objective: string;
  specialists: Array<{
    agent: string;
    label: string;
    bankingDomain: string;
    responsibility: string;
    task: string;
    status: string;
    decision: string;
    toolCount: number;
    tools: Array<{
      name: string;
      status: string;
    }>;
    sequence: number;
  }>;
  orchestrationPlan: Array<{
    step: number;
    assignedAgent: string;
    task: string;
    dependsOn: string[];
    status: string;
    output: string;
  }>;
  handoffs: Array<{
    from: string;
    to: string;
    artifact: string;
    status: string;
  }>;
  toolUseSummary: {
    agentCount: number;
    toolCallCount: number;
    operationalActionCount: number;
    highSideEffectActionCount: number;
    blockedHighSideEffectCount: number;
    auditEventCount: number;
    usesInternalKnowledge: boolean;
    executesBankingActions: boolean;
  };
  decisionSynthesis: {
    riskTier: string;
    approvalRoute: string;
    gateStatus: string;
    lifecycleStatus: string;
    finalAnswer: string;
    conditions: Array<{
      blocksAt: string;
      ruleId: string;
      text: string;
    }>;
  };
  singleAgentComparison: {
    baseline: {
      name: string;
      expectedBehavior: string;
      toolCallCount: number;
      missingCapabilities: string[];
    };
    multiAgent: {
      name: string;
      expectedBehavior: string;
      toolCallCount: number;
      coveredDomains: string[];
    };
  };
}

const serverApiBase = () =>
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const browserApiBase = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${serverApiBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${path} failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const listCases = async () => (await apiFetch<{ cases: DemoCaseSummary[] }>("/api/cases")).cases;

export const runCase = async (caseId: string) =>
  apiFetch<RetailCaseRun>(`/api/cases/${caseId}/run`, { method: "POST" });

export const getRequestGovernance = async (requestId: string) =>
  apiFetch<GovernanceReport>(`/api/requests/${requestId}/governance`);

export const getEvaluationReport = async () => apiFetch<EvaluationReport>("/api/evaluation/khcn");

export const getModelGatewayStatus = async () => apiFetch<ModelGatewayStatus>("/api/model-gateway/status");

export const getProductionReadiness = async () =>
  apiFetch<ProductionReadinessReport>("/api/production-readiness");

export const getCaseAgentNetwork = async (caseId: string) =>
  apiFetch<{ run: RetailCaseRun; agentNetwork: AgentNetworkReport }>(`/api/cases/${caseId}/agent-network`);

export const statusTone = (status: string): BadgeTone => {
  if (status === "PASS" || status === "AUTO_APPROVED" || status === "COMPLETED") return "success";
  if (status === "WARN" || status.includes("PASS") || status.includes("REQUIRED") || status.includes("WAITING")) {
    return "warning";
  }
  if (status === "FAIL" || status.includes("REJECT") || status.includes("REPLAN")) return "error";
  return "default";
};

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)}B VND`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M VND`;
    return value.toLocaleString("en-US");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") return "structured";
  return String(value);
};
