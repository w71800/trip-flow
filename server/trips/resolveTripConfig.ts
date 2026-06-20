import type { TripConfig } from "./types.js";
import { fetchTripConfigBySlug } from "./notionTrips.js";

type CacheEntry = {
  config: TripConfig;
  savedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function clearTripConfigCache(slug?: string) {
  if (slug) {
    cache.delete(slug);
    return;
  }
  cache.clear();
}

export async function resolveTripConfig(slug: string): Promise<TripConfig | null> {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const config = await fetchTripConfigBySlug(slug);
  if (!config) return null;

  cache.set(slug, { config, savedAt: Date.now() });
  return config;
}
