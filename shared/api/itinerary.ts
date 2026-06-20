import { z } from "zod";
import { ApiErrorSchema } from "./common.js";

export const ItineraryItemSchema = z.object({
  flowId: z.string(),
  order: z.number().int().positive(),
  title: z.string(),
  html: z.string(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  nextFlowId: z.string().nullable(),
  prevFlowId: z.string().nullable(),
});

export const ItineraryMetaSchema = z.object({
  fetchedAt: z.string(),
  tripStart: z.string(),
  tripEnd: z.string(),
  tripSlug: z.string().optional(),
  tripDisplayName: z.string().optional(),
  cached: z.boolean().optional(),
});

export const ItinerarySuccessResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(ItineraryItemSchema),
  meta: ItineraryMetaSchema,
});

export const ItineraryResponseSchema = z.discriminatedUnion("ok", [
  ItinerarySuccessResponseSchema,
  ApiErrorSchema,
]);

export const StoredItineraryCacheSchema = z.object({
  etag: z.string().min(1),
  items: z.array(ItineraryItemSchema),
  meta: ItineraryMetaSchema.partial(),
  savedAt: z.string(),
});

export type ItineraryItem = z.infer<typeof ItineraryItemSchema>;
export type ItineraryMeta = z.infer<typeof ItineraryMetaSchema>;
export type ItinerarySuccessResponse = z.infer<typeof ItinerarySuccessResponseSchema>;
export type ItineraryResponse = z.infer<typeof ItineraryResponseSchema>;
export type StoredItineraryCache = z.infer<typeof StoredItineraryCacheSchema>;
