import { AuthSessionSchema, type AuthSession } from "@shared/api/auth";

const STORAGE_KEY = "trip_flow_session";

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = AuthSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(AuthSessionSchema.parse(session)));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAccessExpired(session: AuthSession) {
  const expiresAt = Date.parse(session.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return Date.now() >= expiresAt - 30_000;
}
