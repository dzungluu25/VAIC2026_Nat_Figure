import jwt from "jsonwebtoken";
import { config } from "./env";
import { isUserRole, UserRole } from "./authorization";

export type { UserRole } from "./authorization";

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  tenantId: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes: short-lived, aligned with maker-checker session expectations

const getJwtSecret = (): string => {
  if (!config.authJwtSecret) {
    throw new Error(
      "AUTH_JWT_SECRET is not configured. Refusing to sign or verify auth tokens with an empty secret."
    );
  }
  return config.authJwtSecret;
};

/** Called once at server startup so a missing secret fails fast instead of on the first login. */
export const assertAuthSecretConfigured = (): void => {
  getJwtSecret();
};

export const signAccessToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: "shb-vaic-auth",
  });
};

export const verifyAccessToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret(), { issuer: "shb-vaic-auth" });
  if (typeof decoded === "string" || !decoded.sub || !isUserRole(decoded.role) || !decoded.tenantId) {
    throw new Error("Malformed auth token payload.");
  }
  return { sub: decoded.sub as string, role: decoded.role, tenantId: decoded.tenantId as string };
};
