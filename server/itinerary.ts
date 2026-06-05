import type { Request, Response } from "express";
import { z } from "zod";
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
  NOTION_BLOCKS_MAX_RENDER: z.string().optional(),
  NOTION_BLOCKS_MAX_FETCH: z.string().optional(),
  NOTION_MAX_CARDS: z.string().optional(),
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

export async function handleItinerary(req: Request, res: Response) {
  try {
    const env = getEnv();
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

    // 只保留有 Next 或 Previous 連結的行程
    const linkedNodes = new Map<string, any>();
    for (const [id, node] of nodesById) {
      if (node.nextId || node.prevId) linkedNodes.set(id, node);
    }

    const orderedIds = buildOrder(linkedNodes);
    const maxCards = Number(env.NOTION_MAX_CARDS ?? "50");
    const maxRenderBlocks = Number(env.NOTION_BLOCKS_MAX_RENDER ?? "12");
    const maxFetchBlocks = Number(env.NOTION_BLOCKS_MAX_FETCH ?? "60");

    const items: any[] = [];
    let order = 1;

    for (const id of orderedIds) {
      if (items.length >= maxCards) break;
      const node = linkedNodes.get(id);
      if (!node) continue;

      const page = pageById.get(id);
      const contentPageId = node.detailsId ?? node.id;
      const blocks = await getPageBlocks(notion, contentPageId, maxFetchBlocks);
      const { html: blockHtml } = await blocksToHtml(blocks, { maxBlocks: maxRenderBlocks });

      const skipProps = [titlePropertyName, nextPropertyName, prevPropertyName];
      if (detailsPropertyName) skipProps.push(detailsPropertyName);
      const propHtml = page ? propertiesToHtml(page.properties, { skip: skipProps }) : "";

      const html = blockHtml.trim() || propHtml.trim();
      if (!html) continue;

      items.push({
        flowId: node.id,
        order,
        title: node.title || `行程 ${order}`,
        html,
      });
      order++;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      items,
      meta: { fetchedAt: new Date().toISOString() },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ ok: false, error: message });
  }
}
