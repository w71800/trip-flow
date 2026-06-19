import { ensureValidSession, refreshSession } from "./authClient";
import { clearSession, loadSession } from "./storage";

type ApiFetchInit = RequestInit & {
  skipAuth?: boolean;
};

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchInit = {},
) {
  const { skipAuth = false, headers, ...rest } = init;

  const send = async (accessToken?: string | null) => {
    const nextHeaders = new Headers(headers);
    if (!skipAuth && accessToken) {
      nextHeaders.set("Authorization", `Bearer ${accessToken}`);
    }
    return fetch(input, { ...rest, headers: nextHeaders });
  };

  if (skipAuth) {
    return send(null);
  }

  let session = await ensureValidSession();
  if (!session) {
    return send(null);
  }

  let res = await send(session.accessToken);
  if (res.status !== 401) {
    return res;
  }

  const current = loadSession();
  if (!current) {
    clearSession();
    return res;
  }

  try {
    session = await refreshSession(current);
  } catch {
    clearSession();
    return res;
  }

  res = await send(session.accessToken);
  if (res.status === 401) {
    clearSession();
  }

  return res;
}
