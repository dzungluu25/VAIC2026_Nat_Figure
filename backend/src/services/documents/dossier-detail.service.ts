import { pgQuery } from "../../config/pg";
import { AuthorizationContext } from "../../config/authorization";
import { getAllDossierDocuments, getLatestCicReport, getScopedDossier, toCustomerDossierSummary } from "./dossier.service";
import { getLatestOcrResult } from "./ocr-extraction.service";
import { getLatestFormRejectReason } from "./form-validation.service";
import { getChecklistVersion } from "./document-checklist.service";
import { evaluateDossierCompleteness } from "./checklist-completeness.service";
import { listReviewDecisions } from "./review-decision.service";
import { CustomerDossierDetail, CustomerDossierDocument, DossierDocument, LoanDossier, OcrExtractionResult } from "../../types/document-intake.types";

export interface DossierDocumentWithOcr extends DossierDocument {
  ocrResult: OcrExtractionResult | null;
  formRejectReason: string | null;
}

const rejectReasonFor = (tenantId: string, document: DossierDocument): Promise<string | null> =>
  document.status === "FORM_REJECTED" ? getLatestFormRejectReason(tenantId, document.documentId) : Promise.resolve(null);

/**
 * Customer-safe view: their own dossier status, the checklist gap, and the status of each file they
 * submitted (incl. the wrong-template reason) — but never scoring, CIC or internal review data. This
 * is everything the customer needs to self-complete the dossier and nothing more.
 */
const getCustomerDossierDetail = async (
  context: AuthorizationContext,
  dossierId: string,
  dossier: LoanDossier
): Promise<CustomerDossierDetail> => {
  const tenantId = context.tenantId;
  const checklist = await getChecklistVersion(tenantId, dossier.loanType, dossier.checklistVersion);
  const nameByType = new Map(checklist?.items.map(item => [item.documentType, item.displayName]) ?? []);

  const documents = await getAllDossierDocuments(tenantId, dossierId);
  const customerDocuments: CustomerDossierDocument[] = await Promise.all(
    documents.map(async document => ({
      documentType: document.documentType,
      displayName: nameByType.get(document.documentType) ?? document.documentType,
      status: document.status,
      originalFilename: document.originalFilename,
      uploadedAt: document.uploadedAt,
      formRejectReason: await rejectReasonFor(tenantId, document),
    }))
  );

  const completeness = await evaluateDossierCompleteness(tenantId, dossierId);
  const approved = await pgQuery(
    `SELECT product_terms FROM dossier_review_decisions WHERE tenant_id=$1 AND dossier_id=$2 AND decision='approved' ORDER BY decided_at DESC LIMIT 1`,
    [tenantId, dossierId]
  );
  return {
    isCustomerView: true,
    dossier: toCustomerDossierSummary(dossier),
    loanType: dossier.loanType,
    completeness,
    documents: customerDocuments,
    approvedProduct: approved.rows[0]?.product_terms ?? null,
  };
};

/** Task 6 detail view: every document (full upload history, not just latest-per-type) with its OCR fields, the checklist gap, preliminary score, and who it's assigned to — everything a reviewer needs on one screen. */
export const getDossierDetail = async (context: AuthorizationContext, dossierId: string) => {
  const dossier = await getScopedDossier(context, dossierId);
  if (!dossier) return null;

  // Customer branch is fully self-contained — no scoring/CIC/review query runs for a customer.
  if (context.role === "CUSTOMER") return getCustomerDossierDetail(context, dossierId, dossier);

  const tenantId = context.tenantId;

  const documents = await getAllDossierDocuments(tenantId, dossierId);
  const documentsWithOcr: DossierDocumentWithOcr[] = await Promise.all(
    documents.map(async document => ({
      ...document,
      ocrResult: await getLatestOcrResult(tenantId, document.documentId),
      formRejectReason: await rejectReasonFor(tenantId, document),
    }))
  );

  const completeness = await evaluateDossierCompleteness(tenantId, dossierId);
  const cicReport = await getLatestCicReport(tenantId, dossierId);

  const scoring = await pgQuery(`SELECT status,score_result,scored_at FROM scoring_queue WHERE tenant_id=$1 AND dossier_id=$2`, [tenantId, dossierId]);
  const assignment = await pgQuery(`SELECT assigned_officer,assigned_at FROM dossier_review_assignments WHERE tenant_id=$1 AND dossier_id=$2`, [tenantId, dossierId]);
  const decisions = await listReviewDecisions(tenantId, dossierId);

  return {
    dossier,
    documents: documentsWithOcr,
    completeness,
    cicReport,
    scoring: scoring.rows[0] ?? null,
    assignedOfficer: assignment.rows[0]?.assigned_officer ?? null,
    assignedAt: assignment.rows[0]?.assigned_at ?? null,
    reviewDecisions: decisions,
  };
};
