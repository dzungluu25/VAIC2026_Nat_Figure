import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, UserRole } from "../config/auth";
import { AuthorizationAction, AuthorizationContext, roleCan } from "../config/authorization";
import { loadAuthorizationContext } from "../services/auth/authorization.service";
import { createLogger } from "../services/observability/logger";

const logger = createLogger("middleware.auth");

export interface AuthenticatedRequest extends Request {
  user?: AuthorizationContext;
}

/**
 * Verifies a Bearer JWT and, when roles are provided, enforces that the caller's
 * role is one of them. Attaches the decoded identity to req.user for downstream
 * handlers (used to attribute audit events to the real human actor).
 */
export const requireAuth = (...allowedRoles: UserRole[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const token = header.slice("Bearer ".length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    try {
      const context = await loadAuthorizationContext(payload);
      if (!context) return res.status(403).json({ error: "AUTHORIZATION_PROFILE_NOT_ACTIVE" });
      if (allowedRoles.length > 0 && !allowedRoles.includes(context.role)) {
        return res.status(403).json({ error: "Insufficient role permissions" });
      }
      req.user = context;
      return next();
    } catch (error) {
      logger.error("Authorization lookup failed", { error });
      return res.status(503).json({ error: "AUTHORIZATION_SERVICE_UNAVAILABLE" });
    }
  };
};

export const requirePermission = (action: AuthorizationAction) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roleCan(req.user.role, action)) {
      return res.status(403).json({ error: `ACTION_FORBIDDEN:${action}` });
    }
    return next();
  };
