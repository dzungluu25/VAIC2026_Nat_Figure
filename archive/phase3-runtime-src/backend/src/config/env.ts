import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  llmEnabled: process.env.LLM_ENABLED === "true",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmBaseUrl: process.env.LLM_BASE_URL || "",
  llmModel: process.env.LLM_MODEL || "gemma-3-27b-it",
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
  llmMaxRetries: Number(process.env.LLM_MAX_RETRIES || 2),
  llmCircuitBreakerThreshold: Number(process.env.LLM_CIRCUIT_BREAKER_THRESHOLD || 3),
  llmCircuitBreakerCooldownMs: Number(process.env.LLM_CIRCUIT_BREAKER_COOLDOWN_MS || 60000),
  approvalApiToken: process.env.APPROVAL_API_TOKEN || "demo-approval-token",
  approvalJwtSecret: process.env.APPROVAL_JWT_SECRET || "demo-approval-jwt-secret",
  approvalJwtAudience: process.env.APPROVAL_JWT_AUDIENCE || "vaic-retail-approval",
  approvalJwtIssuer: process.env.APPROVAL_JWT_ISSUER || "vaic-demo-auth",
  approvalJwksUrl: process.env.APPROVAL_JWKS_URL || "",
  approvalJwksJson: process.env.APPROVAL_JWKS_JSON || "",
  allowLocalHs256Jwt: process.env.ALLOW_LOCAL_HS256_JWT === "true" || process.env.NODE_ENV !== "production",
  documentIngestionProvider: process.env.DOCUMENT_INGESTION_PROVIDER || "fixture-json",
  documentIngestionEndpoint: process.env.DOCUMENT_INGESTION_ENDPOINT || "",
  ragProvider: process.env.RAG_PROVIDER || "local-rule-pack",
  vectorRetrievalUrl: process.env.VECTOR_RETRIEVAL_URL || "",
  workflowStateBackend: process.env.WORKFLOW_STATE_BACKEND || "file-snapshot-event-log",
  messageBrokerUrl: process.env.MESSAGE_BROKER_URL || "",
  workflowQueueRequired: process.env.WORKFLOW_QUEUE_REQUIRED === "true",
  enableLegacyMockRoutes: process.env.ENABLE_LEGACY_MOCK_ROUTES === "true",
};
