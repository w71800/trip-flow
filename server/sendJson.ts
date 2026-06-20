import type { Response } from "express";
import { z } from "zod";
import { parseApiPayload } from "@shared/api/parsePayload.js";

export function sendJson<T>(res: Response, schema: z.ZodType<T>, data: unknown): void {
  res.json(parseApiPayload(schema, data));
}
