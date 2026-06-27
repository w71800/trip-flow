import type { getNotionClient } from "../notion.js";

type NotionClient = ReturnType<typeof getNotionClient>;

export async function resolveDataSource(notion: NotionClient, dbId: string) {
  let databaseId = dbId;

  try {
    await notion.databases.retrieve({ database_id: databaseId });
  } catch {
    let pageBlocks: { results?: Array<{ type?: string; id?: string }> };
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
      (b) => b?.type === "child_database",
    );

    if (!childDbBlock?.id) {
      throw new Error(
        "flow_database_id 似乎不是 database id。請填入 flow database 的 ID。",
      );
    }

    databaseId = childDbBlock.id;
    await notion.databases.retrieve({ database_id: databaseId });
  }

  const db = (await notion.databases.retrieve({ database_id: databaseId })) as {
    data_sources?: Array<{ id?: string }>;
  };
  const dataSourceId = db?.data_sources?.[0]?.id;

  if (!dataSourceId) {
    throw new Error(
      "此 database 沒有 data source；請確認 flow_database_id 是否為正確的 flow database。",
    );
  }

  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  return { databaseId, dataSourceId, dataSource };
}

export async function queryDataSourceAllPages(
  notion: NotionClient,
  dataSourceId: string,
): Promise<unknown[]> {
  const pages: unknown[] = [];
  let startCursor: string | undefined = undefined;

  while (true) {
    const res = (await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
      page_size: 100,
    })) as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
    pages.push(...(res.results ?? []));
    if (!res.has_more) break;
    startCursor = res.next_cursor ?? undefined;
  }

  return pages;
}

export async function getPageBlocks(
  notion: NotionClient,
  pageId: string,
  maxFetch: number,
): Promise<unknown[]> {
  const blocks: unknown[] = [];
  let startCursor: string | undefined = undefined;

  while (true) {
    const res = (await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: startCursor,
      page_size: 50,
    })) as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
    blocks.push(...(res.results ?? []));
    if (blocks.length >= maxFetch) return blocks.slice(0, maxFetch);
    if (!res.has_more) return blocks;
    startCursor = res.next_cursor ?? undefined;
  }
}
