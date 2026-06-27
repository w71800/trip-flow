import { z } from "zod";
import type { TripConfig } from "../trips/types.js";

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

export const LEGACY_CACHE_SLUG = "__legacy__";

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

function buildLimitsFromEnv(env: NodeJS.ProcessEnv) {
  return {
    blocksMaxRender: Number(env.NOTION_BLOCKS_MAX_RENDER ?? "12"),
    blocksMaxFetch: Number(env.NOTION_BLOCKS_MAX_FETCH ?? "60"),
    maxCards: Number(env.NOTION_MAX_CARDS ?? "50"),
    cacheMaxAge: Number(env.ITINERARY_CACHE_MAX_AGE ?? "86400"),
    fingerprintTtlMs: Number(env.ITINERARY_FINGERPRINT_TTL ?? "3600") * 1000,
  };
}

export function buildRunConfigFromEnv(): ItineraryRunConfig {
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
    ...buildLimitsFromEnv(env),
  };
}

export function buildRunConfigFromTrip(trip: TripConfig): ItineraryRunConfig {
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
    ...buildLimitsFromEnv(env),
  };
}
