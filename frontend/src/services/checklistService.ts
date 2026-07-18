import { apiFetch } from "./httpClient";
import type { ChecklistDocumentType, DocumentChecklistVersion, LoanType } from "../types/document-intake";

export const getPublishedChecklist = (token: string, loanType: LoanType): Promise<DocumentChecklistVersion> =>
  apiFetch<DocumentChecklistVersion>(`/api/document-checklists/${loanType}`, { token });

export const listChecklistVersions = (token: string, loanType: LoanType): Promise<{ versions: DocumentChecklistVersion[] }> =>
  apiFetch<{ versions: DocumentChecklistVersion[] }>(`/api/document-checklists/${loanType}/versions`, { token });

export const createChecklistVersion = (
  token: string,
  loanType: LoanType,
  version: string,
  items: ChecklistDocumentType[]
): Promise<DocumentChecklistVersion> =>
  apiFetch<DocumentChecklistVersion>("/api/document-checklists", { method: "POST", token, body: { loanType, version, items } });

export const publishChecklistVersion = (
  token: string,
  loanType: LoanType,
  version: string
): Promise<DocumentChecklistVersion> =>
  apiFetch<DocumentChecklistVersion>(`/api/document-checklists/${loanType}/versions/${encodeURIComponent(version)}/publish`, { method: "POST", token });
