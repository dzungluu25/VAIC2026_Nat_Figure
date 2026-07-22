import { Request, Response } from "express";
import { verifyCredentials } from "../services/auth/demo-user.store";
import { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "../config/auth";
import { recordAuditEvent } from "../services/governance/audit-log.service";
import { config } from "../config/env";
import { resolveLoginRole } from "../services/auth/authorization.service";
import type { UserRole } from "../config/authorization";
import { createLogger } from "../services/observability/logger";

const logger = createLogger("controller.auth");

const AUTH_RUN_ID = "auth-session";
const TENANT_ID = "bank-default";

const auditAuthEvent = async (
  actor: string,
  payload: Record<string, unknown>,
  details: string,
  status: "allowed" | "blocked" = "allowed"
): Promise<void> => {
  await recordAuditEvent(AUTH_RUN_ID, actor, "human_approval", payload, status, details);
};

const issueSessionResponse = (
  res: Response,
  username: string,
  role: UserRole,
  tenantId = TENANT_ID
) => {
  const accessToken = signAccessToken({ sub: username, role, tenantId });
  return res.status(200).json({
    accessToken,
    role,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tenantId,
  });
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = verifyCredentials(username, password);
    if (!user) {
      await auditAuthEvent(username, {}, `Login failed for account: ${username}.`, "blocked");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const role = await resolveLoginRole(TENANT_ID, user.username, user.role);
    if (!role) return res.status(403).json({ error: "AUTHORIZATION_PROFILE_NOT_ACTIVE" });

    await auditAuthEvent(user.username, { role }, `Login succeeded: ${user.username} (${role}).`);
    return issueSessionResponse(res, user.username, role);
  } catch (error) {
    logger.error("Login failed", { error });
    return res.status(500).json({ error: "Internal server error during login" });
  }
};

const createPublicDemoSession = async (
  res: Response,
  username: string,
  preferredRole: UserRole,
  unavailableMessage: string
) => {
  if (!config.publicDemoSession) {
    return res.status(404).json({ error: "Demo session is not available" });
  }

  const role = await resolveLoginRole(TENANT_ID, username, preferredRole);
  if (role !== preferredRole) {
    return res.status(503).json({ error: unavailableMessage });
  }

  await recordAuditEvent(
    AUTH_RUN_ID,
    username,
    "agent_call",
    { role, mode: "public-demo" },
    "allowed",
    `Created public-demo session for ${username} (${role}).`
  );

  return issueSessionResponse(res, username, role);
};

/**
 * Creates a short-lived, officer-scoped session for the public hackathon demo.
 * Every error is converted to JSON so the browser never sees ERR_EMPTY_RESPONSE.
 */
export const createDemoSession = async (_req: Request, res: Response) => {
  try {
    return await createPublicDemoSession(
      res,
      "demo.officer",
      "CREDIT_OFFICER",
      "Demo officer authorization profile is not ready"
    );
  } catch (error) {
    logger.error("Demo session creation failed", { error });
    return res.status(500).json({ error: "Internal server error during demo session creation" });
  }
};

/**
 * Creates a short-lived, approver-scoped session for the public hackathon demo.
 */
export const createDemoApproverSession = async (_req: Request, res: Response) => {
  try {
    return await createPublicDemoSession(
      res,
      "demo.approver",
      "CREDIT_APPROVER",
      "Demo approver authorization profile is not ready"
    );
  } catch (error) {
    logger.error("Demo approver session creation failed", { error });
    return res.status(500).json({ error: "Internal server error during demo approver session creation" });
  }
};
