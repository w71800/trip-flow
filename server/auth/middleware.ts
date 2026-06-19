import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt.js";
import type { AuthUser } from "./types.js";

export type AuthedRequest = Request & { user: AuthUser };

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    const user = await verifyAccessToken(token);
    (req as AuthedRequest).user = user;
    next();
  } catch {
    res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

export async function tryGetUserFromRequest(
  req: Request,
): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}
