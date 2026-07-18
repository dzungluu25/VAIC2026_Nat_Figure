import { Router } from "express";
import { orchestratePrompt, orchestratePromptStream, getRunTraces, getAgentContracts, getRegulatoryBaseline, extractDraftCase } from "../controllers/orchestration.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), orchestratePrompt);
router.post("/stream", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), orchestratePromptStream);
router.post("/extract", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), extractDraftCase);
router.get("/agent-contracts", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), getAgentContracts);
router.get("/regulatory-baseline", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), getRegulatoryBaseline);
router.get("/:runId/traces", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), getRunTraces);

export default router;
