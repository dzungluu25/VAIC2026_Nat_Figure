import { config } from "../../config/env";
import { JsonRecord } from "../retail/case-fixture.service";

export interface NormalizedDocumentArtifact {
  documentId: string;
  documentType: string;
  sourceHash: string;
  fields: JsonRecord;
  pages: Array<{
    pageNumber: number;
    confidence?: number;
    bboxCount?: number;
  }>;
  provider: string;
  normalizedAt: string;
}

export interface DocumentIngestionInput {
  documentId: string;
  documentType: string;
  mimeType: string;
  bytesBase64: string;
  sourceHash: string;
}

export const getDocumentIngestionStatus = () => ({
  provider: config.documentIngestionProvider,
  configured: config.documentIngestionProvider === "fixture-json" || Boolean(config.documentIngestionEndpoint),
  endpointConfigured: Boolean(config.documentIngestionEndpoint),
  productionReady: config.documentIngestionProvider !== "fixture-json" && Boolean(config.documentIngestionEndpoint),
  requiredForProduction: ["OCR/Vision extraction", "schema normalization", "source hash", "bbox/page confidence", "human exception queue"],
});

export const ingestDocument = async (input: DocumentIngestionInput): Promise<NormalizedDocumentArtifact> => {
  if (config.documentIngestionProvider === "fixture-json") {
    throw new Error("Document ingestion is configured for fixture-json only. Configure DOCUMENT_INGESTION_ENDPOINT for OCR/Vision ingestion.");
  }

  if (!config.documentIngestionEndpoint) {
    throw new Error("DOCUMENT_INGESTION_ENDPOINT is required for production document ingestion.");
  }

  const response = await fetch(config.documentIngestionEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Document ingestion provider failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as NormalizedDocumentArtifact;
};
