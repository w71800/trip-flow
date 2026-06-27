import type { Request, Response } from "express";
import { ItinerarySuccessResponseSchema } from "@shared/api/itinerary.js";
import {
  buildFingerprint,
  canReuseFingerprint,
  fingerprintToEtag,
  getCurrentItineraryEtag,
  getItineraryCache,
  setItineraryCache,
  touchItineraryFingerprintCheck,
} from "../itineraryCache.js";
import { sendJson } from "../sendJson.js";
import type { ItineraryRunConfig } from "./config.js";
import { buildItineraryPayload } from "./buildPayload.js";
import { collectContentTimestamps, prepareItineraryContext } from "./flowGraph.js";
import { parseIfNoneMatch, setItineraryResponseHeaders } from "./httpUtils.js";

function sendCachedItinerary(
  res: Response,
  etag: string,
  maxAge: number,
  ifNoneMatch: string | null,
  cachedPayload: NonNullable<ReturnType<typeof getItineraryCache>>,
) {
  setItineraryResponseHeaders(res, etag, maxAge);
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
}

export async function serveItinerary(
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
      sendCachedItinerary(res, etag, config.cacheMaxAge, ifNoneMatch, cachedPayload);
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
      sendCachedItinerary(res, etag, config.cacheMaxAge, ifNoneMatch, cachedPayload);
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
