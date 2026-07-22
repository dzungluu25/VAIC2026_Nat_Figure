import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { config } from "./env";
import { getFptMarketplaceClient } from "./fpt-marketplace";
import { createLogger } from "../services/observability/logger";

const logger = createLogger("config.ai-model-router");

export type AiTask =
  | "intent"
  | "extraction"
  | "draft-extraction"
  | "advisory"
  | "planning"
  | "legal"
  | "quality-check";

interface AiModelProfile {
  primaryModel: string;
  fallbackModel?: string;
  maxOutputTokens: number;
}

class AiCompletionTimeoutError extends Error {
  constructor(task: AiTask, model: string, timeoutMs: number) {
    super(`${task} model ${model} timed out after ${timeoutMs}ms.`);
    this.name = "AiCompletionTimeoutError";
  }
}

/**
 * One routing policy for every generative-AI request.
 *
 * Fast language tasks use the flash model, MCP planning uses the dedicated
 * planner, and governed legal/final-review tasks use the strongest model.
 * Environment variables can still override the three model roles without
 * requiring service-level code changes.
 */
export const AI_MODEL_PROFILES: Readonly<Record<AiTask, AiModelProfile>> = {
  intent: {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 256,
  },
  extraction: {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 4_096,
  },
  "draft-extraction": {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 4_096,
  },
  advisory: {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 1_500,
  },
  planning: {
    primaryModel: config.fptPlannerModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 2_048,
  },
  legal: {
    primaryModel: config.fptLegalModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 4_096,
  },
  "quality-check": {
    primaryModel: config.fptLegalModel,
    fallbackModel: config.fptFallbackModel,
    maxOutputTokens: 1_500,
  },
};

type RoutedCompletionRequest = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "model" | "max_tokens" | "stream"
>;

const runCompletionWithTimeout = async (
  task: AiTask,
  model: string,
  request: RoutedCompletionRequest,
  maxOutputTokens: number
): Promise<ChatCompletion> => {
  const client = getFptMarketplaceClient();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutMs = (task === "intent" || task === "draft-extraction")
    ? config.llmInteractiveTimeoutMs
    : config.llmRequestTimeoutMs;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AiCompletionTimeoutError(task, model, timeoutMs));
    }, timeoutMs);
  });

  const completionPromise = client.chat.completions.create(
    {
      ...request,
      model,
      max_tokens: maxOutputTokens,
    },
    {
      timeout: timeoutMs,
      signal: controller.signal,
    }
  );
  completionPromise.catch(() => undefined);

  try {
    return await Promise.race([completionPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const createAiCompletion = async (
  task: AiTask,
  request: RoutedCompletionRequest
): Promise<ChatCompletion> => {
  const profile = AI_MODEL_PROFILES[task];

  try {
    return await runCompletionWithTimeout(task, profile.primaryModel, request, profile.maxOutputTokens);
  } catch (primaryError) {
    if (!profile.fallbackModel || profile.fallbackModel === profile.primaryModel) throw primaryError;
    logger.warn("Primary model failed; retrying with fallback", {
      task,
      primaryModel: profile.primaryModel,
      fallbackModel: profile.fallbackModel,
      error: primaryError,
    });
    return runCompletionWithTimeout(task, profile.fallbackModel, request, profile.maxOutputTokens);
  }
};
