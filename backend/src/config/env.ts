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
  demoCustomerPassword: process.env.DEMO_CUSTOMER_PASSWORD || "",
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD || "",
  demoAuditorPassword: process.env.DEMO_AUDITOR_PASSWORD || "",
  publicDemoSession: process.env.ENABLE_PUBLIC_DEMO_SESSION === "true" || (process.env.NODE_ENV || "development") !== "production",
  fptMarketplaceApiKey: process.env.LEGAL_LLM_API_KEY || process.env.FPT_MARKETPLACE_API_KEY || "",
  fptMarketplaceBaseUrl: process.env.LEGAL_LLM_BASE_URL || process.env.FPT_MARKETPLACE_BASE_URL || "https://mkp-api.fptcloud.com",
  fptLegalModel: process.env.LEGAL_LLM_MODEL || process.env.FPT_LEGAL_MODEL || "GLM-5.1",
  fptPlannerModel: process.env.PLANNER_LLM_MODEL || process.env.FPT_PLANNER_MODEL || "gpt-oss-20b",
  fptExtractionModel: process.env.EXTRACTION_LLM_MODEL || process.env.FPT_EXTRACTION_MODEL || "Qwen3-Coder-480B-A35B-Instruct",
  ocrLanguages: process.env.OCR_LANGUAGES || "vie+eng",
  ocrPdfDpi: Math.max(100, Math.min(400, Number(process.env.OCR_PDF_DPI) || 200)),
  ocrMaxPdfPages: Math.max(1, Math.min(50, Number(process.env.OCR_MAX_PDF_PAGES) || 10)),
  tesseractCommand: process.env.TESSERACT_COMMAND || "tesseract",
  pdftoppmCommand: process.env.PDFTOPPM_COMMAND || "pdftoppm",
  gmailSmtpUser: process.env.GMAIL_SMTP_USER || "",
  gmailSmtpAppPassword: process.env.GMAIL_SMTP_APP_PASSWORD || "",
  gmailSenderName: process.env.GMAIL_SENDER_NAME || "SHB VAIC Credit Ops",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "loan-documents",
};
