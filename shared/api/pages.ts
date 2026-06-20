import { z } from "zod";
import { ApiErrorSchema } from "./common.js";

export const PageKeySchema = z.enum(["flight", "accommodation"]);

export const PageMetaSchema = z.object({
  fetchedAt: z.string(),
  lastEditedTime: z.string().optional(),
  cached: z.boolean().optional(),
});

export const PageSuccessResponseSchema = z.object({
  ok: z.literal(true),
  key: PageKeySchema,
  title: z.string(),
  icon: z.string().nullable(),
  html: z.string(),
  meta: PageMetaSchema,
});

export const PageResponseSchema = z.discriminatedUnion("ok", [
  PageSuccessResponseSchema,
  ApiErrorSchema,
]);

export type PageKey = z.infer<typeof PageKeySchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export type PageSuccessResponse = z.infer<typeof PageSuccessResponseSchema>;
export type PageResponse = z.infer<typeof PageResponseSchema>;
