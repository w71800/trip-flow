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

function resolvePageId(key: PageKey, env: ReturnType<typeof getEnv>): string {
  if (key === "flight") {
    const id = env.NOTION_FLIGHT_PAGE_ID ?? DEFAULT_PAGE_IDS.flight;
    if (!id) throw new Error("缺少 NOTION_FLIGHT_PAGE_ID");
    return normalizePageId(id);
  }
  const id = env.NOTION_ACCOMMODATION_PAGE_ID ?? DEFAULT_PAGE_IDS.accommodation;
  if (!id) throw new Error("尚未設定 NOTION_ACCOMMODATION_PAGE_ID");
  return normalizePageId(id);
}

function buildEtag(key: string, pageId: string, lastEditedTime?: string): string {
  const base = lastEditedTime ?? "unknown";
  const pageKey = pageId.replace(/-/g, "").slice(0, 12);
  return `"page-${key}-${pageKey}-${base}"`;
}

function cacheKey(key: string, pageId: string): string {
  return `${key}:${pageId}`;
}

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  return header.split(",")[0]?.trim() || null;
}

async function buildPagePayload(
  key: PageKey,
  env: ReturnType<typeof getEnv>,
): Promise<PageSuccessResponse> {
  const notion = getNotionClient();
  const pageId = resolvePageId(key, env);
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

export async function handleNotionPage(req: Request, res: Response) {
  try {
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
    const pageId = resolvePageId(key, env);
    const storeKey = cacheKey(key, pageId);

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

    const payload = await buildPagePayload(key, env);
    const etag = buildEtag(key, pageId, payload.meta.lastEditedTime);
    pageCache.set(storeKey, { etag, payload, savedAt: Date.now(), pageId });

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `private, max-age=${maxAge}`);

    if (!forceRefresh && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    sendJson(res, PageSuccessResponseSchema, payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}
