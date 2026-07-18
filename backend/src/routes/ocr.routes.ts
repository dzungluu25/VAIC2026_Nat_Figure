import { Router } from "express";
import multer from "multer";
import type { Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { runDocumentOcr } from "../services/documents/local-ocr.service";

// Standalone OCR (no dossier context) for the appraisal form's evidence fields: a file is OCR'd and
// the extracted text is returned so the officer/customer can attach real document content pre-intake.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const ocrRoutes = Router();
ocrRoutes.use(requireAuth());
ocrRoutes.post("/extract", upload.single("file"), async (req: AuthenticatedRequest & { file?: Express.Multer.File }, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "FILE_REQUIRED" });
    const { text, averageConfidence } = await runDocumentOcr(file.buffer, file.mimetype);
    return res.json({ text: text.trim(), averageConfidence, filename: file.originalname });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR_FAILED";
    const status = message.includes("UNSUPPORTED_MIME_TYPE") ? 415 : message.includes("BINARY_NOT_FOUND") ? 503 : 422;
    return res.status(status).json({ error: message });
  }
});
