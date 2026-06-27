import type { Request, Response } from "express";
import { ApiErrorSchema } from "@shared/api/common.js";
import {
  ItineraryItemContentSuccessResponseSchema,
  ItinerarySuccessResponseSchema,
  type ItineraryItem,
  type ItinerarySuccessResponse,
} from "@shared/api/itinerary.js";
import {
  buildFingerprint,
  canReuseFingerprint,
  fingerprintToEtag,
  getCurrentItineraryEtag,
  getItineraryCache,
  setItineraryCache,
  touchItineraryFingerprintCheck,
} from "./itineraryCache.js";
import {
  buildRunConfigFromEnv,
  buildRunConfigFromTrip,
  LEGACY_CACHE_SLUG,
  type ItineraryRunConfig,
} from "./itinerary/config.js";
import { buildItineraryItemFullHtml, buildFlowItemHtml } from "./itinerary/flowContent.js";
import {
  buildOrder,
  collectContentTimestamps,
  prepareItineraryContext,
} from "./itinerary/flowGraph.js";
import { getDateFromPage } from "./itinerary/flowProperties.js";
import type { ItineraryContext } from "./itinerary/types.js";
import { sendJson } from "./sendJson.js";
import { resolveTripConfig } from "./trips/resolveTripConfig.js";

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

function setItineraryResponseHeaders(res: Response, etag: string, maxAge: number) {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
}

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

async function buildItineraryPayload(ctx: ItineraryContext): Promise<ItinerarySuccessResponse> {
  const orderedIds = buildOrder(ctx.linkedNodes);

  const items: ItineraryItem[] = [];
  let order = 1;

  for (const id of orderedIds) {
    if (items.length >= ctx.config.maxCards) break;
    const node = ctx.linkedNodes.get(id);
    if (!node) continue;

    const page = ctx.pageById.get(id);
    const { html, hasMoreContent } = await buildFlowItemHtml(
      ctx.notion,
      ctx.config,
      node,
      page,
      {
        titlePropertyName: ctx.titlePropertyName,
        nextPropertyName: ctx.nextPropertyName,
        prevPropertyName: ctx.prevPropertyName,
        detailsPropertyName: ctx.detailsPropertyName,
        datePropertyName: ctx.datePropertyName,
      },
      { maxBlocks: ctx.config.blocksMaxRender },
    );

    items.push({
      flowId: node.id,
      order,
      title: node.title || `行程 ${order}`,
      html,
      hasMoreContent,
      date: page ? getDateFromPage(page, ctx.datePropertyName) : null,
      nextFlowId: node.nextId,
      prevFlowId: node.prevId,
    });
    order++;
  }

  return ItinerarySuccessResponseSchema.parse({
    ok: true,
    items,
    meta: {
      fetchedAt: new Date().toISOString(),
      tripStart: ctx.config.tripStart,
      tripEnd: ctx.config.tripEnd,
      tripSlug: ctx.config.tripSlug,
      tripDisplayName: ctx.config.tripDisplayName,
      cached: false,
    },
  });
}

async function handleItineraryWithConfig(
  req: Request,
  res: Response,
  config: ItineraryRunConfig,
  cacheSlug: string,
) {
  const forceRefresh = req.query.refresh === "1";
  const ifNoneMatch = parseIfNoneMatch(req.header("if-none-match"));

  if (!forceRefresh && canReuseFingerprint(cacheSlug, config.fingerprintTtlMs)) {
    const etag = getCurrentItineraryEtag(cacheSlug);
    const cachedPayload = etag ? getItineraryCache(cacheSlug, etag) : null;
    if (etag && cachedPayload) {
      setItineraryResponseHeaders(res, etag, config.cacheMaxAge);
      if (ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }

      sendJson(res, ItinerarySuccessResponseSchema, {
        ...cachedPayload,
        meta: {
          ...cachedPayload.meta,
          cached: true,
        },
      });
      return;
    }
  }

  const ctx = await prepareItineraryContext(config);

  const timestamps = await collectContentTimestamps(
    ctx.notion,
    ctx.linkedNodes,
    ctx.pageById,
  );
  const etag = fingerprintToEtag(buildFingerprint(timestamps));
  touchItineraryFingerprintCheck(cacheSlug);

  if (!forceRefresh) {
    const cachedPayload = getItineraryCache(cacheSlug, etag);
    if (cachedPayload) {
      setItineraryResponseHeaders(res, etag, config.cacheMaxAge);
      if (ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }

      sendJson(res, ItinerarySuccessResponseSchema, {
        ...cachedPayload,
        meta: {
          ...cachedPayload.meta,
          cached: true,
        },
      });
      return;
    }
  }

  const payload = await buildItineraryPayload(ctx);
  setItineraryCache(cacheSlug, etag, payload);
  setItineraryResponseHeaders(res, etag, config.cacheMaxAge);

  if (!forceRefresh && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  sendJson(res, ItinerarySuccessResponseSchema, payload);
}

export async function handleItinerary(req: Request, res: Response) {
  try {
    const config = buildRunConfigFromEnv();
    await handleItineraryWithConfig(req, res, config, LEGACY_CACHE_SLUG);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
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
    await handleItineraryWithConfig(req, res, config, slug);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}

export async function handleItineraryItemContent(req: Request, res: Response) {
  try {
    const config = buildRunConfigFromEnv();
    await handleItineraryItemContentWithConfig(req, res, config);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
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
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}
