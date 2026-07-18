import { Request, Response } from "express";
import {
  DocumentIngestionInput,
  getDocumentIngestionStatus,
  ingestDocument,
} from "../services/ingestion/document-ingestion.service";

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const parseIngestionInput = (body: unknown): DocumentIngestionInput | undefined => {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const input = {
    documentId: asString(record.documentId),
    documentType: asString(record.documentType),
    mimeType: asString(record.mimeType),
    bytesBase64: asString(record.bytesBase64),
    sourceHash: asString(record.sourceHash),
  };

  return Object.values(input).every(Boolean) ? input : undefined;
};

export const getIngestionStatus = (_req: Request, res: Response) => {
  return res.status(200).json(getDocumentIngestionStatus());
};

export const ingestDocumentRequest = async (req: Request, res: Response) => {
  const input = parseIngestionInput(req.body);
  if (!input) {
    return res.status(400).json({
      error: "documentId, documentType, mimeType, bytesBase64 and sourceHash are required.",
    });
  }

  try {
    const artifact = await ingestDocument(input);
    return res.status(202).json(artifact);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Document ingestion failed.",
    });
  }
};
