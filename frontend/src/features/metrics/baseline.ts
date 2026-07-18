/**
 * Illustrative single-agent chatbot baseline — NOT a live measurement (there's no second
 * system running side-by-side to measure). One direct LLM completion, no tool-calling, no
 * grounding, no audit trail. Kept clearly labeled as an estimate everywhere it's rendered,
 * same principle as flagging the old hardcoded 59.6% DTI: never present a fabricated number
 * as if it were measured.
 */
export const SINGLE_AGENT_BASELINE = {
  durationMs: 4200,
  agentStepCount: 1,
  toolCallCount: 0,
  modelCallsUsed: 1,
  auditability: "Không có nhật ký kiểm toán",
  grounding: "Không tra cứu dữ liệu thực (Neo4j/CIC) — chỉ dựa trên tham số huấn luyện của mô hình",
} as const;
