export type { AuthUser, AuthSession } from "@shared/api/auth.js";

export type AccessTokenPayload = {
  sub: string;
  displayName: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
};
