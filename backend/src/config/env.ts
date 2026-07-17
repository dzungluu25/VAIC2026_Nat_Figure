import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
  authJwtSecret: process.env.AUTH_JWT_SECRET || "",
  demoOfficerPassword: process.env.DEMO_OFFICER_PASSWORD || "",
  demoApproverPassword: process.env.DEMO_APPROVER_PASSWORD || "",
  fptMarketplaceApiKey: process.env.FPT_MARKETPLACE_API_KEY || "",
  fptMarketplaceBaseUrl: process.env.FPT_MARKETPLACE_BASE_URL || "https://mkp-api.fptcloud.com",
  fptLegalModel: process.env.FPT_LEGAL_MODEL || "gpt-oss-120b",
};
