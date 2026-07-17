import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, UserRole } from "../config/auth";

export interface AuthenticatedRequest extends Request {
  user?: { sub: string; role: UserRole };
}

/**
 * Verifies a Bearer JWT and, when roles are provided, enforces that the caller's
 * role is one of them. Attaches the decoded identity to req.user for downstream
 * handlers (used to attribute audit events to the real human actor).
 */
export const requireAuth = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = verifyAccessToken(token);
      if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
        return res.status(403).json({ error: "Insufficient role permissions" });
      }
      req.user = payload;
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
};
