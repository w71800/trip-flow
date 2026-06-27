import { getNotionClient } from "../notion.js";
import { blocksToHtml } from "../notionBlocksToHtml.js";
import { propertiesToHtml } from "../notionPropertiesToHtml.js";
import type { ItineraryRunConfig } from "./config.js";
import { getPageBlocks, resolveDataSource } from "./flowDataSource.js";
import {
  getRelationIds,
  pickFlowPropertyNames,
  type FlowPropertyNames,
} from "./flowProperties.js";

type NotionClient = ReturnType<typeof getNotionClient>;

function getFlowSkipProps(names: FlowPropertyNames): string[] {
  const skipProps = [
    names.titlePropertyName,
    names.nextPropertyName,
    names.prevPropertyName,
  ];
  if (names.detailsPropertyName) skipProps.push(names.detailsPropertyName);
  if (names.datePropertyName) skipProps.push(names.datePropertyName);
  return skipProps;
}

export async function buildFlowItemHtml(
  notion: NotionClient,
  config: ItineraryRunConfig,
  node: { id: string; detailsId: string | null },
  page: unknown | undefined,
  names: FlowPropertyNames,
  options: { maxBlocks: number },
): Promise<{ html: string; hasMoreContent: boolean }> {
  const contentPageId = node.detailsId ?? node.id;
  const blocks = await getPageBlocks(notion, contentPageId, config.blocksMaxFetch);
  const { html: blockHtml } = await blocksToHtml(blocks, {
    maxBlocks: options.maxBlocks,
  });
  const blockHtmlTrim = blockHtml.trim();

  const properties = (page as { properties?: Record<string, unknown> } | undefined)?.properties;
  const propHtml = properties
    ? propertiesToHtml(properties, { skip: getFlowSkipProps(names) })
    : "";

  const html = blockHtmlTrim || propHtml.trim() || "";
  const hasMoreContent =
    blockHtmlTrim.length > 0 && blocks.length > config.blocksMaxRender;

  return { html, hasMoreContent };
}

export async function resolveFlowPropertyNames(
  config: ItineraryRunConfig,
): Promise<FlowPropertyNames & { notion: NotionClient }> {
  const notion = getNotionClient();
  const { dataSource } = await resolveDataSource(notion, config.flowDatabaseId);
  const names = pickFlowPropertyNames(dataSource, config);

  return {
    notion,
    ...names,
  };
}

export async function buildItineraryItemFullHtml(
  config: ItineraryRunConfig,
  flowId: string,
): Promise<string | null> {
  const names = await resolveFlowPropertyNames(config);

  let page: unknown;
  try {
    page = await names.notion.pages.retrieve({ page_id: flowId });
  } catch {
    return null;
  }

  const properties = (page as { properties?: Record<string, unknown> }).properties;
  const nextIds = getRelationIds(properties?.[names.nextPropertyName]);
  const prevIds = getRelationIds(properties?.[names.prevPropertyName]);
  if (!nextIds[0] && !prevIds[0]) return null;

  const detailsIds = names.detailsPropertyName
    ? getRelationIds(properties?.[names.detailsPropertyName])
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
