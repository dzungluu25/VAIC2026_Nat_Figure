import { getDossier, getLatestDocumentsByType, hasCicReport, transitionDossierStatus } from "./dossier.service";
import { getChecklistVersion } from "./document-checklist.service";
import { notifyMissingDocuments } from "./missing-document-notifier.service";
import { dispatchToScoring } from "./scoring-dispatch.service";
import { recordAuditEvent } from "../governance/audit-log.service";
import { DossierCompletenessResult, DossierStatus } from "../../types/document-intake.types";

// PENDING_CIC included: a dossier can sit there waiting on staff CIC entry and still needs to
// re-evaluate if e.g. the customer later replaces a document (edge case, but keeps this the single
// source of truth for every in-flight transition rather than special-casing PENDING_CIC elsewhere).
const IN_FLIGHT_STATUSES: DossierStatus[] = ["COLLECTING", "INCOMPLETE", "NEEDS_MORE_INFO", "PENDING_CIC"];

/**
 * Task 4: compares submitted+OCR-verified CUSTOMER documents against the checklist pinned to this
 * dossier. CIC is intentionally NOT part of this checklist (see cic-report.service.ts) — it is
 * checked separately in recomputeDossierAfterDocumentChange below. A document only counts once it
 * is OCR_COMPLETE — FORM_REJECTED/OCR_NEEDS_REVIEW attempts do not satisfy the checklist even
 * though a file exists, matching task 3's "không tự động chuyển bước".
 */
export const evaluateDossierCompleteness = async (tenantId: string, dossierId: string): Promise<DossierCompletenessResult> => {
  const dossier = await getDossier(tenantId, dossierId);
  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
  const checklist = await getChecklistVersion(tenantId, dossier.loanType, dossier.checklistVersion);
  if (!checklist) throw new Error("CHECKLIST_VERSION_NOT_FOUND");

  const requiredItems = checklist.items.filter(item => item.requiredForLoanTypes.includes(dossier.loanType));
  const latestByType = new Map((await getLatestDocumentsByType(tenantId, dossierId)).map(doc => [doc.documentType, doc]));

  const missingDocumentTypes = requiredItems
    .filter(item => latestByType.get(item.documentType)?.status !== "OCR_COMPLETE")
    .map(item => ({ documentType: item.documentType, displayName: item.displayName }));

  return { complete: missingDocumentTypes.length === 0, missingDocumentTypes };
};

/**
 * Re-evaluates and transitions dossier status after any change — a customer document upload OR a
 * staff CIC submission both call this. A dossier only ever reaches COMPLETE (and therefore scoring)
 * once BOTH are true: customer checklist complete AND staff has entered CIC. Missing only CIC never
 * triggers the customer missing-document email (task 4) — that would wrongly ask the customer to do
 * a staff-only step — it parks the dossier at PENDING_CIC instead.
 */
export const recomputeDossierAfterDocumentChange = async (tenantId: string, dossierId: string, actor: string): Promise<DossierCompletenessResult> => {
  const dossier = await getDossier(tenantId, dossierId);
  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
  if (!IN_FLIGHT_STATUSES.includes(dossier.status)) return evaluateDossierCompleteness(tenantId, dossierId);

  const completeness = await evaluateDossierCompleteness(tenantId, dossierId);

  if (!completeness.complete) {
    await transitionDossierStatus(tenantId, dossierId, IN_FLIGHT_STATUSES, "INCOMPLETE");
    await notifyMissingDocuments(tenantId, dossier, completeness.missingDocumentTypes, actor);
    return completeness;
  }

  if (!(await hasCicReport(tenantId, dossierId))) {
    const moved = await transitionDossierStatus(tenantId, dossierId, IN_FLIGHT_STATUSES, "PENDING_CIC");
    if (moved) {
      await recordAuditEvent(dossierId, actor, "tool_call", {}, "allowed", `Hồ sơ ${dossierId} đã đủ checklist khách hàng — chờ chuyên viên bổ sung CIC trước khi vào scoring.`);
    }
    return completeness;
  }

  const moved = await transitionDossierStatus(tenantId, dossierId, IN_FLIGHT_STATUSES, "COMPLETE");
  if (moved) {
    await recordAuditEvent(dossierId, actor, "tool_call", {}, "allowed", `Hồ sơ ${dossierId} đã đủ giấy tờ checklist và CIC — chuyển COMPLETE.`);
    // Task 5: handoff into scoring + reviewer routing happens the moment completeness is reached.
    await dispatchToScoring(tenantId, dossierId, actor);
  }
  return completeness;
};
