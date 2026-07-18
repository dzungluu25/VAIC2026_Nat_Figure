import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UserRole } from "../types/api";

interface Session {
  accessToken: string;
  role: UserRole;
  tenantId: string;
}

interface SessionStoreState extends Partial<Session> {
  setSession: (session: Session) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    set => ({
      setSession: session => set(session),
      clearSession: () => set({ accessToken: undefined, role: undefined, tenantId: undefined }),
    }),
    {
      name: "vaic-auth-session",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
