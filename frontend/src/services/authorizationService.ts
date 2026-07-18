import type { UserRole } from "../types/api";
import { apiFetch } from "./httpClient";

export const changeUserRole = (
  token: string,
  userId: string,
  role: UserRole
): Promise<{ userId: string; role: UserRole }> =>
  apiFetch(`/api/users/${encodeURIComponent(userId)}/role`, { method: "PUT", token, body: { role } });
