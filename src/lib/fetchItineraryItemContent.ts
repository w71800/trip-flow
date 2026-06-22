import { ItineraryItemContentResponseSchema } from "@shared/api/itinerary";
import { parseApiResponse } from "./parseApiResponse";

export async function fetchItineraryItemContent(
  tripSlug: string,
  flowId: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(
    `/api/trips/${encodeURIComponent(tripSlug)}/itinerary/${encodeURIComponent(flowId)}/content`,
    { signal },
  );
  const json = await parseApiResponse(res, ItineraryItemContentResponseSchema);
  if (!json.ok) {
    throw new Error(json.error);
  }
  return json.html;
}
