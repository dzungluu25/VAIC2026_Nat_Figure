import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { createChecklistVersion, getPublishedChecklist, listChecklistVersions, publishChecklistVersion } from "../services/documents/document-checklist.service";
import { createDossier, getScopedDossier, listDossiers, ListDossiersFilter, toCustomerDossierSummary } from "../services/documents/dossier.service";
import { uploadDocument } from "../services/documents/document-upload.service";
import { getDossierDetail } from "../services/documents/dossier-detail.service";
import { submitReviewDecision } from "../services/documents/review-decision.service";
import { submitCicReport } from "../services/documents/cic-report.service";
import { reassignDossier } from "../services/documents/dossier-reassignment.service";
import { getAuditEventsByRun } from "../services/governance/audit-log.service";
import { ChecklistDocumentType, DossierStatus, LoanType, ReviewDecision } from "../types/document-intake.types";

const fail = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const status = message.includes("not configured") || message.includes("LOCAL_OCR_BINARY_NOT_FOUND")
    ? 503 // infra/credential gap (e.g. SMTP not set up yet) — distinct from a business rejection
    : message.includes("NOT_FOUND")
    ? 404
    : message.includes("FORBIDDEN") || message.includes("TENANT")
    ? 403
    : message.includes("IMMUTABLE") || message.includes("CONFLICT") || message.includes("ALREADY")
    ? 409
    : 422;
  return res.status(status).json({ error: message });
};

const VALID_LOAN_TYPES: LoanType[] = ["unsecured", "mortgage"];
const isLoanType = (value: unknown): value is LoanType => typeof value === "string" && VALID_LOAN_TYPES.includes(value as LoanType);

export const createChecklistVersionHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { loanType, version, items } = req.body as { loanType: unknown; version: unknown; items: unknown };
    if (!isLoanType(loanType)) return res.status(400).json({ error: "INVALID_LOAN_TYPE" });
    if (typeof version !== "string" || !version.trim()) return res.status(400).json({ error: "VERSION_REQUIRED" });
    if (!Array.isArray(items)) return res.status(400).json({ error: "ITEMS_REQUIRED" });
    return res.status(201).json(await createChecklistVersion(req.user!.tenantId, loanType, version, items as ChecklistDocumentType[], req.user!.sub));
  } catch (e) {
    return fail(res, e);
  }
};

export const publishChecklistVersionHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loanType = req.params.loanType;
    if (!isLoanType(loanType)) return res.status(400).json({ error: "INVALID_LOAN_TYPE" });
    return res.json(await publishChecklistVersion(req.user!.tenantId, loanType, req.params.version, req.user!.sub));
  } catch (e) {
    return fail(res, e);
  }
};

export const listChecklistVersionsHandler = async (req: AuthenticatedRequest, res: Response) => {
  const loanType = req.params.loanType;
  if (!isLoanType(loanType)) return res.status(400).json({ error: "INVALID_LOAN_TYPE" });
  return res.json({ versions: await listChecklistVersions(req.user!.tenantId, loanType) });
};

export const getPublishedChecklistHandler = async (req: AuthenticatedRequest, res: Response) => {
  const loanType = req.params.loanType;
  if (!isLoanType(loanType)) return res.status(400).json({ error: "INVALID_LOAN_TYPE" });
  const checklist = await getPublishedChecklist(req.user!.tenantId, loanType);
  if (!checklist) return res.status(404).json({ error: "CHECKLIST_NOT_PUBLISHED" });
  return res.json(checklist);
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createDossierHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerId, customerEmail, loanType } = req.body as { customerId: unknown; customerEmail: unknown; loanType: unknown };
    const effectiveCustomerId = req.user!.role === "CUSTOMER" ? req.user!.customerId : customerId;
    if (typeof effectiveCustomerId !== "string" || !effectiveCustomerId.trim()) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });
    if (typeof customerEmail !== "string" || !EMAIL_PATTERN.test(customerEmail)) return res.status(400).json({ error: "VALID_CUSTOMER_EMAIL_REQUIRED" });
    if (!isLoanType(loanType)) return res.status(400).json({ error: "INVALID_LOAN_TYPE" });
    const dossier = await createDossier(
      req.user!.tenantId,
      effectiveCustomerId,
      customerEmail,
      loanType,
      req.user!.userId,
      req.user!.branchId,
      req.user!.teamId
    );
    return res.status(201).json(req.user!.role === "CUSTOMER" ? toCustomerDossierSummary(dossier) : dossier);
  } catch (e) {
    return fail(res, e);
  }
};

const VALID_DOSSIER_STATUSES: DossierStatus[] = [
  "COLLECTING", "INCOMPLETE", "COMPLETE", "QUEUED_FOR_SCORING", "SCORED",
  "PENDING_REVIEW", "APPROVED", "REJECTED", "NEEDS_MORE_INFO", "PENDING_CIC",
];
const isDossierStatus = (value: unknown): value is DossierStatus => typeof value === "string" && VALID_DOSSIER_STATUSES.includes(value as DossierStatus);

/** Task 6 list page: filter by status/loan type; assignedTo=me restricts to the caller's own queue. */
export const listDossiersHandler = async (req: AuthenticatedRequest, res: Response) => {
  const filter: ListDossiersFilter = {};
  if (req.user!.role !== "CUSTOMER") {
    if (isDossierStatus(req.query.status)) filter.status = req.query.status;
    if (isLoanType(req.query.loanType)) filter.loanType = req.query.loanType;
    if (req.query.assignedTo === "me") filter.assignedToCurrentUser = true;
  }
  return res.json({ dossiers: await listDossiers(req.user!, filter) });
};

export const getDossierHandler = async (req: AuthenticatedRequest, res: Response) => {
  const detail = await getDossierDetail(req.user!, req.params.id);
  if (!detail) return res.status(404).json({ error: "DOSSIER_NOT_FOUND" });
  return res.json(detail);
};

const VALID_DECISIONS: ReviewDecision[] = ["approved", "rejected", "more_info"];

/** Task 6 action: Duyệt/Từ chối/Yêu cầu bổ sung — always a named human actor, see review-decision.service.ts. */
export const reviewDecisionHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decision, comment } = req.body as { decision: unknown; comment?: unknown };
    if (typeof decision !== "string" || !VALID_DECISIONS.includes(decision as ReviewDecision)) {
      return res.status(400).json({ error: "INVALID_REVIEW_DECISION" });
    }
    const result = await submitReviewDecision(
      req.user!,
      req.params.id,
      decision as ReviewDecision,
      typeof comment === "string" ? comment : undefined
    );
    return res.json(result);
  } catch (e) {
    return fail(res, e);
  }
};

export const uploadDocumentHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: "FILE_REQUIRED" });
    const documentType = req.body.documentType;
    if (typeof documentType !== "string" || !documentType.trim()) return res.status(400).json({ error: "DOCUMENT_TYPE_REQUIRED" });
    const result = await uploadDocument(
      req.user!,
      req.params.id,
      documentType,
      { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype }
    );
    // The file was stored either way (kept for evidence/audit); a form mismatch is reported as a
    // rejection rather than a plain success so the client can't miss it (task 2: "từ chối ngay, trả lỗi rõ ràng").
    const response = req.user!.role === "CUSTOMER" ? await getDossierDetail(req.user!, req.params.id) : result;
    return res.status(result.formResult.passed ? 201 : 422).json(response);
  } catch (e) {
    return fail(res, e);
  }
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * Staff-only CIC entry — completely separate from uploadDocumentHandler above. No document_type
 * mapping, no OCR, no form-validation call. The file (if attached) is evidence only; the structured
 * fields are what the staff member read off the CIC lookup themselves.
 */
export const submitCicReportHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { creditScore, totalOutstandingDebt, debtGroup, reportDate, notes } = req.body as Record<string, unknown>;
    if (!isNonEmptyString(creditScore) || !isNonEmptyString(totalOutstandingDebt) || !isNonEmptyString(debtGroup) || !isNonEmptyString(reportDate)) {
      return res.status(400).json({ error: "CIC_FIELDS_REQUIRED" });
    }
    const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    const result = await submitCicReport(
      req.user!,
      req.params.id,
      {
        creditScore, totalOutstandingDebt, debtGroup, reportDate,
        notes: typeof notes === "string" ? notes : undefined,
        file: file ? { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype } : undefined,
      }
    );
    return res.status(201).json(result);
  } catch (e) {
    return fail(res, e);
  }
};

export const reassignDossierHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetOfficerId = req.body?.targetOfficerId;
    if (!isNonEmptyString(targetOfficerId)) return res.status(400).json({ error: "TARGET_OFFICER_REQUIRED" });
    return res.json(await reassignDossier(req.user!, req.params.id, targetOfficerId));
  } catch (e) {
    return fail(res, e);
  }
};

export const getDossierAuditHandler = async (req: AuthenticatedRequest, res: Response) => {
  const dossier = await getScopedDossier(req.user!, req.params.id);
  if (!dossier) return res.status(404).json({ error: "DOSSIER_NOT_FOUND" });
  return res.json({ events: await getAuditEventsByRun(dossier.dossierId) });
};
