import OpenAI from "openai";
import { config } from "./env";

let client: OpenAI | null = null;

/**
 * FPT AI Marketplace (https://mkp-api.fptcloud.com) is OpenAI-API-compatible —
 * the standard `openai` SDK works unmodified with a custom `baseURL`.
 */
export const getFptMarketplaceClient = (): OpenAI => {
  if (!config.fptMarketplaceApiKey) {
    throw new Error(
      "FPT_MARKETPLACE_API_KEY is not configured. Refusing to call the FPT AI Marketplace API without a key."
    );
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.fptMarketplaceApiKey,
      baseURL: config.fptMarketplaceBaseUrl,
    });
  }
  return client;
};

/** Called once at server startup so a missing API key fails fast instead of on the first legal check. */
export const assertFptMarketplaceConfigured = (): void => {
  getFptMarketplaceClient();
};
