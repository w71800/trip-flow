import type { Request, Response } from "express";
import { ApiErrorSchema } from "@shared/api/common.js";
import { ItineraryItemContentSuccessResponseSchema } from "@shared/api/itinerary.js";
import { sendJson } from "../sendJson.js";
import { resolveTripConfig } from "../trips/resolveTripConfig.js";
import { serveItinerary } from "./cacheResponse.js";
import {
  buildRunConfigFromEnv,
  buildRunConfigFromTrip,
  LEGACY_CACHE_SLUG,
  type ItineraryRunConfig,
} from "./config.js";
import { buildItineraryItemFullHtml } from "./flowContent.js";

async function handleItineraryItemContentWithConfig(
  req: Request,
  res: Response,
  config: ItineraryRunConfig,
) {
  const flowId = String(req.params.flowId ?? "").trim();
  if (!flowId) {
    sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "缺少行程 flowId" });
    return;
  }

  const html = await buildItineraryItemFullHtml(config, flowId);
  if (html === null) {
    sendJson(res.status(404), ApiErrorSchema, { ok: false, error: "找不到此行程" });
    return;
  }

  res.setHeader("Cache-Control", `private, max-age=${config.cacheMaxAge}`);
  sendJson(res, ItineraryItemContentSuccessResponseSchema, {
    ok: true,
    flowId,
    html,
  });
}

function handleItineraryError(res: Response, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  res.setHeader("Cache-Control", "no-store");
  sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
}

export async function handleItinerary(req: Request, res: Response) {
  try {
    const config = buildRunConfigFromEnv();
    await serveItinerary(req, res, config, LEGACY_CACHE_SLUG);
  } catch (e) {
    handleItineraryError(res, e);
  }
}

export async function handleTripItinerary(req: Request, res: Response) {
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

    const config = buildRunConfigFromTrip(trip);
    await serveItinerary(req, res, config, slug);
  } catch (e) {
    handleItineraryError(res, e);
  }
}

export async function handleItineraryItemContent(req: Request, res: Response) {
  try {
    const config = buildRunConfigFromEnv();
    await handleItineraryItemContentWithConfig(req, res, config);
  } catch (e) {
    handleItineraryError(res, e);
  }
}

export async function handleTripItineraryItemContent(req: Request, res: Response) {
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

    const config = buildRunConfigFromTrip(trip);
    await handleItineraryItemContentWithConfig(req, res, config);
  } catch (e) {
    handleItineraryError(res, e);
  }
}
