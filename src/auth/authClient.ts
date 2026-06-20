import {
  clearSession,
  isAccessExpired,
  loadSession,
  saveSession,
} from "./storage";
import {
  LoginResponseSchema,
  MeResponseSchema,
  RefreshResponseSchema,
  type AuthSession,
} from "@shared/api/auth";
import { parseApiResponse } from "../lib/parseApiResponse";

export async function login(id: string, password: string): Promise<AuthSession> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });

  const data = await parseApiResponse(res, LoginResponseSchema);
  if (!res.ok || !data.ok) {
    throw new Error("invalid_credentials");
  }

  const session: AuthSession = {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
  };
  saveSession(session);
  return session;
}

export async function refreshSession(
  session: AuthSession,
): Promise<AuthSession> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  const data = await parseApiResponse(res, RefreshResponseSchema);
  if (!res.ok || !data.ok) {
    throw new Error("refresh_failed");
  }

  const nextSession: AuthSession = {
    user: session.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
  };
  saveSession(nextSession);
  return nextSession;
}

export async function fetchMe(accessToken: string) {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await parseApiResponse(res, MeResponseSchema);
  if (!res.ok || !data.ok) {
    throw new Error("unauthorized");
  }

  return data.user;
}

export async function logout() {
  const session = loadSession();
  if (session) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
    } catch {
      // ignore network errors on logout
    }
  }
  clearSession();
}

export async function ensureValidSession(): Promise<AuthSession | null> {
  const session = loadSession();
  if (!session) return null;

  if (!isAccessExpired(session)) {
    return session;
  }

  try {
    return await refreshSession(session);
  } catch {
    clearSession();
    return null;
  }
}

export function getAccessToken() {
  return loadSession()?.accessToken ?? null;
}
