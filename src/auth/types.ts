export type AuthUser = {
  id: string;
  displayName: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type LoginResponse =
  | ({ ok: true } & AuthSession)
  | { ok: false; error: string };

export type RefreshResponse =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    }
  | { ok: false; error: string };

export type MeResponse =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };
