export type LoanType = "unsecured" | "mortgage";

export type DossierStatus =
  | "COLLECTING"
  | "INCOMPLETE"
  | "COMPLETE"
  | "QUEUED_FOR_SCORING"
  | "SCORED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_MORE_INFO"
  | "PENDING_CIC";

export type DocumentStatus =
  | "UPLOADED"
  | "FORM_REJECTED"
  | "FORM_ACCEPTED"
  | "OCR_PENDING"
  | "OCR_NEEDS_REVIEW"
  | "OCR_COMPLETE"
  | "OCR_FAILED";

export type ReviewDecision = "approved" | "rejected" | "more_info";

export interface LoanDossier {
  dossierId: string;
  tenantId: string;
  customerId: string;
  customerEmail: string;
  branchId: string | null;
  teamId: string | null;
  caseId: string | null;
  runId?: string | null;
  loanType: LoanType;
  checklistVersion: string;
  status: DossierStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomerDossierStatus = "DANG_XU_LY" | "THIEU_GIAY_TO" | "CHO_DUYET" | "DA_DUYET" | "TU_CHOI";

export interface CustomerDossierSummary {
  dossierId: string;
  status: CustomerDossierStatus;
  statusLabel: string;
}

export interface OcrExtractionResult {
  id: string;
  documentId: string;
  extractedFields: Record<string, string>;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
  missingRequiredFields: string[];
  engine: string;
  createdAt: string;
}

export interface DossierDocumentWithOcr {
  documentId: string;
  dossierId: string;
  documentType: string;
  storagePath: string;
  originalFilename: string;
  uploadedBy: string;
  uploadedAt: string;
  status: DocumentStatus;
  ocrResult: OcrExtractionResult | null;
}

export interface DossierCompletenessResult {
  complete: boolean;
  missingDocumentTypes: Array<{ documentType: string; displayName: string }>;
}

export interface DossierCicReport {
  id: string;
  dossierId: string;
  storagePath: string | null;
  originalFilename: string | null;
  creditScore: string;
  totalOutstandingDebt: string;
  debtGroup: string;
  reportDate: string;
  notes: string | null;
  uploadedByRole: "STAFF";
  uploadedBy: string;
  uploadedAt: string;
}

export interface DossierReviewDecisionRecord {
  id: string;
  dossierId: string;
  reviewer: string;
  decision: ReviewDecision;
  comment: string | null;
  decidedAt: string;
}

export interface StaffDossierDetail {
  dossier: LoanDossier;
  documents: DossierDocumentWithOcr[];
  completeness: DossierCompletenessResult;
  cicReport: DossierCicReport | null;
  scoring: { status: string; score_result: Record<string, unknown> | null; scored_at: string | null } | null;
  assignedOfficer: string | null;
  assignedAt: string | null;
  reviewDecisions: DossierReviewDecisionRecord[];
}

export type DossierDetail = StaffDossierDetail | CustomerDossierSummary;

export const isCustomerDossierSummary = (value: LoanDossier | CustomerDossierSummary | DossierDetail): value is CustomerDossierSummary =>
  "statusLabel" in value && !("dossier" in value);
