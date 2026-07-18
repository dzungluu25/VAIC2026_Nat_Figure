import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { config } from "./env";
import { getFptMarketplaceClient } from "./fpt-marketplace";

export type AiTask =
  | "intent"
  | "extraction"
  | "advisory"
  | "planning"
  | "legal"
  | "quality-check";

interface AiModelProfile {
  primaryModel: string;
  fallbackModel?: string;
  maxOutputTokens: number;
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
    fallbackModel: config.fptLegalModel,
    maxOutputTokens: 256,
  },
  extraction: {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptLegalModel,
    maxOutputTokens: 4_096,
  },
  advisory: {
    primaryModel: config.fptExtractionModel,
    fallbackModel: config.fptLegalModel,
    maxOutputTokens: 1_500,
  },
  planning: {
    primaryModel: config.fptPlannerModel,
    fallbackModel: config.fptLegalModel,
    maxOutputTokens: 2_048,
  },
  legal: {
    primaryModel: config.fptLegalModel,
    maxOutputTokens: 4_096,
  },
  "quality-check": {
    primaryModel: config.fptLegalModel,
    maxOutputTokens: 1_500,
  },
};

type RoutedCompletionRequest = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "model" | "max_tokens" | "stream"
>;

export const createAiCompletion = async (
  task: AiTask,
  request: RoutedCompletionRequest
): Promise<ChatCompletion> => {
  const client = getFptMarketplaceClient();
  const profile = AI_MODEL_PROFILES[task];

  try {
    return await client.chat.completions.create({
      ...request,
      model: profile.primaryModel,
      max_tokens: profile.maxOutputTokens,
    });
  } catch (primaryError) {
    if (!profile.fallbackModel || profile.fallbackModel === profile.primaryModel) throw primaryError;
    console.warn(
      `[AI router] ${task} model ${profile.primaryModel} failed; retrying with ${profile.fallbackModel}.`,
      primaryError
    );
    return client.chat.completions.create({
      ...request,
      model: profile.fallbackModel,
      max_tokens: profile.maxOutputTokens,
    });
  }
};
