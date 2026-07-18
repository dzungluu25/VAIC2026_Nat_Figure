export type LlmProviderErrorCode =
  | "MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED"
  | "LLM_PROVIDER_ERROR";

export interface NormalizedLlmProviderError {
  code: LlmProviderErrorCode;
  status?: number;
  requestId?: string;
  model?: string;
  message: string;
  rawMessage: string;
}

interface NormalizeOptions {
  model?: string;
  operation?: string;
}

const headerValue = (headers: unknown, name: string): string | undefined => {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get: (key: string) => string | null }).get(name) ?? undefined;
  }
  const record = headers as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
};

export const normalizeLlmProviderError = (
  error: unknown,
  options: NormalizeOptions = {}
): NormalizedLlmProviderError => {
  const value = error as {
    status?: unknown;
    requestID?: unknown;
    requestId?: unknown;
    headers?: unknown;
    message?: unknown;
  } | null;
  const rawMessage = error instanceof Error
    ? error.message
    : typeof value?.message === "string"
      ? value.message
      : String(error ?? "unknown provider error");
  const status = typeof value?.status === "number" ? value.status : undefined;
  const requestId =
    (typeof value?.requestID === "string" ? value.requestID : undefined) ??
    (typeof value?.requestId === "string" ? value.requestId : undefined) ??
    headerValue(value?.headers, "x-request-id");
  const model = headerValue(value?.headers, "x-model") ?? options.model;
  const isRejectedToolPayload =
    status === 400 ||
    /400 status code \(no body\)|status code 400|HTTP 400|badrequest/i.test(rawMessage);
  const code: LlmProviderErrorCode = isRejectedToolPayload
    ? "MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED"
    : "LLM_PROVIDER_ERROR";
  const operation = options.operation ? `${options.operation}: ` : "";
  const message = code === "MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED"
    ? `${operation}model provider rejected the tool-calling request${model ? ` for ${model}` : ""}${requestId ? ` (request ${requestId})` : ""}.`
    : `${operation}${rawMessage}${requestId ? ` (request ${requestId})` : ""}.`;

  return { code, status, requestId, model, message, rawMessage };
};

export const isToolCallRejectedByProvider = (error: NormalizedLlmProviderError): boolean =>
  error.code === "MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED";
