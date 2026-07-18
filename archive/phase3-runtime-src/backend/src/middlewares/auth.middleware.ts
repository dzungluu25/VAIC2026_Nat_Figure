import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";
import { clock } from "../services/platform/clock.service";

const allowedReviewerRoles = new Set(["DEMO_REVIEWER", "CREDIT_REVIEWER", "SENIOR_CREDIT_REVIEWER"]);
const jwksCacheTtlMs = 300000;

interface ApprovalJwtClaims {
  sub?: string;
  role?: string;
  roles?: string[];
  aud?: string | string[];
  iss?: string;
  exp?: number;
  realm_access?: {
    roles?: string[];
  };
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwksKey {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}

interface JwksDocument {
  keys?: JwksKey[];
}

let jwksCache: { expiresAt: number; document: JwksDocument } | undefined;

const bearerTokenFromRequest = (req: Request) => {
  const header = req.headers.authorization;
  if (!header) {
    return "";
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
};

const base64UrlEncode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

const sign = (payload: string) =>
  createHmac("sha256", config.approvalJwtSecret).update(payload).digest("base64url");

const decodeJsonSegment = <T>(segment: string): T => JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;

const audMatches = (aud: ApprovalJwtClaims["aud"]) =>
  Array.isArray(aud) ? aud.includes(config.approvalJwtAudience) : aud === config.approvalJwtAudience;

const claimsAreValid = (claims: ApprovalJwtClaims) => {
  if (claims.iss !== config.approvalJwtIssuer || !audMatches(claims.aud)) {
    return false;
  }

  return Boolean(claims.exp && claims.exp > Math.floor(clock().nowMs() / 1000));
};

export const createApprovalJwt = (claims: ApprovalJwtClaims) => {
  if (!config.allowLocalHs256Jwt) {
    throw new Error("Local HS256 approval JWT creation is disabled.");
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.approvalJwtIssuer,
      aud: config.approvalJwtAudience,
      exp: Math.floor(clock().nowMs() / 1000) + 3600,
      ...claims,
    })
  );
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
};

const verifyHs256 = (header: string, payload: string, signature: string) => {
  if (!config.allowLocalHs256Jwt) {
    return false;
  }

  const expected = sign(`${header}.${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
};

const loadJwks = async (): Promise<JwksDocument | undefined> => {
  if (!config.approvalJwksJson && !config.approvalJwksUrl) {
    return undefined;
  }

  if (jwksCache && jwksCache.expiresAt > clock().nowMs()) {
    return jwksCache.document;
  }

  const document = config.approvalJwksJson
    ? (JSON.parse(config.approvalJwksJson) as JwksDocument)
    : ((await (await fetch(config.approvalJwksUrl)).json()) as JwksDocument);

  jwksCache = {
    expiresAt: clock().nowMs() + jwksCacheTtlMs,
    document,
  };
  return document;
};

const verifyRs256 = async (header: string, payload: string, signature: string, kid?: string) => {
  const jwks = await loadJwks();
  const key = jwks?.keys?.find((item) => item.kid === kid && item.kty === "RSA");
  if (!key) {
    return false;
  }

  const publicKey = createPublicKey({ key, format: "jwk" });
  return verifySignature(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature, "base64url")
  );
};

const verifyApprovalJwt = async (token: string): Promise<ApprovalJwtClaims | undefined> => {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      return undefined;
    }

    const headerPayload = decodeJsonSegment<JwtHeader>(header);
    const verified =
      headerPayload.alg === "HS256"
        ? verifyHs256(header, payload, signature)
        : headerPayload.alg === "RS256"
          ? await verifyRs256(header, payload, signature, headerPayload.kid)
          : false;

    if (!verified) {
      return undefined;
    }

    const claims = decodeJsonSegment<ApprovalJwtClaims>(payload);
    return claimsAreValid(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
};

const reviewerRolesFromClaims = (claims?: ApprovalJwtClaims) => [
  ...(claims?.role ? [claims.role] : []),
  ...(claims?.roles ?? []),
  ...(claims?.realm_access?.roles ?? []),
];

export const requireApprovalAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = bearerTokenFromRequest(req);
  const claims = token.includes(".") ? await verifyApprovalJwt(token) : undefined;
  const demoTokenAllowed = config.nodeEnv !== "production" && token === config.approvalApiToken;

  if (!token || (!claims && !demoTokenAllowed)) {
    return res.status(401).json({ error: "Unauthorized approval request." });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const reviewerRole =
    typeof body.reviewerRole === "string" ? body.reviewerRole : Array.isArray(req.headers["x-reviewer-role"]) ? req.headers["x-reviewer-role"][0] : req.headers["x-reviewer-role"];

  const claimRoles = reviewerRolesFromClaims(claims);
  const authorizedRole = claimRoles.find((role) => allowedReviewerRoles.has(role)) ?? reviewerRole;
  if (!authorizedRole || !allowedReviewerRoles.has(authorizedRole)) {
    return res.status(403).json({ error: "Reviewer role is not authorized for approval." });
  }

  if (claims?.sub && typeof body.reviewerId === "string" && claims.sub !== body.reviewerId) {
    return res.status(403).json({ error: "Reviewer identity does not match approval token." });
  }

  return next();
};

export const clearJwksCacheForTests = () => {
  jwksCache = undefined;
};
