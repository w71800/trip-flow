import type { Response } from "express";

export function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

export function setItineraryResponseHeaders(res: Response, etag: string, maxAge: number) {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
}
