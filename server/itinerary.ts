import type { Request, Response } from "express";
import { z } from "zod";
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
  type ItineraryCachePayload,
} from "./itineraryCache.js";
import { getNotionClient } from "./notion.js";
import { blocksToHtml } from "./notionBlocksToHtml.js";
import { propertiesToHtml } from "./notionPropertiesToHtml.js";
import { sendJson } from "./sendJson.js";
import { resolveTripConfig } from "./trips/resolveTripConfig.js";
import type { TripConfig } from "./trips/types.js";

const EnvSchema = z.object({
  NOTION_TOKEN: z.string().min(1),
  NOTION_FLOW_DATABASE_ID: z.string().min(1),
  NOTION_FLOW_NEXT_PROPERTY: z.string().optional(),
  NOTION_FLOW_PREVIOUS_PROPERTY: z.string().optional(),
  NOTION_FLOW_DETAILS_PROPERTY: z.string().optional(),
  NOTION_FLOW_TITLE_PROPERTY: z.string().optional(),
  NOTION_FLOW_DATE_PROPERTY: z.string().optional(),
  TRIP_START_DATE: z.string().optional(),
  TRIP_END_DATE: z.string().optional(),
  NOTION_BLOCKS_MAX_RENDER: z.string().optional(),
  NOTION_BLOCKS_MAX_FETCH: z.string().optional(),
  NOTION_MAX_CARDS: z.string().optional(),
  ITINERARY_CACHE_MAX_AGE: z.string().optional(),
  ITINERARY_FINGERPRINT_TTL: z.string().optional(),
});

export type ItineraryRunConfig = {
  flowDatabaseId: string;
  flowTitleProperty?: string;
  flowNextProperty?: string;
  flowPreviousProperty?: string;
  flowDetailsProperty?: string;
  flowDateProperty?: string;
  tripStart: string;
  tripEnd: string;
  tripSlug?: string;
  tripDisplayName?: string;
  blocksMaxRender: number;
  blocksMaxFetch: number;
  maxCards: number;
  cacheMaxAge: number;
  fingerprintTtlMs: number;
};

const LEGACY_CACHE_SLUG = "__legacy__";

function getLegacyEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missingVars = parsed.error.issues
      .filter((i) => (i as { code?: string }).code === "invalid_type")
      .filter(
        (i) =>
          (i as { received?: string }).received === "undefined" ||
          (i as { received?: string }).received === undefined,
      )
      .map((i) => i.path.join("."))
      .filter(Boolean);

    if (missingVars.length > 0) {
      throw new Error(`缺少環境變數：${Array.from(new Set(missingVars)).join(", ")}`);
    }

    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}

function buildRunConfigFromEnv(): ItineraryRunConfig {
  const env = getLegacyEnv();
  return {
    flowDatabaseId: env.NOTION_FLOW_DATABASE_ID,
    flowTitleProperty: env.NOTION_FLOW_TITLE_PROPERTY,
    flowNextProperty: env.NOTION_FLOW_NEXT_PROPERTY,
    flowPreviousProperty: env.NOTION_FLOW_PREVIOUS_PROPERTY,
    flowDetailsProperty: env.NOTION_FLOW_DETAILS_PROPERTY,
    flowDateProperty: env.NOTION_FLOW_DATE_PROPERTY,
    tripStart: env.TRIP_START_DATE ?? "2026-07-16",
    tripEnd: env.TRIP_END_DATE ?? "2026-07-23",
    blocksMaxRender: Number(env.NOTION_BLOCKS_MAX_RENDER ?? "12"),
    blocksMaxFetch: Number(env.NOTION_BLOCKS_MAX_FETCH ?? "60"),
    maxCards: Number(env.NOTION_MAX_CARDS ?? "50"),
    cacheMaxAge: Number(env.ITINERARY_CACHE_MAX_AGE ?? "86400"),
    fingerprintTtlMs: Number(env.ITINERARY_FINGERPRINT_TTL ?? "3600") * 1000,
  };
}

function buildRunConfigFromTrip(trip: TripConfig): ItineraryRunConfig {
  const env = process.env;
  return {
    flowDatabaseId: trip.flowDatabaseId,
    flowTitleProperty: env.NOTION_FLOW_TITLE_PROPERTY,
    flowNextProperty: env.NOTION_FLOW_NEXT_PROPERTY,
    flowPreviousProperty: env.NOTION_FLOW_PREVIOUS_PROPERTY,
    flowDetailsProperty: env.NOTION_FLOW_DETAILS_PROPERTY,
    flowDateProperty: env.NOTION_FLOW_DATE_PROPERTY,
    tripStart: trip.tripStart,
    tripEnd: trip.tripEnd,
    tripSlug: trip.slug,
    tripDisplayName: trip.displayName,
    blocksMaxRender: Number(env.NOTION_BLOCKS_MAX_RENDER ?? "12"),
    blocksMaxFetch: Number(env.NOTION_BLOCKS_MAX_FETCH ?? "60"),
    maxCards: Number(env.NOTION_MAX_CARDS ?? "50"),
    cacheMaxAge: Number(env.ITINERARY_CACHE_MAX_AGE ?? "86400"),
    fingerprintTtlMs: Number(env.ITINERARY_FINGERPRINT_TTL ?? "3600") * 1000,
  };
}

function getTitleFromPage(page: any, titlePropertyName: string): string {
  const prop = page?.properties?.[titlePropertyName];
  if (!prop) return "";
  if (prop.type !== "title") return "";
  const titleParts = (prop.title ?? []).map((t: any) => t.plain_text ?? "");
  return titleParts.join("").trim();
}

function getRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation") return [];
  return (prop.relation ?? []).map((r: any) => r.id).filter(Boolean);
}

function pickTitlePropertyName(schema: any, override?: string) {
  if (override) return override;
  for (const [name, prop] of Object.entries<any>(schema?.properties ?? {})) {
    if (prop?.type === "title") return name;
  }
  throw new Error(
    "找不到 title 欄位；請在 .env 設定 NOTION_FLOW_TITLE_PROPERTY（你的 database 可能是「名稱」）。",
  );
}

function pickDatePropertyName(schema: any, override?: string) {
  if (override) return override;

  const dateCandidates: string[] = [];
  for (const [name, prop] of Object.entries<any>(schema?.properties ?? {})) {
    if (prop?.type === "date") dateCandidates.push(name);
  }

  const datePatterns = [/日期/i, /date/i, /時間/i, /time/i, /day/i];
  for (const name of dateCandidates) {
    if (datePatterns.some((re) => re.test(name))) return name;
  }

  return dateCandidates[0] ?? null;
}

function getDateFromPage(page: any, datePropertyName: string | null): string | null {
  if (!datePropertyName) return null;
  const prop = page?.properties?.[datePropertyName];
  if (!prop || prop.type !== "date" || !prop.date?.start) return null;
  return String(prop.date.start).slice(0, 10);
}

function pickRelationPropertyName(
  schema: any,
  override: string | undefined,
  mode: "next" | "previous" | "details",
) {
  if (override) return override;

  const relationCandidates: { name: string; schema: any }[] = [];
  for (const [name, prop] of Object.entries<any>(schema?.properties ?? {})) {
    if (prop?.type === "relation") relationCandidates.push({ name, schema: prop });
  }

  const names = relationCandidates.map((c) => c.name);
  const includesAny = (value: string, patterns: RegExp[]) =>
    patterns.some((re) => re.test(value));

  if (mode === "next") {
    const nextPatterns = [/next/i, /下一/i, /後一|後續|下一步/i];
    for (const n of names) if (includesAny(n, nextPatterns)) return n;
  }
  if (mode === "previous") {
    const prevPatterns = [/previous/i, /上一/i, /前一|前段|之前|上一步|prev/i];
    for (const n of names) if (includesAny(n, prevPatterns)) return n;
  }
  if (mode === "details") {
    const detailPatterns = [/行程/i, /details?/i, /連結|連接/i, /link/i, /page/i];
    for (const n of names) if (includesAny(n, detailPatterns)) return n;
  }

  return null;
}

async function resolveDataSource(notion: any, dbId: string) {
  let databaseId = dbId;

  try {
    await notion.databases.retrieve({ database_id: databaseId });
  } catch {
    let pageBlocks: any;
    try {
      pageBlocks = await notion.blocks.children.list({
        block_id: dbId,
        page_size: 100,
      });
    } catch (pageErr) {
      const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
      if (/shared with your integration/i.test(msg)) {
        throw new Error(
          `Notion integration 無法存取此頁面/資料庫（ID: ${dbId}）。請在 Notion 中開啟該頁面 → 右上角「⋯」→「連結」→ 加入你的 integration「trip flow」。`,
        );
      }
      throw pageErr;
    }

    const childDbBlock = (pageBlocks.results ?? []).find(
      (b: any) => b?.type === "child_database",
    ) as any;

    if (!childDbBlock?.id) {
      throw new Error(
        "flow_database_id 似乎不是 database id。請填入 flow database 的 ID。",
      );
    }

    databaseId = childDbBlock.id;
    await notion.databases.retrieve({ database_id: databaseId });
  }

  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id as string | undefined;

  if (!dataSourceId) {
    throw new Error(
      "此 database 沒有 data source；請確認 flow_database_id 是否為正確的 flow database。",
    );
  }

  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  return { databaseId, dataSourceId, dataSource };
}

async function queryDataSourceAllPages(notion: any, dataSourceId: string): Promise<any[]> {
  const pages: any[] = [];
  let startCursor: string | undefined = undefined;

  while (true) {
    const res: any = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
      page_size: 100,
    });
    pages.push(...(res.results ?? []));
    if (!res.has_more) break;
    startCursor = res.next_cursor ?? undefined;
  }

  return pages;
}

async function getPageBlocks(notion: any, pageId: string, maxFetch: number): Promise<any[]> {
  const blocks: any[] = [];
  let startCursor: string | undefined = undefined;

  while (true) {
    const res: any = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: startCursor,
      page_size: 50,
    });
    blocks.push(...(res.results ?? []));
    if (blocks.length >= maxFetch) return blocks.slice(0, maxFetch);
    if (!res.has_more) return blocks;
    startCursor = res.next_cursor ?? undefined;
  }
}

function buildOrder(nodesById: Map<string, any>) {
  const nodes = Array.from(nodesById.values());
  const getPrev = (n: any) => (n.prevId ? [n.prevId] : []);
  const getNext = (n: any) => (n.nextId ? n.nextId : null);

  const visited = new Set<string>();
  const orderedIds: string[] = [];

  const candidates = nodes.filter((n) => {
    const prevIds = getPrev(n);
    if (prevIds.length === 0) return true;
    return prevIds.every((pid) => !nodesById.has(pid));
  });

  for (const start of candidates) {
    if (visited.has(start.id)) continue;

    let current: any = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      orderedIds.push(current.id);
      const nextId = getNext(current);
      current = nextId ? nodesById.get(nextId) : null;
    }
  }

  return orderedIds;
}

type ItineraryContext = {
  config: ItineraryRunConfig;
  notion: ReturnType<typeof getNotionClient>;
  dataSourceId: string;
  dataSource: any;
  titlePropertyName: string;
  nextPropertyName: string;
  prevPropertyName: string;
  detailsPropertyName: string | null;
  datePropertyName: string | null;
  pages: any[];
  linkedNodes: Map<string, any>;
  pageById: Map<string, any>;
};

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

function setItineraryResponseHeaders(res: Response, etag: string, maxAge: number) {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
}

async function collectContentTimestamps(
  notion: any,
  linkedNodes: Map<string, any>,
  pageById: Map<string, any>,
): Promise<Array<{ id: string; last_edited_time: string }>> {
  const timestamps: Array<{ id: string; last_edited_time: string }> = [];
  const seen = new Set<string>();

  for (const node of linkedNodes.values()) {
    const flowPage = pageById.get(node.id);
    if (flowPage?.last_edited_time) {
      timestamps.push({
        id: node.id,
        last_edited_time: flowPage.last_edited_time,
      });
    }

    const contentPageId = node.detailsId ?? node.id;
    if (seen.has(contentPageId)) continue;
    seen.add(contentPageId);
    if (contentPageId === node.id) continue;

    try {
      const contentPage = await notion.pages.retrieve({ page_id: contentPageId });
      if (contentPage?.last_edited_time) {
        timestamps.push({
          id: contentPageId,
          last_edited_time: contentPage.last_edited_time,
        });
      }
    } catch {
      // 內容頁讀不到時略過，仍會在完整重建時再嘗試。
    }
  }

  return timestamps;
}

async function prepareItineraryContext(config: ItineraryRunConfig): Promise<ItineraryContext> {
  const notion = getNotionClient();
  const { dataSourceId, dataSource } = await resolveDataSource(
    notion,
    config.flowDatabaseId,
  );

  const titlePropertyName = pickTitlePropertyName(dataSource, config.flowTitleProperty);
  const nextPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowNextProperty,
    "next",
  );
  const prevPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowPreviousProperty,
    "previous",
  );
  const detailsPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowDetailsProperty,
    "details",
  );
  const datePropertyName = pickDatePropertyName(dataSource, config.flowDateProperty);

  if (!nextPropertyName || !prevPropertyName) {
    throw new Error(
      "找不到 next/previous 關聯欄位；請設定 NOTION_FLOW_NEXT_PROPERTY 與 NOTION_FLOW_PREVIOUS_PROPERTY。",
    );
  }

  const pages = await queryDataSourceAllPages(notion, dataSourceId);
  const nodesById = new Map<string, any>();
  const pageById = new Map<string, any>();

  for (const page of pages) {
    const id: string = page.id;
    pageById.set(id, page);

    const nextIds = getRelationIds(page.properties?.[nextPropertyName]);
    const prevIds = getRelationIds(page.properties?.[prevPropertyName]);
    const detailsIds = detailsPropertyName
      ? getRelationIds(page.properties?.[detailsPropertyName])
      : [];

    nodesById.set(id, {
      id,
      title: getTitleFromPage(page, titlePropertyName),
      nextId: nextIds[0] ?? null,
      prevId: prevIds[0] ?? null,
      detailsId: detailsIds[0] ?? null,
    });
  }

  const linkedNodes = new Map<string, any>();
  for (const [id, node] of nodesById) {
    if (node.nextId || node.prevId) linkedNodes.set(id, node);
  }

  return {
    config,
    notion,
    dataSourceId,
    dataSource,
    titlePropertyName,
    nextPropertyName,
    prevPropertyName,
    detailsPropertyName,
    datePropertyName,
    pages,
    linkedNodes,
    pageById,
  };
}

type FlowPropertyNames = {
  titlePropertyName: string;
  nextPropertyName: string;
  prevPropertyName: string;
  detailsPropertyName: string | null;
  datePropertyName: string | null;
};

function getFlowSkipProps(
  names: FlowPropertyNames,
): string[] {
  const skipProps = [
    names.titlePropertyName,
    names.nextPropertyName,
    names.prevPropertyName,
  ];
  if (names.detailsPropertyName) skipProps.push(names.detailsPropertyName);
  if (names.datePropertyName) skipProps.push(names.datePropertyName);
  return skipProps;
}

async function buildFlowItemHtml(
  notion: ReturnType<typeof getNotionClient>,
  config: ItineraryRunConfig,
  node: { id: string; detailsId: string | null },
  page: any | undefined,
  names: FlowPropertyNames,
  options: { maxBlocks: number },
): Promise<{ html: string; hasMoreContent: boolean }> {
  const contentPageId = node.detailsId ?? node.id;
  const blocks = await getPageBlocks(notion, contentPageId, config.blocksMaxFetch);
  const { html: blockHtml } = await blocksToHtml(blocks, {
    maxBlocks: options.maxBlocks,
  });
  const blockHtmlTrim = blockHtml.trim();

  const propHtml = page
    ? propertiesToHtml(page.properties, { skip: getFlowSkipProps(names) })
    : "";

  const html = blockHtmlTrim || propHtml.trim() || "";
  const hasMoreContent =
    blockHtmlTrim.length > 0 && blocks.length > config.blocksMaxRender;

  return { html, hasMoreContent };
}

async function resolveFlowPropertyNames(
  config: ItineraryRunConfig,
): Promise<FlowPropertyNames & { notion: ReturnType<typeof getNotionClient> }> {
  const notion = getNotionClient();
  const { dataSource } = await resolveDataSource(notion, config.flowDatabaseId);

  const titlePropertyName = pickTitlePropertyName(dataSource, config.flowTitleProperty);
  const nextPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowNextProperty,
    "next",
  );
  const prevPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowPreviousProperty,
    "previous",
  );
  const detailsPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowDetailsProperty,
    "details",
  );
  const datePropertyName = pickDatePropertyName(dataSource, config.flowDateProperty);

  if (!nextPropertyName || !prevPropertyName) {
    throw new Error(
      "找不到 next/previous 關聯欄位；請設定 NOTION_FLOW_NEXT_PROPERTY 與 NOTION_FLOW_PREVIOUS_PROPERTY。",
    );
  }

  return {
    notion,
    titlePropertyName,
    nextPropertyName,
    prevPropertyName,
    detailsPropertyName,
    datePropertyName,
  };
}

async function buildItineraryItemFullHtml(
  config: ItineraryRunConfig,
  flowId: string,
): Promise<string | null> {
  const names = await resolveFlowPropertyNames(config);

  let page: any;
  try {
    page = await names.notion.pages.retrieve({ page_id: flowId });
  } catch {
    return null;
  }

  const nextIds = getRelationIds(page.properties?.[names.nextPropertyName]);
  const prevIds = getRelationIds(page.properties?.[names.prevPropertyName]);
  if (!nextIds[0] && !prevIds[0]) return null;

  const detailsIds = names.detailsPropertyName
    ? getRelationIds(page.properties?.[names.detailsPropertyName])
    : [];

  const node = {
    id: flowId,
    detailsId: detailsIds[0] ?? null,
  };

  const { html } = await buildFlowItemHtml(
    names.notion,
    config,
    node,
    page,
    names,
    { maxBlocks: config.blocksMaxFetch },
  );

  return html || null;
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
