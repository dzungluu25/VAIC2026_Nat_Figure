import { Response } from "express";
import { isUserRole } from "../config/authorization";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { changeUserRole } from "../services/auth/user-role-admin.service";

export const changeUserRoleHandler = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.body?.role;
  if (!isUserRole(role)) return res.status(400).json({ error: "INVALID_USER_ROLE" });
  try {
    return res.json(await changeUserRole(req.user!, req.params.id, role));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("FORBIDDEN") ? 403 : 422;
    return res.status(status).json({ error: message });
  }
};
