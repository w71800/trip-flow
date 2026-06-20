import type { Request, Response } from "express";
import { ApiErrorSchema } from "@shared/api/common.js";
import {
  LoginBodySchema,
  LoginSuccessResponseSchema,
  MeSuccessResponseSchema,
  RefreshBodySchema,
  RefreshSuccessResponseSchema,
  TicketSuccessResponseSchema,
} from "@shared/api/auth.js";
import { sendJson } from "../sendJson.js";
import { createSession, signAccessToken, verifyRefreshToken } from "./jwt.js";
import { requireAuth, type AuthedRequest } from "./middleware.js";
import {
  authenticateWithNotion,
  getNotionUserById,
} from "./providers/notion.js";

export async function handleLogin(req: Request, res: Response) {
  const parsed = LoginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "invalid_request" });
    return;
  }

  try {
    const user = await authenticateWithNotion(
      parsed.data.id,
      parsed.data.password,
    );

    if (!user) {
      sendJson(res.status(401), ApiErrorSchema, {
        ok: false,
        error: "invalid_credentials",
      });
      return;
    }

    const session = await createSession(user);
    sendJson(res, LoginSuccessResponseSchema, { ok: true, ...session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}

export async function handleRefresh(req: Request, res: Response) {
  const parsed = RefreshBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "invalid_request" });
    return;
  }

  try {
    const userId = await verifyRefreshToken(parsed.data.refreshToken);
    const user = await getNotionUserById(userId);

    if (!user) {
      sendJson(res.status(401), ApiErrorSchema, { ok: false, error: "unauthorized" });
      return;
    }

    const access = await signAccessToken(user);
    sendJson(res, RefreshSuccessResponseSchema, {
      ok: true,
      accessToken: access.token,
      refreshToken: parsed.data.refreshToken,
      expiresAt: access.expiresAt,
    });
  } catch {
    sendJson(res.status(401), ApiErrorSchema, { ok: false, error: "unauthorized" });
  }
}

export function handleLogout(_req: Request, res: Response) {
  res.status(204).end();
}

export async function handleMe(req: Request, res: Response) {
  const user = (req as AuthedRequest).user;
  sendJson(res, MeSuccessResponseSchema, { ok: true, user });
}

export async function handleTicket(req: Request, res: Response) {
  const user = (req as AuthedRequest).user;
  sendJson(res, TicketSuccessResponseSchema, {
    ok: true,
    message: "票券功能開發中",
    user,
  });
}

import { resolveTripConfig } from "../trips/resolveTripConfig.js";

export async function handleTripTicket(req: Request, res: Response) {
  try {
    const slug = String(req.params.slug ?? "").trim();
    if (!slug) {
      sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "缺少旅行 slug" });
      return;
    }

    const trip = await resolveTripConfig(slug);
    if (!trip) {
      sendJson(res.status(404), ApiErrorSchema, { ok: false, error: "找不到此旅行" });
      return;
    }

    const user = (req as AuthedRequest).user;
    sendJson(res, TicketSuccessResponseSchema, {
      ok: true,
      message: `票券功能開發中（${trip.displayName}）`,
      user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}

export const authRouteHandlers = {
  login: handleLogin,
  refresh: handleRefresh,
  logout: handleLogout,
  me: [requireAuth, handleMe] as const,
  ticket: [requireAuth, handleTicket] as const,
  tripTicket: [requireAuth, handleTripTicket] as const,
};
