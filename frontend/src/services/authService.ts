import { apiFetch } from "./httpClient";
import type { UserRole } from "../types/api";

export interface LoginResponse {
  accessToken: string;
  role: UserRole;
  tenantId: string;
  expiresIn: number;
}

export const login = (username: string, password: string): Promise<LoginResponse> =>
  apiFetch<LoginResponse>("/api/auth/login", { method: "POST", body: { username, password } });

const isTransientFetchError = (error: unknown): boolean =>
  error instanceof TypeError && /fetch|network|empty|load/i.test(error.message);

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, ms));

const withTransientRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientFetchError(error)) throw error;
    await wait(350);
    return operation();
  }
};

let cachedDemoSession: { token: string; expiresAt: number } | null = null;
let inFlightDemoSession: Promise<string> | null = null;

/** Gets a short-lived officer token without showing a login screen in the hackathon demo. */
export const getDemoAccessToken = async (): Promise<string> => {
  if (cachedDemoSession && cachedDemoSession.expiresAt > Date.now() + 30_000) {
    return cachedDemoSession.token;
  }

  if (!inFlightDemoSession) {
    inFlightDemoSession = withTransientRetry(async () => {
      const session = await apiFetch<LoginResponse>("/api/auth/demo-session", { method: "POST" });
      cachedDemoSession = {
        token: session.accessToken,
        expiresAt: Date.now() + session.expiresIn * 1000,
      };
      return session.accessToken;
    }).finally(() => {
      inFlightDemoSession = null;
    });
  }

  return inFlightDemoSession;
};

let cachedDemoApproverSession: { session: LoginResponse; expiresAt: number } | null = null;
let inFlightDemoApproverSession: Promise<LoginResponse> | null = null;

/** Gets a short-lived approver session (role + tenantId included) for the policy console demo. */
export const getDemoApproverSession = async (): Promise<LoginResponse> => {
  if (cachedDemoApproverSession && cachedDemoApproverSession.expiresAt > Date.now() + 30_000) {
    return cachedDemoApproverSession.session;
  }

  if (!inFlightDemoApproverSession) {
    inFlightDemoApproverSession = withTransientRetry(async () => {
      const session = await apiFetch<LoginResponse>("/api/auth/demo-session/approver", { method: "POST" });
      cachedDemoApproverSession = {
        session,
        expiresAt: Date.now() + session.expiresIn * 1000,
      };
      return session;
    }).finally(() => {
      inFlightDemoApproverSession = null;
    });
  }

  return inFlightDemoApproverSession;
};
