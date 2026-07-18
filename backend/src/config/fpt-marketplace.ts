import OpenAI from "openai";
import { config } from "./env";

let client: OpenAI | null = null;

/** FPT Marketplace and reviewed private deployments expose an OpenAI-compatible API. */
export const getFptMarketplaceClient = (): OpenAI => {
  if (!config.fptMarketplaceApiKey) {
    throw new Error(
      "LEGAL_LLM_API_KEY/FPT_MARKETPLACE_API_KEY is not configured. Refusing to call the legal LLM endpoint without a key."
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
