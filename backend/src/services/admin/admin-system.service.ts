import { pgQuery } from "../../config/pg";
import { neo4jDriver } from "../../config/neo4j";
import { config } from "../../config/env";
import { documentStorageDriver } from "../../config/document-storage";
import { policyMetadata } from "../../config/policy";

export interface HealthEntry {
  name: string;
  status: "ok" | "degraded" | "error" | "not_configured";
  detail: string;
}

const timed = async (name: string, probe: () => Promise<string>): Promise<HealthEntry> => {
  try {
    return { name, status: "ok", detail: await probe() };
  } catch (error) {
    return { name, status: "error", detail: error instanceof Error ? error.message : "unknown error" };
  }
};

const checkPostgres = (): Promise<HealthEntry> =>
  timed("PostgreSQL", async () => {
    await pgQuery("SELECT 1");
    return "Kết nối OK";
  });

const checkNeo4j = (): Promise<HealthEntry> =>
  timed("Neo4j (GraphRAG)", async () => {
    const session = neo4jDriver.session();
    try {
      await session.run("RETURN 1 AS ok");
      return "Kết nối OK";
    } finally {
      await session.close();
    }
  });

const mailerHealth = (): HealthEntry => {
  const configured = Boolean(config.gmailSmtpUser && config.gmailSmtpAppPassword);
  return {
    name: "Mailer (SMTP)",
    status: configured ? "ok" : "not_configured",
    detail: configured ? `Gửi từ ${config.gmailSmtpUser}` : "Chưa cấu hình SMTP — email thông báo sẽ không gửi được.",
  };
};

const storageHealth = (): HealthEntry => {
  const driver = documentStorageDriver();
  return {
    name: "Document storage",
    status: driver === "supabase" ? "ok" : "degraded",
    detail: driver === "supabase" ? "Supabase Storage (cloud)" : "Lưu file local (dev) — chưa dùng cloud storage.",
  };
};

const llmHealth = (): HealthEntry => {
  const configured = Boolean(config.fptMarketplaceApiKey);
  return {
    name: "LLM provider",
    status: configured ? "ok" : "not_configured",
    detail: configured
      ? `${config.fptMarketplaceBaseUrl} · legal=${config.fptLegalModel}, planner=${config.fptPlannerModel}`
      : "Chưa cấu hình API key — agent LLM sẽ chạy fallback deterministic.",
  };
};

// Static registry of the platform's AI agents and backend tools, annotated with live config status.
const buildToolRegistry = () => {
  const llmReady = Boolean(config.fptMarketplaceApiKey);
  const agents = [
    { key: "planner", label: "Planner", kind: "agent", status: llmReady ? "ok" : "degraded", note: "Chọn Fast/Complex lane" },
    { key: "profile", label: "Profile", kind: "agent", status: "ok", note: "Xác minh hồ sơ khách" },
    { key: "credit", label: "Credit", kind: "agent", status: "ok", note: "DTI/LTV/EMI (rule engine)" },
    { key: "product", label: "Product", kind: "agent", status: "ok", note: "So khớp sản phẩm vay" },
    { key: "legal", label: "Legal", kind: "agent", status: llmReady ? "ok" : "degraded", note: "GraphRAG + citation governance" },
    { key: "legal_audit", label: "Legal audit", kind: "agent", status: "ok", note: "Soát citation" },
    { key: "risk", label: "Risk/Fraud", kind: "agent", status: "ok", note: "Phát hiện bất thường" },
  ];
  const tools = [
    { key: "ocr", label: "OCR (Tesseract)", kind: "tool", status: "ok", note: `Ngôn ngữ ${config.ocrLanguages}` },
    { key: "docx", label: "Đọc .docx", kind: "tool", status: "ok", note: "Trích text native cho mau_don" },
    { key: "storage", label: "Document storage", kind: "tool", status: documentStorageDriver() === "supabase" ? "ok" : "degraded", note: documentStorageDriver() },
    { key: "scoring", label: "Credit scoring service", kind: "tool", status: "ok", note: "PyTorch PD/LGD (DEMO_ONLY)" },
    { key: "notification", label: "In-app notification", kind: "tool", status: "ok", note: "Bảng notifications" },
    { key: "email", label: "Email notifier", kind: "tool", status: config.gmailSmtpUser ? "ok" : "degraded", note: config.gmailSmtpUser ? "SMTP cấu hình" : "SMTP chưa cấu hình" },
  ];
  return [...agents, ...tools];
};

const countBy = async (sql: string, params: unknown[]): Promise<Record<string, number>> => {
  const result = await pgQuery(sql, params);
  return Object.fromEntries(result.rows.map((row: any) => [row.k, Number(row.c)]));
};

export const getAdminSystemOverview = async (tenantId: string) => {
  const [postgres, neo4j] = await Promise.all([checkPostgres(), checkNeo4j()]);
  const health: HealthEntry[] = [postgres, neo4j, mailerHealth(), storageHealth(), llmHealth()];

  const dossiersByStatus = await countBy(
    "SELECT status AS k, COUNT(*) AS c FROM loan_dossiers WHERE tenant_id=$1 GROUP BY status",
    [tenantId]
  );
  const noticesByStatus = await countBy(
    "SELECT status AS k, COUNT(*) AS c FROM dossier_missing_document_notices WHERE tenant_id=$1 GROUP BY status",
    [tenantId]
  );
  const scalar = async (sql: string, params: unknown[]): Promise<number> => Number((await pgQuery(sql, params)).rows[0]?.c ?? 0);

  const stats = {
    dossiersByStatus,
    totalDossiers: Object.values(dossiersByStatus).reduce((sum, n) => sum + n, 0),
    runs: await scalar("SELECT COUNT(*) AS c FROM orchestration_runs WHERE tenant_id=$1", [tenantId]),
    notificationsSent: await scalar("SELECT COUNT(*) AS c FROM notifications WHERE tenant_id=$1", [tenantId]),
    emailsSent: noticesByStatus.sent ?? 0,
    emailsFailed: noticesByStatus.failed ?? 0,
    formRejections: await scalar("SELECT COUNT(*) AS c FROM document_form_validation_log WHERE tenant_id=$1 AND passed=false", [tenantId]),
  };

  return {
    generatedAt: new Date().toISOString(),
    health,
    tools: buildToolRegistry(),
    versions: policyMetadata,
    stats,
  };
};
