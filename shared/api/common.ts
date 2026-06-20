import { z } from "zod";

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
