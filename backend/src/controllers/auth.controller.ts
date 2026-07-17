import { Request, Response } from "express";
import { verifyCredentials } from "../services/auth/demo-user.store";
import { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "../config/auth";
import { recordAuditEvent } from "../services/governance/audit-log.service";

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

    const accessToken = signAccessToken({ sub: user.username, role: user.role });
    await recordAuditEvent(
      AUTH_RUN_ID,
      user.username,
      "human_approval",
      { role: user.role },
      "allowed",
      `Đăng nhập thành công: ${user.username} (${user.role}).`
    );

    return res.status(200).json({
      accessToken,
      role: user.role,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error during login" });
  }
};
