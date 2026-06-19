import type { AuthSession } from "./types";

const STORAGE_KEY = "trip_flow_session";

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (
      !parsed?.accessToken ||
      !parsed?.refreshToken ||
      !parsed?.expiresAt ||
      !parsed?.user?.id
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAccessExpired(session: AuthSession) {
  const expiresAt = Date.parse(session.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return Date.now() >= expiresAt - 30_000;
}
