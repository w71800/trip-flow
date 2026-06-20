import type { Request, Response } from "express";
import { z } from "zod";
import type { ItineraryItem, ItinerarySuccessResponse } from "@shared/api/itinerary.js";
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

function getEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missingVars = parsed.error.issues
      .filter((i) => (i as any).code === "invalid_type")
      .filter((i) => (i as any).received === "undefined" || (i as any).received === undefined)
      .map((i) => i.path.join("."))
      .filter(Boolean);

    if (missingVars.length > 0) {
      throw new Error(`缺少環境變數：${Array.from(new Set(missingVars)).join(", ")}`);
    }

    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
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
        "NOTION_FLOW_DATABASE_ID 似乎不是 database id。請填入 flow database 的 ID。",
      );
    }

    databaseId = childDbBlock.id;
    await notion.databases.retrieve({ database_id: databaseId });
  }

  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id as string | undefined;

  if (!dataSourceId) {
    throw new Error(
      "此 database 沒有 data source；請確認 NOTION_FLOW_DATABASE_ID 是否為正確的 flow database。",
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
  env: ReturnType<typeof getEnv>;
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

async function prepareItineraryContext(env: ReturnType<typeof getEnv>): Promise<ItineraryContext> {
  const notion = getNotionClient();
  const { dataSourceId, dataSource } = await resolveDataSource(
    notion,
    env.NOTION_FLOW_DATABASE_ID,
  );

  const titlePropertyName = pickTitlePropertyName(dataSource, env.NOTION_FLOW_TITLE_PROPERTY);
  const nextPropertyName = pickRelationPropertyName(
    dataSource,
    env.NOTION_FLOW_NEXT_PROPERTY,
    "next",
  );
  const prevPropertyName = pickRelationPropertyName(
    dataSource,
    env.NOTION_FLOW_PREVIOUS_PROPERTY,
    "previous",
  );
  const detailsPropertyName = pickRelationPropertyName(
    dataSource,
    env.NOTION_FLOW_DETAILS_PROPERTY,
    "details",
  );
  const datePropertyName = pickDatePropertyName(dataSource, env.NOTION_FLOW_DATE_PROPERTY);

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
    env,
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

async function buildItineraryPayload(ctx: ItineraryContext): Promise<ItinerarySuccessResponse> {
  const orderedIds = buildOrder(ctx.linkedNodes);
  const maxCards = Number(ctx.env.NOTION_MAX_CARDS ?? "50");
  const maxRenderBlocks = Number(ctx.env.NOTION_BLOCKS_MAX_RENDER ?? "12");
  const maxFetchBlocks = Number(ctx.env.NOTION_BLOCKS_MAX_FETCH ?? "60");

  const items: ItineraryItem[] = [];
  let order = 1;

  for (const id of orderedIds) {
    if (items.length >= maxCards) break;
    const node = ctx.linkedNodes.get(id);
    if (!node) continue;

    const page = ctx.pageById.get(id);
    const contentPageId = node.detailsId ?? node.id;
    const blocks = await getPageBlocks(ctx.notion, contentPageId, maxFetchBlocks);
    const { html: blockHtml } = await blocksToHtml(blocks, { maxBlocks: maxRenderBlocks });
    const blockHtmlTrim = blockHtml.trim();

    const skipProps = [
      ctx.titlePropertyName,
      ctx.nextPropertyName,
      ctx.prevPropertyName,
    ];
    if (ctx.detailsPropertyName) skipProps.push(ctx.detailsPropertyName);
    if (ctx.datePropertyName) skipProps.push(ctx.datePropertyName);
    const propHtml = page ? propertiesToHtml(page.properties, { skip: skipProps }) : "";

    const html = blockHtmlTrim || propHtml.trim() || "";

    items.push({
      flowId: node.id,
      order,
      title: node.title || `行程 ${order}`,
      html,
      date: page ? getDateFromPage(page, ctx.datePropertyName) : null,
      nextFlowId: node.nextId,
      prevFlowId: node.prevId,
    });
    order++;
  }

  const tripStart = ctx.env.TRIP_START_DATE ?? "2026-07-16";
  const tripEnd = ctx.env.TRIP_END_DATE ?? "2026-07-23";

  return {
    ok: true,
    items,
    meta: {
      fetchedAt: new Date().toISOString(),
      tripStart,
      tripEnd,
      cached: false,
    },
  };
}

export async function handleItinerary(req: Request, res: Response) {
  try {
    const env = getEnv();
    const forceRefresh = req.query.refresh === "1";
    const maxAge = Number(env.ITINERARY_CACHE_MAX_AGE ?? "86400");
    const fingerprintTtlMs = Number(env.ITINERARY_FINGERPRINT_TTL ?? "3600") * 1000;
    const ifNoneMatch = parseIfNoneMatch(req.header("if-none-match"));

    if (!forceRefresh && canReuseFingerprint(fingerprintTtlMs)) {
      const etag = getCurrentItineraryEtag();
      const cachedPayload = etag ? getItineraryCache(etag) : null;
      if (etag && cachedPayload) {
        setItineraryResponseHeaders(res, etag, maxAge);
        if (ifNoneMatch === etag) {
          res.status(304).end();
          return;
        }

        res.json({
          ...cachedPayload,
          meta: {
            ...cachedPayload.meta,
            cached: true,
          },
        });
        return;
      }
    }

    const ctx = await prepareItineraryContext(env);

    const timestamps = await collectContentTimestamps(
      ctx.notion,
      ctx.linkedNodes,
      ctx.pageById,
    );
    const etag = fingerprintToEtag(buildFingerprint(timestamps));
    touchItineraryFingerprintCheck();

    if (!forceRefresh) {
      const cachedPayload = getItineraryCache(etag);
      if (cachedPayload) {
        setItineraryResponseHeaders(res, etag, maxAge);
        if (ifNoneMatch === etag) {
          res.status(304).end();
          return;
        }

        res.json({
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
    setItineraryCache(etag, payload);
    setItineraryResponseHeaders(res, etag, maxAge);

    if (!forceRefresh && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ ok: false, error: message });
  }
}
