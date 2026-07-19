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

export interface ChecklistRequiredField {
  key: string;
  label: string;
}

export interface ChecklistDocumentType {
  documentType: string;
  displayName: string;
  formCode: string | null;
  templateFileRef: string | null;
  formMarkers: string[];
  requiredFields: ChecklistRequiredField[];
  appliesToLoanTypes: LoanType[];
  requiredForLoanTypes: LoanType[];
  note?: string;
}

export interface DocumentChecklistVersion {
  tenantId: string;
  loanType: LoanType;
  version: string;
  status: "draft" | "published";
  items: ChecklistDocumentType[];
  createdBy: string;
  createdAt: string;
  publishedBy?: string;
  publishedAt?: string;
}

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
  loanType: LoanType;
  createdAt: string;
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
  formRejectReason: string | null;
}

export interface CustomerDossierDocument {
  documentType: string;
  displayName: string;
  status: DocumentStatus;
  originalFilename: string;
  uploadedAt: string;
  formRejectReason: string | null;
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
  productTerms: string | null;
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

export interface CustomerDossierDetail {
  isCustomerView: true;
  dossier: CustomerDossierSummary;
  loanType: LoanType;
  completeness: DossierCompletenessResult;
  documents: CustomerDossierDocument[];
  approvedProduct: string | null;
}

export type DossierDetail = StaffDossierDetail | CustomerDossierSummary | CustomerDossierDetail;

export const isCustomerDossierSummary = (value: LoanDossier | CustomerDossierSummary | DossierDetail): value is CustomerDossierSummary =>
  "statusLabel" in value && !("dossier" in value);

export const isCustomerDossierDetail = (value: DossierDetail): value is CustomerDossierDetail =>
  "isCustomerView" in value && value.isCustomerView === true;
