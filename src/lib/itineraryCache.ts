type ItineraryItem = {
  flowId: string;
  order: number;
  title: string;
  html: string;
  date: string | null;
  nextFlowId: string | null;
  prevFlowId: string | null;
};

type ItineraryMeta = {
  fetchedAt?: string;
  tripStart?: string;
  tripEnd?: string;
  cached?: boolean;
};

export type StoredItineraryCache = {
  etag: string;
  items: ItineraryItem[];
  meta: ItineraryMeta;
  savedAt: string;
};

const CACHE_KEY = "trip-flow:itinerary:v1";

export function loadItineraryCache(): StoredItineraryCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredItineraryCache;
    if (!parsed?.etag || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveItineraryCache(data: StoredItineraryCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 可能因容量或隱私模式失敗，忽略即可。
  }
}
