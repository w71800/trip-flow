import type { Request, Response } from "express";
import { z } from "zod";
import { ApiErrorSchema } from "@shared/api/common.js";
import {
  PageKeySchema,
  PageSuccessResponseSchema,
  type PageKey,
  type PageSuccessResponse,
} from "@shared/api/pages.js";
import { reloadEnv } from "./env.js";
import { getNotionClient } from "./notion.js";
import { fetchPageMeta, pageBlocksToHtml } from "./notionPageBlocks.js";
import { sendJson } from "./sendJson.js";
import { resolveTripConfig } from "./trips/resolveTripConfig.js";
import { PAGE_ID_FIELDS, type TripConfig } from "./trips/types.js";

const EnvSchema = z.object({
  NOTION_TOKEN: z.string().min(1),
  NOTION_FLIGHT_PAGE_ID: z.string().optional(),
  NOTION_ACCOMMODATION_PAGE_ID: z.string().optional(),
  NOTION_PAGE_BLOCKS_MAX: z.string().optional(),
  NOTION_PAGE_CACHE_MAX_AGE: z.string().optional(),
});

const DEFAULT_PAGE_IDS: Record<PageKey, string> = {
  flight: "384ffcbed6738011a42ecf60573ff254",
  accommodation: "",
};

type PageCacheEntry = {
  etag: string;
  payload: PageSuccessResponse;
  savedAt: number;
  pageId: string;
};

const pageCache = new Map<string, PageCacheEntry>();

function normalizePageId(id: string): string {
  const clean = id.replace(/-/g, "").trim();
  if (clean.length !== 32) return id;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

function getEnv() {
  reloadEnv();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("缺少環境變數 NOTION_TOKEN");
  }
  return parsed.data;
}

function resolvePageIdFromEnv(key: PageKey, env: ReturnType<typeof getEnv>): string {
  if (key === "flight") {
    const id = env.NOTION_FLIGHT_PAGE_ID ?? DEFAULT_PAGE_IDS.flight;
    if (!id) throw new Error("缺少 NOTION_FLIGHT_PAGE_ID");
    return normalizePageId(id);
  }
  const id = env.NOTION_ACCOMMODATION_PAGE_ID ?? DEFAULT_PAGE_IDS.accommodation;
  if (!id) throw new Error("尚未設定 NOTION_ACCOMMODATION_PAGE_ID");
  return normalizePageId(id);
}

function resolvePageIdFromTrip(key: PageKey, trip: TripConfig, env: ReturnType<typeof getEnv>): string {
  const field = PAGE_ID_FIELDS[key];
  const tripPageId = trip[field];
  if (tripPageId) return normalizePageId(tripPageId);

  return resolvePageIdFromEnv(key, env);
}

function buildEtag(scope: string, key: string, pageId: string, lastEditedTime?: string): string {
  const base = lastEditedTime ?? "unknown";
  const pageKey = pageId.replace(/-/g, "").slice(0, 12);
  return `"page-${scope}-${key}-${pageKey}-${base}"`;
}

function cacheKey(scope: string, key: string, pageId: string): string {
  return `${scope}:${key}:${pageId}`;
}

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  return header.split(",")[0]?.trim() || null;
}

async function buildPagePayload(
  key: PageKey,
  pageId: string,
  env: ReturnType<typeof getEnv>,
): Promise<PageSuccessResponse> {
  const notion = getNotionClient();
  const maxBlocks = Number(env.NOTION_PAGE_BLOCKS_MAX ?? "200");

  const meta = await fetchPageMeta(notion, pageId);
  const { html } = await pageBlocksToHtml(notion, pageId, { maxBlocks });

  return PageSuccessResponseSchema.parse({
    ok: true,
    key,
    title: meta.title,
    icon: meta.icon,
    html,
    meta: {
      fetchedAt: new Date().toISOString(),
      lastEditedTime: meta.lastEditedTime,
      cached: false,
    },
  });
}

async function handleNotionPageWithScope(
  req: Request,
  res: Response,
  scope: string,
  resolvePageId: (key: PageKey) => string,
) {
  const env = getEnv();
  const keyResult = PageKeySchema.safeParse(req.params.key);
  if (!keyResult.success) {
    sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "無效的頁面 key" });
    return;
  }
  const key = keyResult.data;

  const forceRefresh = req.query.refresh === "1";
  const maxAge = Number(env.NOTION_PAGE_CACHE_MAX_AGE ?? "3600");
  const ifNoneMatch = parseIfNoneMatch(req.header("if-none-match"));
  const pageId = resolvePageId(key);
  const storeKey = cacheKey(scope, key, pageId);

  if (!forceRefresh) {
    const cached = pageCache.get(storeKey);
    if (cached && cached.pageId === pageId) {
      res.setHeader("ETag", cached.etag);
      res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
      if (ifNoneMatch === cached.etag) {
        res.status(304).end();
        return;
      }
      sendJson(res, PageSuccessResponseSchema, {
        ...cached.payload,
        meta: { ...cached.payload.meta, cached: true },
      });
      return;
    }
  }

  const payload = await buildPagePayload(key, pageId, env);
  const etag = buildEtag(scope, key, pageId, payload.meta.lastEditedTime);
  pageCache.set(storeKey, { etag, payload, savedAt: Date.now(), pageId });

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);

  if (!forceRefresh && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  sendJson(res, PageSuccessResponseSchema, payload);
}

export async function handleNotionPage(req: Request, res: Response) {
  try {
    const env = getEnv();
    await handleNotionPageWithScope(req, res, "__legacy__", (key) =>
      resolvePageIdFromEnv(key, env),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}

export async function handleTripNotionPage(req: Request, res: Response) {
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

    const env = getEnv();
    await handleNotionPageWithScope(req, res, slug, (key) =>
      resolvePageIdFromTrip(key, trip, env),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}
