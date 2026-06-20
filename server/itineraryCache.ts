import { createHash } from "node:crypto";
import type { ItinerarySuccessResponse } from "@shared/api/itinerary.js";

export type ItineraryCachePayload = ItinerarySuccessResponse;

type ItineraryCacheEntry = {
  etag: string;
  payload: ItineraryCachePayload;
  fingerprintCheckedAt: number;
};

const caches = new Map<string, ItineraryCacheEntry>();

function getEntry(slug: string): ItineraryCacheEntry | null {
  return caches.get(slug) ?? null;
}

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

export function getItineraryCache(slug: string, etag: string): ItineraryCachePayload | null {
  const cache = getEntry(slug);
  if (!cache || cache.etag !== etag) return null;
  return cache.payload;
}

export function setItineraryCache(
  slug: string,
  etag: string,
  payload: ItineraryCachePayload,
) {
  caches.set(slug, {
    etag,
    payload,
    fingerprintCheckedAt: Date.now(),
  });
}

export function touchItineraryFingerprintCheck(slug: string) {
  const cache = getEntry(slug);
  if (!cache) return;
  cache.fingerprintCheckedAt = Date.now();
}

export function canReuseFingerprint(slug: string, ttlMs: number): boolean {
  const cache = getEntry(slug);
  if (!cache || ttlMs <= 0) return false;
  return Date.now() - cache.fingerprintCheckedAt < ttlMs;
}

export function clearItineraryCache(slug?: string) {
  if (slug) {
    caches.delete(slug);
    return;
  }
  caches.clear();
}

export function getCurrentItineraryEtag(slug: string): string | null {
  return getEntry(slug)?.etag ?? null;
}
