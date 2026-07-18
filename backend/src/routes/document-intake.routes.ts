import { Router } from "express";
import multer from "multer";
import { requireAuth, requirePermission } from "../middleware/auth.middleware";
import {
  createChecklistVersionHandler,
  createDossierHandler,
  getDossierHandler,
  getDossierAuditHandler,
  getPublishedChecklistHandler,
  listChecklistVersionsHandler,
  listDossiersHandler,
  publishChecklistVersionHandler,
  reassignDossierHandler,
  reviewDecisionHandler,
  submitCicReportHandler,
  uploadDocumentHandler,
} from "../controllers/document-intake.controller";

// In-memory buffering: files go straight to Supabase Storage, never touch local disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const documentChecklistRoutes = Router();
documentChecklistRoutes.use(requireAuth());
documentChecklistRoutes.get("/:loanType", requirePermission("CHECKLIST_READ"), getPublishedChecklistHandler);
documentChecklistRoutes.get("/:loanType/versions", requirePermission("CHECKLIST_READ"), listChecklistVersionsHandler);
documentChecklistRoutes.post("/", requirePermission("CHECKLIST_MANAGE"), createChecklistVersionHandler);
documentChecklistRoutes.post("/:loanType/versions/:version/publish", requirePermission("CHECKLIST_MANAGE"), publishChecklistVersionHandler);

export const dossierRoutes = Router();
dossierRoutes.use(requireAuth());
dossierRoutes.post("/", requirePermission("DOSSIER_CREATE"), createDossierHandler);
dossierRoutes.get("/", requirePermission("DOSSIER_LIST"), listDossiersHandler);
dossierRoutes.get("/:id", requirePermission("DOSSIER_VIEW"), getDossierHandler);
dossierRoutes.get("/:id/audit", requirePermission("AUDIT_READ"), getDossierAuditHandler);
dossierRoutes.post("/:id/documents", requirePermission("DOCUMENT_UPLOAD"), upload.single("file"), uploadDocumentHandler);
// Separate from /documents on purpose (task: 2 luồng tách biệt) — no document_type, no OCR pipeline.
dossierRoutes.post("/:id/cic-report", requirePermission("CIC_UPLOAD"), upload.single("file"), submitCicReportHandler);
dossierRoutes.post("/:id/review-decision", requirePermission("REVIEW_DECIDE"), reviewDecisionHandler);
dossierRoutes.post("/:id/reassign", requirePermission("DOSSIER_REASSIGN"), reassignDossierHandler);
