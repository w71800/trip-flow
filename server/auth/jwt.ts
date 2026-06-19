import { decodeJwt, jwtVerify, SignJWT } from "jose";
import type { AuthUser } from "./types.js";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("缺少環境變數 JWT_SECRET");
  return new TextEncoder().encode(secret);
}

function getAccessExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN ?? "1h";
}

function getRefreshExpiresIn() {
  return process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";
}

function tokenExpiresAt(token: string) {
  const payload = decodeJwt(token);
  if (typeof payload.exp !== "number") {
    throw new Error("Token 缺少 exp");
  }
  return new Date(payload.exp * 1000).toISOString();
}

export async function signAccessToken(user: AuthUser) {
  const token = await new SignJWT({
    displayName: user.displayName,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(getAccessExpiresIn())
    .sign(getSecret());

  return { token, expiresAt: tokenExpiresAt(token) };
}

export async function signRefreshToken(userId: string) {
  const token = await new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(getRefreshExpiresIn())
    .sign(getSecret());

  return { token, expiresAt: tokenExpiresAt(token) };
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });

  if (payload.type !== "access" || typeof payload.sub !== "string") {
    throw new Error("Invalid access token");
  }

  const displayName =
    typeof payload.displayName === "string" ? payload.displayName : payload.sub;

  return { id: payload.sub, displayName };
}

export async function verifyRefreshToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });

  if (payload.type !== "refresh" || typeof payload.sub !== "string") {
    throw new Error("Invalid refresh token");
  }

  return payload.sub;
}

export async function createSession(user: AuthUser) {
  const access = await signAccessToken(user);
  const refresh = await signRefreshToken(user.id);

  return {
    user,
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresAt: access.expiresAt,
  };
}
