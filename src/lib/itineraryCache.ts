import {
  StoredItineraryCacheSchema,
  type StoredItineraryCache,
} from "@shared/api/itinerary";

export type { StoredItineraryCache };

const CACHE_KEY_PREFIX = "trip-flow:itinerary:v2:";

function cacheKey(slug: string) {
  return `${CACHE_KEY_PREFIX}${slug}`;
}

export function loadItineraryCache(slug: string): StoredItineraryCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const parsed = StoredItineraryCacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveItineraryCache(slug: string, data: StoredItineraryCache) {
  try {
    const parsed = StoredItineraryCacheSchema.parse(data);
    localStorage.setItem(cacheKey(slug), JSON.stringify(parsed));
  } catch {
    // 資料不符合契約或 localStorage 失敗時忽略即可。
  }
}
