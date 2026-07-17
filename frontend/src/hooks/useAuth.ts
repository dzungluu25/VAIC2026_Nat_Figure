import { useCallback, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { login as loginRequest } from "../services/authService";
import { ApiError } from "../services/httpClient";

export const useAuth = () => {
  const { token, username, role, setSession, clearSession } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (user: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await loginRequest(user, password);
        setSession(result.accessToken, user, result.role);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [setSession]
  );

  const logout = useCallback(() => clearSession(), [clearSession]);

  return { token, username, role, isAuthenticated: Boolean(token), isSubmitting, error, login, logout };
};
