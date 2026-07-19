import { apiFetchMultipart } from "./httpClient";

export interface OcrExtractResponse {
  text: string;
  averageConfidence: number;
  filename: string;
}

/** Standalone OCR for the appraisal form's evidence fields (no dossier context needed). */
export const extractOcrText = (token: string, file: File): Promise<OcrExtractResponse> => {
  const formData = new FormData();
  formData.set("file", file);
  return apiFetchMultipart<OcrExtractResponse>("/api/ocr/extract", formData, token);
};
