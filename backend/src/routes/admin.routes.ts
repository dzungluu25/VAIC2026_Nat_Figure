import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import type { Response } from "express";
import { getAdminSystemOverview } from "../services/admin/admin-system.service";

// ADMIN-only system console: health, tool/agent registry, versions and operational stats.
export const adminRoutes = Router();
adminRoutes.use(requireAuth("ADMIN"));
adminRoutes.get("/system", async (req: AuthenticatedRequest, res: Response) => {
  return res.json(await getAdminSystemOverview(req.user!.tenantId));
});
