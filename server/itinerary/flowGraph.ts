import { getNotionClient } from "../notion.js";
import type { ItineraryRunConfig } from "./config.js";
import { queryDataSourceAllPages, resolveDataSource } from "./flowDataSource.js";
import {
  getRelationIds,
  getTitleFromPage,
  pickFlowPropertyNames,
} from "./flowProperties.js";
import type { FlowNode, ItineraryContext } from "./types.js";

type NotionClient = ReturnType<typeof getNotionClient>;

export function buildOrder(nodesById: Map<string, FlowNode>): string[] {
  const nodes = Array.from(nodesById.values());
  const getPrev = (n: FlowNode) => (n.prevId ? [n.prevId] : []);
  const getNext = (n: FlowNode) => (n.nextId ? n.nextId : null);

  const visited = new Set<string>();
  const orderedIds: string[] = [];

  const candidates = nodes.filter((n) => {
    const prevIds = getPrev(n);
    if (prevIds.length === 0) return true;
    return prevIds.every((pid) => !nodesById.has(pid));
  });

  for (const start of candidates) {
    if (visited.has(start.id)) continue;

    let current: FlowNode | null | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      orderedIds.push(current.id);
      const nextId = getNext(current);
      current = nextId ? nodesById.get(nextId) : null;
    }
  }

  return orderedIds;
}

export async function collectContentTimestamps(
  notion: NotionClient,
  linkedNodes: Map<string, FlowNode>,
  pageById: Map<string, unknown>,
): Promise<Array<{ id: string; last_edited_time: string }>> {
  const timestamps: Array<{ id: string; last_edited_time: string }> = [];
  const seen = new Set<string>();

  for (const node of linkedNodes.values()) {
    const flowPage = pageById.get(node.id) as { last_edited_time?: string } | undefined;
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
      const contentPage = (await notion.pages.retrieve({ page_id: contentPageId })) as {
        last_edited_time?: string;
      };
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

export async function prepareItineraryContext(config: ItineraryRunConfig): Promise<ItineraryContext> {
  const notion = getNotionClient();
  const { dataSourceId, dataSource } = await resolveDataSource(
    notion,
    config.flowDatabaseId,
  );

  const {
    titlePropertyName,
    nextPropertyName,
    prevPropertyName,
    detailsPropertyName,
    datePropertyName,
  } = pickFlowPropertyNames(dataSource, config);

  const pages = await queryDataSourceAllPages(notion, dataSourceId);
  const nodesById = new Map<string, FlowNode>();
  const pageById = new Map<string, unknown>();

  for (const page of pages) {
    const id = (page as { id: string }).id;
    pageById.set(id, page);

    const properties = (page as { properties?: Record<string, unknown> }).properties;
    const nextIds = getRelationIds(properties?.[nextPropertyName]);
    const prevIds = getRelationIds(properties?.[prevPropertyName]);
    const detailsIds = detailsPropertyName
      ? getRelationIds(properties?.[detailsPropertyName])
      : [];

    nodesById.set(id, {
      id,
      title: getTitleFromPage(page, titlePropertyName),
      nextId: nextIds[0] ?? null,
      prevId: prevIds[0] ?? null,
      detailsId: detailsIds[0] ?? null,
    });
  }

  const linkedNodes = new Map<string, FlowNode>();
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
