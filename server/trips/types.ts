import type { PageKey } from "@shared/api/pages.js";

export type TripConfig = {
  slug: string;
  displayName: string;
  status: string;
  flowDatabaseId: string;
  flightPageId: string | null;
  accommodationPageId: string | null;
  ticketPageId: string | null;
  tripStart: string;
  tripEnd: string;
  participantPageIds: string[];
};

export const PAGE_ID_FIELDS: Record<PageKey, keyof Pick<TripConfig, "flightPageId" | "accommodationPageId">> = {
  flight: "flightPageId",
  accommodation: "accommodationPageId",
};
