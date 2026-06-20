import { z } from "zod";
import { ApiErrorSchema } from "./common.js";

export const TripStatusSchema = z.string();

export const TripSummarySchema = z.object({
  slug: z.string().min(1),
  displayName: z.string(),
  status: TripStatusSchema,
  tripStart: z.string(),
  tripEnd: z.string(),
});

export const TripDetailSchema = TripSummarySchema.extend({
  participantCount: z.number().int().nonnegative(),
});

export const TripsListSuccessResponseSchema = z.object({
  ok: z.literal(true),
  trips: z.array(TripSummarySchema),
});

export const TripsListResponseSchema = z.discriminatedUnion("ok", [
  TripsListSuccessResponseSchema,
  ApiErrorSchema,
]);

export const TripDetailSuccessResponseSchema = z.object({
  ok: z.literal(true),
  trip: TripDetailSchema,
});

export const TripDetailResponseSchema = z.discriminatedUnion("ok", [
  TripDetailSuccessResponseSchema,
  ApiErrorSchema,
]);

export type TripSummary = z.infer<typeof TripSummarySchema>;
export type TripDetail = z.infer<typeof TripDetailSchema>;
export type TripsListSuccessResponse = z.infer<typeof TripsListSuccessResponseSchema>;
export type TripsListResponse = z.infer<typeof TripsListResponseSchema>;
export type TripDetailSuccessResponse = z.infer<typeof TripDetailSuccessResponseSchema>;
export type TripDetailResponse = z.infer<typeof TripDetailResponseSchema>;
