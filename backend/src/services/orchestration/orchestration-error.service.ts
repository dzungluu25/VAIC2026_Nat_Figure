export interface PublicOrchestrationError {
  code: "ORCHESTRATION_TIMEOUT" | "DEPENDENCY_UNAVAILABLE" | "INTERNAL_ERROR";
  message: string;
  httpStatus: 500 | 503 | 504;
}

const dependencyErrorCodes = new Set([
  "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN",
  "08000", "08001", "08003", "08006", "57P01", "57P02", "57P03",
]);

const errorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === "string") return candidate.code;
  return candidate.cause === error ? undefined : errorCode(candidate.cause);
};

export const toPublicOrchestrationError = (error: unknown): PublicOrchestrationError => {
  const code = errorCode(error);
  const name = error instanceof Error ? error.name : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (name === "TimeoutError" || name === "AbortError" || code === "ABORT_ERR") {
    return {
      code: "ORCHESTRATION_TIMEOUT",
      message: "Quá trình thẩm định vượt quá thời gian cho phép. Vui lòng thử lại; chưa có hành động nghiệp vụ nào được thực hiện.",
      httpStatus: 504,
    };
  }

  if (code && dependencyErrorCodes.has(code)) {
    return {
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Dịch vụ dữ liệu đang tạm thời không khả dụng. Vui lòng kiểm tra kết nối PostgreSQL/Supabase và thử lại.",
      httpStatus: 503,
    };
  }

  // Known business-logic errors — surface the real message instead of a generic one
  const knownBusinessErrors: Record<string, string> = {
    INTERRUPTED_WITHOUT_APPROVAL_RECORD: "Workflow bị gián đoạn: không tìm thấy bản ghi phê duyệt tương ứng. Vui lòng thử lại hoặc kiểm tra trạng thái approval gate.",
    MARITAL_STATUS_INVALID: "Trạng thái hôn nhân không hợp lệ trong hồ sơ trích xuất.",
  };

  for (const [key, friendlyMsg] of Object.entries(knownBusinessErrors)) {
    if (message.includes(key)) {
      return { code: "INTERNAL_ERROR", message: friendlyMsg, httpStatus: 500 };
    }
  }

  return {
    code: "INTERNAL_ERROR",
    message: `Lỗi hệ thống: ${message}`,
    httpStatus: 500,
  };
};
