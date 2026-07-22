import { randomUUID } from "crypto";
import { pgQuery } from "../../config/pg";
import { AuthorizationContext } from "../../config/authorization";
import { getMailTransporter } from "../../config/mailer";
import { config } from "../../config/env";
import { getScopedDossier, transitionDossierStatus } from "./dossier.service";
import { recordAuditEvent } from "../governance/audit-log.service";
import { createNotification } from "../notifications/notification.service";
import { DossierReviewDecisionRecord, DossierStatus, LoanDossier, ReviewDecision } from "../../types/document-intake.types";
import { createLogger } from "../observability/logger";

const logger = createLogger("documents.review-decision");

const NEXT_STATUS: Record<ReviewDecision, DossierStatus> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  more_info: "NEEDS_MORE_INFO",
};

const DECISION_TITLE: Record<ReviewDecision, string> = {
  approved: "Hồ sơ vay của bạn đã được DUYỆT",
  rejected: "Hồ sơ vay của bạn bị TỪ CHỐI",
  more_info: "Hồ sơ vay cần bổ sung thông tin",
};

const buildDecisionBody = (decision: ReviewDecision, productTerms?: string, comment?: string): string => {
  const lines: string[] = [];
  if (decision === "approved") {
    lines.push("Chúc mừng! Hồ sơ vay của bạn đã được phê duyệt.");
    if (productTerms) lines.push(`Sản phẩm & điều khoản: ${productTerms}`);
  } else if (decision === "rejected") {
    lines.push("Rất tiếc, hồ sơ vay của bạn chưa được phê duyệt lần này.");
  } else {
    lines.push("Hồ sơ của bạn cần bổ sung thêm thông tin để tiếp tục xử lý.");
  }
  if (comment) lines.push(`Ghi chú của chuyên viên: ${comment}`);
  return lines.join(" ");
};

/** Best-effort customer notice (in-app + email) after a review decision — never fails the decision. */
const notifyCustomerOfDecision = async (
  dossier: LoanDossier,
  decision: ReviewDecision,
  productTerms?: string,
  comment?: string
): Promise<void> => {
  const body = buildDecisionBody(decision, productTerms, comment);
  await createNotification({
    tenantId: dossier.tenantId,
    recipientCustomerId: dossier.customerId,
    category: "REVIEW_DECISION",
    title: DECISION_TITLE[decision],
    body,
    dossierId: dossier.dossierId,
  });
  try {
    const transporter = getMailTransporter();
    await transporter.sendMail({
      from: `"${config.gmailSenderName}" <${config.gmailSmtpUser}>`,
      to: dossier.customerEmail,
      subject: `[SHB] ${DECISION_TITLE[decision]} (hồ sơ ${dossier.dossierId})`,
      text: `Kính gửi Quý khách,\n\n${body}\n\nTrân trọng,\n${config.gmailSenderName}`,
    });
  } catch (error) {
    logger.error("Review-decision email failed (non-fatal)", { error });
  }
};

/**
 * Task 6: the only place a dossier can ever reach APPROVED/REJECTED — always a named human actor,
 * never a transition any pipeline stage can trigger on its own (task constraint: no auto-approval).
 */
export const submitReviewDecision = async (
  context: AuthorizationContext,
  dossierId: string,
  decision: ReviewDecision,
  comment: string | undefined,
  productTerms?: string
): Promise<DossierReviewDecisionRecord> => {
  const tenantId = context.tenantId;
  const reviewer = context.userId;
  const reviewerRole = context.role;
  const dossier = await getScopedDossier(context, dossierId);
  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
  if (dossier.status !== "PENDING_REVIEW") throw new Error("DOSSIER_NOT_PENDING_REVIEW");

  if (reviewerRole !== "CREDIT_APPROVER") {
    const assignment = await pgQuery(`SELECT assigned_officer FROM dossier_review_assignments WHERE tenant_id=$1 AND dossier_id=$2`, [tenantId, dossierId]);
    const assignedOfficer = assignment.rows[0]?.assigned_officer;
    if (assignedOfficer && assignedOfficer !== reviewer) throw new Error("REVIEW_FORBIDDEN_NOT_ASSIGNED_OFFICER");
    if (!assignedOfficer) {
      await pgQuery(
        `INSERT INTO dossier_review_assignments (dossier_id,tenant_id,assigned_officer,assigned_at)
         VALUES ($1,$2,$3,NOW()) ON CONFLICT (dossier_id) DO NOTHING`,
        [dossierId, tenantId, reviewer]
      );
      const claimed = await pgQuery(
        `SELECT assigned_officer FROM dossier_review_assignments WHERE tenant_id=$1 AND dossier_id=$2`,
        [tenantId, dossierId]
      );
      if (claimed.rows[0]?.assigned_officer !== reviewer) throw new Error("REVIEW_FORBIDDEN_ASSIGNMENT_CLAIMED");
    }
  }

  const moved = await transitionDossierStatus(tenantId, dossierId, ["PENDING_REVIEW"], NEXT_STATUS[decision]);
  if (!moved) throw new Error("DOSSIER_NOT_PENDING_REVIEW");

  const normalizedProductTerms = decision === "approved" ? (productTerms?.trim() || null) : null;
  const id = randomUUID();
  const decidedAt = new Date().toISOString();
  await pgQuery(
    `INSERT INTO dossier_review_decisions (id,dossier_id,tenant_id,reviewer,decision,comment,product_terms,decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, dossierId, tenantId, reviewer, decision, comment ?? null, normalizedProductTerms, decidedAt]
  );

  await recordAuditEvent(
    dossierId,
    reviewer,
    "human_approval",
    { decision, comment, productTerms: normalizedProductTerms },
    "allowed",
    `user_id=${reviewer}; role=${context.role}; action=${decision.toUpperCase()}; dossier_id=${dossierId}; Quyết định hồ sơ đã được ghi nhận.`
  );

  // Tell the customer in-app + by email (best-effort — never blocks the decision).
  await notifyCustomerOfDecision(dossier, decision, normalizedProductTerms ?? undefined, comment);

  return { id, dossierId, tenantId, reviewer, decision, comment: comment ?? null, productTerms: normalizedProductTerms, decidedAt };
};

export const listReviewDecisions = async (tenantId: string, dossierId: string): Promise<DossierReviewDecisionRecord[]> => {
  const result = await pgQuery(`SELECT * FROM dossier_review_decisions WHERE tenant_id=$1 AND dossier_id=$2 ORDER BY decided_at DESC`, [tenantId, dossierId]);
  return result.rows.map((row: any) => ({
    id: row.id, dossierId: row.dossier_id, tenantId: row.tenant_id, reviewer: row.reviewer,
    decision: row.decision, comment: row.comment, productTerms: row.product_terms ?? null, decidedAt: row.decided_at,
  }));
};
