import {
  StoredItineraryCacheSchema,
  type StoredItineraryCache,
} from "@shared/api/itinerary";

export type { StoredItineraryCache };

const CACHE_KEY = "trip-flow:itinerary:v1";

export function loadItineraryCache(): StoredItineraryCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = StoredItineraryCacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveItineraryCache(data: StoredItineraryCache) {
  try {
    const parsed = StoredItineraryCacheSchema.parse(data);
    localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // 資料不符合契約或 localStorage 失敗時忽略即可。
  }
}
