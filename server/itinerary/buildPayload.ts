import {
  ItinerarySuccessResponseSchema,
  type ItineraryItem,
  type ItinerarySuccessResponse,
} from "@shared/api/itinerary.js";
import { buildFlowItemHtml } from "./flowContent.js";
import { buildOrder } from "./flowGraph.js";
import { getDateFromPage } from "./flowProperties.js";
import type { ItineraryContext } from "./types.js";

export async function buildItineraryPayload(ctx: ItineraryContext): Promise<ItinerarySuccessResponse> {
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
