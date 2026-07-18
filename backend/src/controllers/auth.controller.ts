import { Request, Response } from "express";
import { verifyCredentials } from "../services/auth/demo-user.store";
import { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "../config/auth";
import { recordAuditEvent } from "../services/governance/audit-log.service";
import { config } from "../config/env";
import { resolveLoginRole } from "../services/auth/authorization.service";

const AUTH_RUN_ID = "auth-session";

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = verifyCredentials(username, password);
    if (!user) {
      await recordAuditEvent(
        AUTH_RUN_ID,
        username,
        "human_approval",
        {},
        "blocked",
        `Đăng nhập thất bại cho tài khoản: ${username}.`
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tenantId = "bank-default";
    const role = await resolveLoginRole(tenantId, user.username, user.role);
    if (!role) return res.status(403).json({ error: "AUTHORIZATION_PROFILE_NOT_ACTIVE" });
    const accessToken = signAccessToken({ sub: user.username, role, tenantId });
    await recordAuditEvent(
      AUTH_RUN_ID,
      user.username,
      "human_approval",
      { role },
      "allowed",
      `Đăng nhập thành công: ${user.username} (${role}).`
    );

    return res.status(200).json({
      accessToken,
      role,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      tenantId,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error during login" });
  }
};

/**
 * Creates a short-lived, officer-scoped session for the public hackathon demo.
 * It is enabled by default only outside production; production must opt in explicitly.
 * This keeps orchestration endpoints authenticated without exposing credentials in the UI.
 */
export const createDemoSession = async (_req: Request, res: Response) => {
  if (!config.publicDemoSession) {
    return res.status(404).json({ error: "Demo session is not available" });
  }

  const username = "demo.officer";
  const tenantId = "bank-default";
  const role = await resolveLoginRole(tenantId, username, "CREDIT_OFFICER");
  if (role !== "CREDIT_OFFICER") return res.status(404).json({ error: "Demo session is not available" });
  const accessToken = signAccessToken({ sub: username, role, tenantId });

  await recordAuditEvent(
    AUTH_RUN_ID,
    username,
    "agent_call",
    { role, mode: "public-demo" },
    "allowed",
    "Khởi tạo phiên truy cập giới hạn cho giao diện hackathon demo."
  );

  return res.status(200).json({ accessToken, role, tenantId, expiresIn: ACCESS_TOKEN_TTL_SECONDS });
};

/**
 * Creates a short-lived, approver-scoped session for the public hackathon demo's policy
 * console. Same gating as createDemoSession — no password, disabled in production — but
 * grants CREDIT_APPROVER so the demo can exercise tenant policy read/write without a real login.
 */
export const createDemoApproverSession = async (_req: Request, res: Response) => {
  if (!config.publicDemoSession) {
    return res.status(404).json({ error: "Demo session is not available" });
  }

  const username = "demo.approver";
  const tenantId = "bank-default";
  const role = await resolveLoginRole(tenantId, username, "CREDIT_APPROVER");
  if (role !== "CREDIT_APPROVER") return res.status(404).json({ error: "Demo session is not available" });
  const accessToken = signAccessToken({ sub: username, role, tenantId });

  await recordAuditEvent(
    AUTH_RUN_ID,
    username,
    "agent_call",
    { role, mode: "public-demo" },
    "allowed",
    "Khởi tạo phiên truy cập cấu hình chính sách cho giao diện hackathon demo."
  );

  return res.status(200).json({ accessToken, role, tenantId, expiresIn: ACCESS_TOKEN_TTL_SECONDS });
};
