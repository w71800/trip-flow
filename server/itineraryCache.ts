import { createHash } from "node:crypto";

export type ItineraryCachePayload = {
  ok: true;
  items: unknown[];
  meta: {
    fetchedAt: string;
    tripStart: string;
    tripEnd: string;
    cached: boolean;
  };
};

type ItineraryCacheEntry = {
  etag: string;
  payload: ItineraryCachePayload;
  fingerprintCheckedAt: number;
};

let cache: ItineraryCacheEntry | null = null;

export function fingerprintToEtag(fingerprint: string): string {
  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

export function buildFingerprint(
  timestamps: Array<{ id: string; last_edited_time: string }>,
): string {
  return timestamps
    .map((entry) => `${entry.id}:${entry.last_edited_time}`)
    .sort()
    .join("\n");
}

export function getItineraryCache(etag: string): ItineraryCachePayload | null {
  if (!cache || cache.etag !== etag) return null;
  return cache.payload;
}

export function setItineraryCache(etag: string, payload: ItineraryCachePayload) {
  cache = {
    etag,
    payload,
    fingerprintCheckedAt: Date.now(),
  };
}

export function touchItineraryFingerprintCheck() {
  if (!cache) return;
  cache.fingerprintCheckedAt = Date.now();
}

export function canReuseFingerprint(ttlMs: number): boolean {
  if (!cache || ttlMs <= 0) return false;
  return Date.now() - cache.fingerprintCheckedAt < ttlMs;
}

export function clearItineraryCache() {
  cache = null;
}

export function getCurrentItineraryEtag(): string | null {
  return cache?.etag ?? null;
}
