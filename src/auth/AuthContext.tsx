import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authClient from "./authClient";
import { clearSession, loadSession } from "./storage";
import type { AuthSession } from "./types";

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (id: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const restored = await authClient.ensureValidSession();
      if (!cancelled) {
        setSession(restored);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (id: string, password: string) => {
    const nextSession = await authClient.login(id, password);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.logout();
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      signIn,
      signOut,
    }),
    [session, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必須在 AuthProvider 內使用");
  }
  return ctx;
}

export function useAuthOptional() {
  return useContext(AuthContext);
}

export function readStoredSession() {
  return loadSession();
}
