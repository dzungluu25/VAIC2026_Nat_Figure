import { Router } from "express";
import { orchestratePrompt, orchestratePromptStream, getRunTraces } from "../controllers/orchestration.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), orchestratePrompt);
router.post("/stream", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), orchestratePromptStream);
router.get("/:runId/traces", requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER"), getRunTraces);

export default router;
