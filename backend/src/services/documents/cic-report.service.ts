import { randomUUID } from "crypto";
import { pgQuery } from "../../config/pg";
import { uploadDossierDocument } from "../../config/document-storage";
import { AuthorizationContext } from "../../config/authorization";
import { getScopedDossier } from "./dossier.service";
import { recomputeDossierAfterDocumentChange } from "./checklist-completeness.service";
import { recordAuditEvent } from "../governance/audit-log.service";
import { DossierCicReport } from "../../types/document-intake.types";

const TERMINAL_DOSSIER_STATUSES = new Set(["APPROVED", "REJECTED"]);
const sanitizeFilename = (name: string): string => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);

export interface CicReportInput {
  creditScore: string;
  totalOutstandingDebt: string;
  debtGroup: string;
  reportDate: string;
  notes?: string;
  file?: { buffer: Buffer; originalFilename: string; mimeType: string };
}

/**
 * The ONLY way CIC data ever enters a dossier. Deliberately does not touch document-upload.service.ts,
 * document-pipeline.service.ts, form-validation.service.ts or ocr-extraction.service.ts — no OCR call
 * is made here at all. `actor` is always a CREDIT_OFFICER/CREDIT_APPROVER (route-level requireAuth),
 * so uploadedByRole='STAFF' is asserted directly rather than inferred.
 */
export const submitCicReport = async (context: AuthorizationContext, dossierId: string, input: CicReportInput): Promise<DossierCicReport> => {
  const tenantId = context.tenantId;
  const actor = context.userId;
  const dossier = await getScopedDossier(context, dossierId);
  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
  if (TERMINAL_DOSSIER_STATUSES.has(dossier.status)) throw new Error("DOSSIER_ALREADY_FINALIZED");

  const id = randomUUID();
  let storagePath: string | null = null;
  let originalFilename: string | null = null;
  if (input.file) {
    storagePath = `${tenantId}/${dossierId}/cic/${id}-${sanitizeFilename(input.file.originalFilename)}`;
    await uploadDossierDocument(storagePath, input.file.buffer, input.file.mimeType);
    originalFilename = input.file.originalFilename;
  }

  const uploadedAt = new Date().toISOString();
  await pgQuery(
    `INSERT INTO dossier_cic_reports (id,dossier_id,tenant_id,storage_path,original_filename,credit_score,total_outstanding_debt,debt_group,report_date,notes,uploaded_by_role,uploaded_by,uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'STAFF',$11,$12)`,
    [id, dossierId, tenantId, storagePath, originalFilename, input.creditScore, input.totalOutstandingDebt, input.debtGroup, input.reportDate, input.notes ?? null, actor, uploadedAt]
  );

  await recordAuditEvent(
    dossierId, actor, "tool_call",
    { cicReportId: id, creditScore: input.creditScore, debtGroup: input.debtGroup },
    "allowed",
    `user_id=${actor}; role=${context.role}; action=CIC_UPLOAD; dossier_id=${dossierId}; Chuyên viên đã tự nhập/xác minh CIC (không qua OCR).`
  );

  // Symmetric with document-upload.service.ts: every write that can change completeness re-evaluates
  // immediately, so a dossier stuck at PENDING_CIC advances the moment CIC is filed.
  await recomputeDossierAfterDocumentChange(tenantId, dossierId, actor);

  return { id, dossierId, tenantId, storagePath, originalFilename, creditScore: input.creditScore, totalOutstandingDebt: input.totalOutstandingDebt, debtGroup: input.debtGroup, reportDate: input.reportDate, notes: input.notes ?? null, uploadedByRole: "STAFF", uploadedBy: actor, uploadedAt };
};
