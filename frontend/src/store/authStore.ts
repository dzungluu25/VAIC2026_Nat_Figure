import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "../types/api";

interface AuthState {
  token: string | null;
  username: string | null;
  role: UserRole | null;
  setSession: (token: string, username: string, role: UserRole) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      token: null,
      username: null,
      role: null,
      setSession: (token, username, role) => set({ token, username, role }),
      clearSession: () => set({ token: null, username: null, role: null }),
    }),
    { name: "vaic-auth" }
  )
);
