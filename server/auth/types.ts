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

export type AccessTokenPayload = {
  sub: string;
  displayName: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
};
