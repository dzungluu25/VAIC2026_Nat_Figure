import { Router } from "express";
import { changeUserRoleHandler } from "../controllers/authorization.controller";
import { requireAuth, requirePermission } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth());
router.put("/:id/role", requirePermission("USER_ROLE_CHANGE"), changeUserRoleHandler);

export default router;
