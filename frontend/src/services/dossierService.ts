import { apiFetch, apiFetchMultipart } from "./httpClient";
import type { AuditEvent } from "../types/api";
import type { CustomerDossierSummary, DossierCicReport, DossierDetail, DossierDocumentWithOcr, DossierReviewDecisionRecord, DossierStatus, LoanDossier, LoanType, ReviewDecision } from "../types/document-intake";

export interface ListDossiersFilter {
  status?: DossierStatus;
  loanType?: LoanType;
  assignedToMe?: boolean;
}

const toQueryString = (filter: ListDossiersFilter): string => {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.loanType) params.set("loanType", filter.loanType);
  if (filter.assignedToMe) params.set("assignedTo", "me");
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const listDossiers = (token: string, filter: ListDossiersFilter): Promise<{ dossiers: Array<LoanDossier | CustomerDossierSummary> }> =>
  apiFetch(`/api/dossiers${toQueryString(filter)}`, { token });

export const getDossierDetail = (token: string, dossierId: string): Promise<DossierDetail> =>
  apiFetch(`/api/dossiers/${dossierId}`, { token });

export interface CicReportFormInput {
  creditScore: string;
  totalOutstandingDebt: string;
  debtGroup: string;
  reportDate: string;
  notes?: string;
  file?: File;
}

export interface DocumentUploadFormInput {
  documentType: string;
  file: File;
}

type UploadedDossierDocument = Omit<DossierDocumentWithOcr, "ocrResult">;

export interface DocumentUploadResponse {
  dossier: LoanDossier;
  document: UploadedDossierDocument;
  checklistItem: { documentType: string; displayName: string };
  formResult: { passed: boolean; reason?: string };
  ocrResult: DossierDocumentWithOcr["ocrResult"];
}

/** Customer/officer upload - this path triggers form validation and OCR. */
export const uploadDossierDocument = (
  token: string,
  dossierId: string,
  input: DocumentUploadFormInput
): Promise<DocumentUploadResponse> => {
  const formData = new FormData();
  formData.set("documentType", input.documentType);
  formData.set("file", input.file);
  return apiFetchMultipart(`/api/dossiers/${dossierId}/documents`, formData, token);
};

/** Staff-only — separate endpoint from document upload, no document_type, never OCR'd. */
export const submitCicReport = (token: string, dossierId: string, input: CicReportFormInput): Promise<DossierCicReport> => {
  const formData = new FormData();
  formData.set("creditScore", input.creditScore);
  formData.set("totalOutstandingDebt", input.totalOutstandingDebt);
  formData.set("debtGroup", input.debtGroup);
  formData.set("reportDate", input.reportDate);
  if (input.notes) formData.set("notes", input.notes);
  if (input.file) formData.set("file", input.file);
  return apiFetchMultipart(`/api/dossiers/${dossierId}/cic-report`, formData, token);
};

export const submitReviewDecision = (
  token: string,
  dossierId: string,
  decision: ReviewDecision,
  comment: string | undefined
): Promise<DossierReviewDecisionRecord> =>
  apiFetch(`/api/dossiers/${dossierId}/review-decision`, { method: "POST", token, body: { decision, comment } });

export const reassignDossier = (
  token: string,
  dossierId: string,
  targetOfficerId: string
): Promise<{ dossierId: string; assignedOfficer: string; assignedAt: string }> =>
  apiFetch(`/api/dossiers/${dossierId}/reassign`, { method: "POST", token, body: { targetOfficerId } });

export const getDossierAudit = (token: string, dossierId: string): Promise<{ events: AuditEvent[] }> =>
  apiFetch<{ events: AuditEvent[] }>(`/api/dossiers/${encodeURIComponent(dossierId)}/audit`, { token });
