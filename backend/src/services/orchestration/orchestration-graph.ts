import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { AgentTrace } from "../../types/trace.types";
import { ConditionPrecedent } from "../../types/agent.types";
import { runCustomerProfileAgent } from "../agents/customer-profile.agent";
import { runProductPolicyAgent } from "../agents/product-policy.agent";
import { runCreditAgent } from "../agents/credit.agent";
import { runLegalAgent } from "../agents/legal.agent";
import { runOperationsAgent } from "../agents/operations.agent";
import { decideNextAction } from "./decision-matrix.service";
import { recordAuditEvent } from "../governance/audit-log.service";
import { pgPool } from "../../config/pg";
import { loadRetailCase } from "../data/retail-case-loader";
import { RetailCase } from "../../types/case.types";
import { ApprovedLoanTerms, ApprovalMode, BusinessValueProjection } from "../../types/product.types";
import { CreditAssessmentResult } from "../rules/credit-rule-engine";
import { evaluateAutoApprovalPolicy } from "../rules/auto-approval-policy.service";
import { projectBusinessValue } from "../business/profitability-engine";

const FAST_LANE_MAX_LOAN_AMOUNT = 500_000_000; // 500M VND

/**
 * Fast-lane eligibility is a conservative "clean file" rule: small ticket size,
 * completed (non-off-plan) collateral, no existing debts to net against income,
 * single applicant (no marital-property gate needed), and fully salaried income
 * (no haircut variance). Any case failing one of these goes through the full
 * Complex lane instead.
 */
const classifyRiskTier = (retailCase: RetailCase): "FAST" | "COMPLEX" => {
  const isFastLaneEligible =
    retailCase.requestedLoan.amount <= FAST_LANE_MAX_LOAN_AMOUNT &&
    retailCase.property.status === "completed" &&
    retailCase.demographic.maritalStatus === "single" &&
    retailCase.currentDebts.length === 0 &&
    retailCase.incomeSources.every(source => source.type === "salary");

  return isFastLaneEligible ? "FAST" : "COMPLEX";
};

export type FinalDecision = "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION";

/**
 * Orchestration state graph for the credit appraisal pipeline. Replaces the previous
 * imperative if/else chain in planner.service.ts — each specialist agent is a node,
 * and routing (fast vs. complex lane, the insurance-tying self-correction loop) is
 * expressed as conditional edges instead of nested branching, matching exactly the
 * business flow that existed before (same agents, same rules, same trace shape).
 */
export const OrchestrationAnnotation = Annotation.Root({
  // Inputs — set once by the caller before invoking the graph.
  runId: Annotation<string>(),
  requestedBy: Annotation<string>(),
  prompt: Annotation<string>(),
  caseId: Annotation<string>(),
  customerName: Annotation<string>(),
  approvalToken: Annotation<string | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),

  // Routing state, decided inside the graph.
  riskTier: Annotation<"FAST" | "COMPLEX">({ default: () => "COMPLEX", reducer: (_prev, next) => next }),
  terminalReason: Annotation<"BLOCKED" | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),

  modelCallsCount: Annotation<number>({ default: () => 0, reducer: (a, b) => a + b }),

  // One trace slot per pipeline stage. Overwritten (not appended) so the self-correction
  // loop can transparently replace the product/legal trace with its re-priced rerun,
  // exactly like the array-index replacement the previous imperative code did.
  plannerTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  profileTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  productTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  creditTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  legalTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  selfCorrectionTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  riskTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  opsTrace: Annotation<AgentTrace | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),

  finalDecision: Annotation<FinalDecision>({ default: () => "PASS", reducer: (_prev, next) => next }),
  conditions: Annotation<ConditionPrecedent[]>({ default: () => [], reducer: (_prev, next) => next }),
  requiredFixes: Annotation<string[]>({ default: () => [], reducer: (_prev, next) => next }),
  ticketId: Annotation<string | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  approvalMode: Annotation<ApprovalMode>({ default: () => "HYBRID_APPROVAL", reducer: (_prev, next) => next }),
  approvedTerms: Annotation<ApprovedLoanTerms | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  businessValue: Annotation<BusinessValueProjection | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
});

export type OrchestrationState = typeof OrchestrationAnnotation.State;

const classifyNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const startedAt = new Date().toISOString();
  const initialAudit = await recordAuditEvent(state.runId, "gateway-governance", "model_call", { prompt: state.prompt }, "allowed");

  if (initialAudit.status === "blocked") {
    return {
      terminalReason: "BLOCKED",
      modelCallsCount: 1,
      plannerTrace: {
        id: `trace-planner-${Date.now()}`,
        runId: state.runId,
        agent: "planner",
        task: "Analyze prompt and determine workflow",
        status: "failed",
        summary: "HỒ SƠ BỊ CHẶN DO PHÁT HIỆN TẤN CÔNG BẢO MẬT (PROMPT INJECTION).",
        toolCalls: [],
        startedAt,
        completedAt: new Date().toISOString(),
      },
    };
  }

  const retailCase = await loadRetailCase(state.caseId);
  const riskTier: "FAST" | "COMPLEX" = retailCase ? classifyRiskTier(retailCase) : "COMPLEX";

  return {
    riskTier,
    modelCallsCount: 1,
    plannerTrace: {
      id: `trace-planner-${Date.now()}`,
      runId: state.runId,
      agent: "planner",
      task: "Analyze prompt and determine workflow",
      status: "completed",
      summary: `Nhận diện yêu cầu vay của khách hàng ${state.customerName}. Phân loại luồng xử lý rủi ro: [${riskTier}]. Khởi tạo quy trình nghiệp vụ phù hợp.`,
      toolCalls: [
        {
          toolName: "detectRiskTier",
          input: { prompt: state.prompt, caseId: state.caseId },
          output: { riskTier, caseId: state.caseId },
          status: "success",
        },
      ],
      startedAt,
      completedAt: new Date().toISOString(),
    },
  };
};

const profileNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const trace = await runCustomerProfileAgent(state.runId, state.caseId);
  return { profileTrace: trace, modelCallsCount: 1 };
};

const productNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const trace = await runProductPolicyAgent(state.runId, state.caseId, false);
  return { productTrace: trace, modelCallsCount: 1 };
};

const creditNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const trace = await runCreditAgent(state.runId, state.caseId);
  return { creditTrace: trace, modelCallsCount: 1 };
};

const getCreditAssessment = (state: OrchestrationState): CreditAssessmentResult | undefined =>
  state.creditTrace?.toolCalls.find(call => call.toolName === "evaluateCreditRules")?.output as unknown as CreditAssessmentResult | undefined;

const getOfferRate = (state: OrchestrationState): number => {
  const offer = state.productTrace?.toolCalls.find(call => call.toolName === "buildPricingOffer")?.output as { appliedRate?: number } | undefined;
  return offer?.appliedRate ?? 0.083;
};

const autoPolicyNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const retailCase = await loadRetailCase(state.caseId);
  const credit = getCreditAssessment(state);
  if (!retailCase || !credit || state.creditTrace?.status !== "completed") {
    return { finalDecision: "HUMAN_ESCALATION", approvalMode: "HYBRID_APPROVAL", requiredFixes: ["Auto-policy không đủ dữ liệu tin cậy; chuyển thẩm định thủ công."] };
  }

  const hasProductConflict = state.productTrace?.findings?.some(finding =>
    finding.ruleIds?.includes("PRODUCT_PRICING_INSURANCE_TYING") && finding.evidence?.insuranceTyingApplied
  ) ?? false;
  const policy = evaluateAutoApprovalPolicy(retailCase, credit, hasProductConflict);
  if (!policy.eligible) {
    return { riskTier: "COMPLEX", finalDecision: "HUMAN_ESCALATION", approvalMode: "HYBRID_APPROVAL", requiredFixes: policy.reasonCodes };
  }

  const approvedTerms: ApprovedLoanTerms = {
    loanAmount: credit.originalScenario.loanAmount,
    tenureYears: credit.originalScenario.tenureYears,
    annualRate: getOfferRate(state),
    approvalMode: "AUTO_APPROVAL",
    source: "ORIGINAL_REQUEST",
  };
  return { finalDecision: "FAST_PASS", approvalMode: "AUTO_APPROVAL", approvedTerms, businessValue: projectBusinessValue(approvedTerms) };
};

const legalNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const trace = await runLegalAgent(
    state.runId,
    state.caseId,
    state.prompt,
    state.productTrace?.findings || [],
    state.creditTrace?.findings || []
  );
  return { legalTrace: trace, modelCallsCount: 1 };
};

const selfCorrectionNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  await recordAuditEvent(
    state.runId,
    "planner-agent",
    "agent_call",
    {},
    "allowed",
    "Phát hiện vi phạm bán chéo bảo hiểm (Insurance Tying). Planner tự động kích hoạt vòng lặp định giá lại (Self-Correction Re-pricing Loop)."
  );

  const selfCorrectionTrace: AgentTrace = {
    id: `trace-planner-loop-${Date.now()}`,
    runId: state.runId,
    agent: "planner",
    task: "Resolve pricing-compliance conflict (Self-Correction Loop)",
    status: "completed",
    summary: "Cảnh báo pháp lý: Lãi suất bị ràng buộc với điều kiện mua bảo hiểm. Kích hoạt lệnh định giá lại không đi kèm bảo hiểm đối với Product Policy Agent và chạy lại kiểm duyệt pháp lý.",
    toolCalls: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  const productTrace = await runProductPolicyAgent(state.runId, state.caseId, true);
  const legalTrace = await runLegalAgent(
    state.runId,
    state.caseId,
    state.prompt,
    productTrace.findings || [],
    state.creditTrace?.findings || []
  );

  return { selfCorrectionTrace, productTrace, legalTrace, modelCallsCount: 2 };
};

const riskNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const mandatoryFailure = [state.profileTrace, state.productTrace, state.creditTrace, state.legalTrace]
    .find(trace => !trace || trace.status === "failed");
  if (mandatoryFailure) {
    return {
      finalDecision: "HUMAN_ESCALATION",
      approvalMode: "HYBRID_APPROVAL",
      requiredFixes: [`Mandatory agent failed: ${mandatoryFailure?.agent ?? "unknown"}. Hệ thống fail-closed.`],
    };
  }

  const matrixOutput = decideNextAction(
    state.creditTrace?.findings || [],
    state.productTrace?.findings || [],
    state.legalTrace?.findings || []
  );

  const riskTrace: AgentTrace = {
    id: `trace-risk-${Date.now()}`,
    runId: state.runId,
    agent: "risk",
    task: "Consolidate findings and assign final decision",
    status: "completed",
    summary: `Hội đồng rủi ro đã tổng hợp phán quyết: [${matrixOutput.finalDecision}]. Lý do: ${matrixOutput.reasonCodes.join(", ")}. Các lỗi cần sửa: ${matrixOutput.requiredFixes.join("; ") || "Không có"}.`,
    toolCalls: [
      {
        toolName: "decideNextAction",
        input: {
          creditFindingsCount: state.creditTrace?.findings?.length || 0,
          productFindingsCount: state.productTrace?.findings?.length || 0,
          legalFindingsCount: state.legalTrace?.findings?.length || 0,
        },
        output: matrixOutput as unknown as Record<string, unknown>,
        status: "success",
      },
    ],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  const credit = getCreditAssessment(state);
  const scenario = credit?.restructureScenario?.status === "PASS" ? credit.restructureScenario : credit?.originalScenario;
  const approvedTerms: ApprovedLoanTerms | undefined = scenario ? {
    loanAmount: scenario.loanAmount,
    tenureYears: scenario.tenureYears,
    annualRate: getOfferRate(state),
    approvalMode: "HYBRID_APPROVAL",
    source: credit?.restructureScenario?.status === "PASS" ? "RESTRUCTURED_PROPOSAL" : "ORIGINAL_REQUEST",
  } : undefined;
  const businessValue = approvedTerms ? projectBusinessValue(approvedTerms) : undefined;
  const profitabilityBlocked = businessValue && !businessValue.profitable && (matrixOutput.finalDecision === "PASS" || matrixOutput.finalDecision === "CONDITIONAL_PASS");

  return {
    riskTrace,
    finalDecision: profitabilityBlocked ? "HUMAN_ESCALATION" : matrixOutput.finalDecision,
    approvalMode: "HYBRID_APPROVAL",
    approvedTerms,
    businessValue,
    conditions: matrixOutput.conditions,
    requiredFixes: profitabilityBlocked ? [...matrixOutput.requiredFixes, "Đề xuất chưa đạt profitability floor/RAROC tối thiểu."] : matrixOutput.requiredFixes,
    modelCallsCount: 1,
  };
};

const operationsNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const { trace, ticketId } = await runOperationsAgent(
    state.runId,
    state.caseId,
    state.finalDecision,
    state.conditions,
    state.approvalToken,
    state.approvalMode,
    state.approvedTerms
  );
  return { opsTrace: trace, ticketId };
};

const hasInsuranceTyingViolation = (state: OrchestrationState): boolean =>
  state.legalTrace?.findings?.some(f => f.ruleIds.includes("LEGAL_INSURANCE_TYING_DETECTED")) ?? false;

const builder = new StateGraph(OrchestrationAnnotation)
  .addNode("classify", classifyNode)
  .addNode("profile", profileNode)
  .addNode("product", productNode)
  .addNode("credit", creditNode)
  .addNode("autoPolicy", autoPolicyNode)
  .addNode("legal", legalNode)
  .addNode("selfCorrection", selfCorrectionNode)
  .addNode("risk", riskNode)
  .addNode("operations", operationsNode)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", state => (state.terminalReason === "BLOCKED" ? "blocked" : "continue"), {
    blocked: END,
    continue: "profile",
  })
  .addEdge("profile", "product")
  .addEdge("product", "credit")
  .addConditionalEdges("credit", state => (state.riskTier === "FAST" ? "fast" : "complex"), {
    fast: "autoPolicy",
    complex: "legal",
  })
  .addConditionalEdges("autoPolicy", state => (state.finalDecision === "FAST_PASS" ? "approved" : "escalate"), {
    approved: "operations",
    escalate: "operations",
  })
  .addConditionalEdges("legal", state => (hasInsuranceTyingViolation(state) ? "reprice" : "noReprice"), {
    reprice: "selfCorrection",
    noReprice: "risk",
  })
  .addEdge("selfCorrection", "risk")
  .addEdge("risk", "operations")
  .addEdge("operations", END);

// Reuses the same Postgres pool as the audit log — no separate connection pool needed.
// Checkpointing means an in-flight run's graph state survives a server restart/crash
// instead of being lost like the previous in-memory trace store.
const checkpointer = new PostgresSaver(pgPool);

/** Must be called once at startup (see seed-db.ts) before the first graph invocation. */
export const setupOrchestrationCheckpointer = (): Promise<void> => checkpointer.setup();

export const orchestrationGraph = builder.compile({ checkpointer });

/** Rebuilds the ordered trace list from the final graph state, in the same order the
 * previous imperative pipeline produced traces (including in-place replacement of the
 * product/legal trace when the self-correction loop ran). */
export const assembleTraces = (state: OrchestrationState): AgentTrace[] =>
  [
    state.plannerTrace,
    state.profileTrace,
    state.productTrace,
    state.creditTrace,
    state.legalTrace,
    state.selfCorrectionTrace,
    state.riskTrace,
    state.opsTrace,
  ].filter((t): t is AgentTrace => t !== undefined);
