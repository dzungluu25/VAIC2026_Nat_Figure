import { apiFetch } from "./httpClient";
import type { UserRole } from "../types/api";

export interface LoginResponse {
  accessToken: string;
  role: UserRole;
  expiresIn: number;
}

export const login = (username: string, password: string): Promise<LoginResponse> =>
  apiFetch<LoginResponse>("/api/auth/login", { method: "POST", body: { username, password } });
