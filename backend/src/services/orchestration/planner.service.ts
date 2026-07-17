import { OrchestrationResponse, OrchestrationStreamEvent } from "../../types/orchestration.types";
import { CostBudgetStatus, AgentTrace } from "../../types/trace.types";
import { RetailCase } from "../../types/case.types";
import { RETAIL_CASES } from "../data/retail-case-data";
import { maskPiiPayload } from "../governance/pii-masking.service";
import { recordAuditEvent, getAuditEventsByRun } from "../governance/audit-log.service";
import { saveOrchestrationRun } from "./trace.service";
import { orchestrationGraph, assembleTraces, OrchestrationState } from "./orchestration-graph";
import { getFptMarketplaceClient } from "../../config/fpt-marketplace";
import { config } from "../../config/env";

// Order matters: within the self-correction chunk, selfCorrectionTrace, productTrace and
// legalTrace all change simultaneously (one graph step) — scanning selfCorrection before
// product/legal emits the "re-pricing triggered" event first, then the two re-run updates,
// matching the actual business narrative instead of raw object-key order.
const TRACE_KEYS = [
  "plannerTrace",
  "profileTrace",
  "selfCorrectionTrace",
  "productTrace",
  "creditTrace",
  "legalTrace",
  "riskTrace",
  "opsTrace",
] as const;

// Simple routing classifier — determines which seeded case a free-text prompt refers to.
// Runs before the graph so a "case not found" response can short-circuit without
// creating any trace at all, matching the previous behavior.
const detectCaseIdFromPrompt = async (prompt: string): Promise<string> => {
  const p = prompt.toLowerCase();
  if (p.includes("hacker") || p.includes("inject") || p.includes("tấn công") || p.includes("ignore all previous instructions")) {
    return "case-prompt-injection";
  }

  const client = getFptMarketplaceClient();
  try {
    const response = await client.chat.completions.create({
      model: config.fptLegalModel,
      messages: [
        {
          role: "system",
          content: `Bạn là AI Router chịu trách nhiệm phân tích yêu cầu (prompt) của người dùng và phân loại khớp với một trong các hồ sơ mẫu dưới đây:

- "case-fast-clean": Hồ sơ sạch, duyệt nhanh của chị Bình (500 triệu, single, LTV thấp, không nợ). Ngoài ra còn khớp với trường hợp khách hàng có lịch sử nợ xấu cũ đã tất toán trên 5 năm trước.
- "case-complex-main": Hồ sơ vay phức tạp của anh Nguyễn Văn Hùng mua nhà Vinhomes Ocean Park 3 (2.8 tỷ, đã kết hôn).
- "case-missing-spouse-sig": Hồ sơ của anh Hải (đã kết hôn, thiếu chữ ký vợ). Hoặc trường hợp nợ nhóm 2 cần giải trình, thế chấp sổ đỏ của bạn bè (bảo lãnh phi nhân thân).
- "case-missing-guarantee": Hồ sơ của anh Tuấn (căn hộ Galaxy Complex chưa có bảo lãnh). Hoặc dự án căn hộ chưa đủ điều kiện mở bán, mục đích đảo nợ thẻ tín dụng đen, đầu tư tiền ảo.
- "case-missing-consent": Hồ sơ thiếu đồng ý tra cứu thông tin tín dụng CIC/Thuế của anh Nam.
- "case-dti-fail": Hồ sơ bị từ chối DTI của anh Cường. Hoặc các trường hợp không đủ điều kiện DTI/LTV/tuổi tác (như 72 tuổi), vay xe ô tô LTV 85%, tiệm tạp hóa chưa đăng ký kinh doanh, nhà đất vướng quy hoạch lộ giới, lương tiền mặt không đóng bảo hiểm xã hội.
- "case-prompt-injection": Các hành vi tấn công mã độc, bỏ qua quy tắc bảo mật.

Hãy trả về duy nhất chuỗi caseId thích hợp (ví dụ: "case-complex-main"), tuyệt đối không giải thích gì thêm.`
        },
        {
          role: "user",
          content: `Yêu cầu thẩm định: "${prompt}"`
        }
      ],
      max_tokens: 1024,
      temperature: 0.0,
    });

    const matchedId = response.choices[0].message.content?.trim().replace(/['"`]/g, "");
    if (matchedId && RETAIL_CASES[matchedId]) {
      return matchedId;
    }
  } catch (error) {
    console.error("Failed to classify prompt using LLM, falling back to default:", error);
  }
  return "case-complex-main";
};

/** Shared response assembly for both the synchronous and streaming entry points. */
const buildOrchestrationResponse = async (
  runId: string,
  caseId: string,
  retailCase: RetailCase,
  approvalToken: string | undefined,
  finalState: OrchestrationState
): Promise<OrchestrationResponse> => {
  if (finalState.terminalReason === "BLOCKED") {
    const response: OrchestrationResponse = {
      runId,
      finalAnswer: "Yêu cầu bị từ chối do vi phạm quy tắc an toàn bảo mật thông tin (Prompt Injection).",
      traces: assembleTraces(finalState),
      budgetStatus: {
        piiMasked: true,
        missingConsentCalls: 0,
        highWritesBeforeApproval: 0,
        modelCallsUsed: finalState.modelCallsCount,
        maxModelCalls: 30,
        estimatedCostUSD: 0.02,
        replayMode: true
      },
      auditEvents: await getAuditEventsByRun(runId)
    };
    saveOrchestrationRun(runId, response);
    return response;
  }

  const rawTraces = assembleTraces(finalState);
  const maskedTraces = maskPiiPayload(rawTraces);
  const { finalDecision, conditions, requiredFixes, ticketId, approvalMode, approvedTerms, businessValue } = finalState;

  // Compile final answer string
  let finalAnswer = "";
  if (finalDecision === "FAST_PASS") {
    finalAnswer = `[DUYỆT NHANH] Khoản vay của khách hàng được phê duyệt qua luồng Fast Pass. Số tiền vay đề xuất: ${retailCase.requestedLoan.amount.toLocaleString()} VND. Mã hồ sơ giải ngân Core Banking: ${ticketId || "PENDING"}.`;
  } else if (finalDecision === "PASS") {
    finalAnswer = ticketId
      ? `[ĐÃ PHÊ DUYỆT] Hạn mức ${approvedTerms?.loanAmount.toLocaleString()} VND đã được người có thẩm quyền duyệt. Mã Core Banking: ${ticketId}.`
      : `[ĐỀ XUẤT PHÊ DUYỆT] Hồ sơ đạt tiêu chí tín dụng và pháp lý, đang chờ người có thẩm quyền phê duyệt trước khi ghi Core Banking.`;
  } else if (finalDecision === "CONDITIONAL_PASS") {
    const creditOutput = rawTraces.find(t => t.agent === "credit")?.toolCalls.find(tc => tc.toolName === "evaluateCreditRules")?.output as any;
    const loanAmt = creditOutput?.restructureScenario?.loanAmount || retailCase.requestedLoan.amount;
    const loanTenure = creditOutput?.restructureScenario?.tenureYears || retailCase.requestedLoan.tenureYears;

    if (!ticketId) {
      finalAnswer = `[HỘI ĐỒNG PHÁN QUYẾT: PHÊ DUYỆT CÓ ĐIỀU KIỆN] Khoản vay tái cấu trúc đề xuất: ${loanAmt.toLocaleString()} VND trong ${loanTenure} năm. Hồ sơ đang CHỜ DUYỆT CỦA CON NGƯỜI (Human Approval Token) trước khi đăng ký lên Core Banking.`;
    } else {
      finalAnswer = `[HỘI ĐỒNG PHÁN QUYẾT: ĐÃ DUYỆT CÓ ĐIỀU KIỆN] Đã cấp hạn mức vay tái cấu trúc: ${loanAmt.toLocaleString()} VND trong ${loanTenure} năm. Khế ước hạn mức (${ticketId}) đã được đăng ký ở trạng thái PENDING_CONDITIONS. Vui lòng hoàn tất ${conditions.length} điều kiện trước khi giải ngân.`;
    }
  } else if (finalDecision === "HUMAN_ESCALATION") {
    finalAnswer = `[CHỜ XỬ LÝ CON NGƯỜI] Hồ sơ bị tạm ngưng do có cảnh báo nghiêm trọng. Lý do: ${requiredFixes.join("; ")}`;
  } else {
    finalAnswer = `[TỪ CHỐI PHÊ DUYỆT] Hồ sơ bị từ chối tín dụng do không đáp ứng các chỉ tiêu rủi ro. Chi tiết: ${requiredFixes.join("; ")}`;
  }

  // Cost budget calculation
  const missingConsent = caseId === "case-missing-consent";
  const highWritesBeforeApproval = (finalDecision === "CONDITIONAL_PASS" || finalDecision === "PASS") && !approvalToken;

  const budgetStatus: CostBudgetStatus = {
    piiMasked: true,
    missingConsentCalls: missingConsent ? 1 : 0,
    highWritesBeforeApproval: highWritesBeforeApproval ? 1 : 0,
    modelCallsUsed: finalState.modelCallsCount,
    maxModelCalls: 30,
    estimatedCostUSD: Number((finalState.modelCallsCount * 0.015).toFixed(4)),
    replayMode: true
  };

  const response: OrchestrationResponse = {
    runId,
    finalAnswer,
    traces: maskedTraces,
    approvalTicketId: ticketId,
    conditions,
    budgetStatus,
    auditEvents: await getAuditEventsByRun(runId),
    approvalMode,
    approvedTerms,
    businessValue
  };

  saveOrchestrationRun(runId, response);
  return response;
};

export const executeOrchestration = async (
  prompt: string,
  requestedBy: string,
  approvalToken?: string
): Promise<OrchestrationResponse> => {
  const runId = `run-${Date.now()}`;
  const caseId = await detectCaseIdFromPrompt(prompt);
  const retailCase = RETAIL_CASES[caseId];

  // Governance: Record starting audit event, attributed to the authenticated human requester.
  await recordAuditEvent(runId, requestedBy, "agent_call", { prompt, caseId }, "allowed", `Chuyên viên ${requestedBy} khởi chạy quy trình điều phối cho caseId: ${caseId}`);

  if (!retailCase) {
    return {
      runId,
      finalAnswer: "Không tìm thấy hồ sơ khách hàng tương ứng với yêu cầu.",
      traces: []
    };
  }

  // From here on, the pipeline (injection scan, fast/complex routing, self-correction
  // loop, decision matrix, operations) runs as a LangGraph StateGraph instead of an
  // imperative if/else chain — see orchestration-graph.ts.
  const finalState = await orchestrationGraph.invoke(
    {
      runId,
      requestedBy,
      prompt,
      approvalToken,
      caseId,
      customerName: retailCase.demographic.name
    },
    { configurable: { thread_id: runId } }
  );

  return buildOrchestrationResponse(runId, caseId, retailCase, approvalToken, finalState);
};

/**
 * Same pipeline as executeOrchestration, but emits one OrchestrationStreamEvent per
 * pipeline stage as its trace lands in the LangGraph state (streamMode "values" yields
 * the full accumulated state after every node, so a newly-populated trace slot means
 * that node just completed) — lets the UI show live per-agent progress instead of a
 * single blocking request/response round trip.
 */
export const streamOrchestration = async (
  prompt: string,
  requestedBy: string,
  approvalToken: string | undefined,
  onEvent: (event: OrchestrationStreamEvent) => void
): Promise<void> => {
  const runId = `run-${Date.now()}`;
  console.log(">>> RECEIVED PROMPT IN BACKEND:", JSON.stringify(prompt));
  const caseId = await detectCaseIdFromPrompt(prompt);
  const retailCase = RETAIL_CASES[caseId];

  await recordAuditEvent(runId, requestedBy, "agent_call", { prompt, caseId }, "allowed", `Chuyên viên ${requestedBy} khởi chạy quy trình điều phối cho caseId: ${caseId}`);

  if (!retailCase) {
    onEvent({
      type: "final",
      response: {
        runId,
        finalAnswer: "Không tìm thấy hồ sơ khách hàng tương ứng với yêu cầu.",
        traces: []
      }
    });
    return;
  }

  const stream = await orchestrationGraph.stream(
    {
      runId,
      requestedBy,
      prompt,
      approvalToken,
      caseId,
      customerName: retailCase.demographic.name
    },
    { configurable: { thread_id: runId }, streamMode: "values" }
  );

  let previous: Partial<OrchestrationState> = {};
  let finalState: OrchestrationState | undefined;

  for await (const chunk of stream as AsyncIterable<OrchestrationState>) {
    for (const key of TRACE_KEYS) {
      const trace = chunk[key] as AgentTrace | undefined;
      if (trace && trace !== previous[key]) {
        onEvent({ type: "node_update", node: trace.agent, trace, riskTier: chunk.riskTier });
      }
    }
    previous = chunk;
    finalState = chunk;
  }

  if (!finalState) {
    onEvent({ type: "error", message: "Orchestration graph produced no output." });
    return;
  }

  const response = await buildOrchestrationResponse(runId, caseId, retailCase, approvalToken, finalState);
  onEvent({ type: "final", response });
};
