import { z } from "zod";
import { ApiErrorSchema } from "./common.js";

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
});

export const AuthSessionSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string(),
});

export const LoginBodySchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
});

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const LoginSuccessResponseSchema = AuthSessionSchema.extend({
  ok: z.literal(true),
});

export const LoginResponseSchema = z.discriminatedUnion("ok", [
  LoginSuccessResponseSchema,
  ApiErrorSchema,
]);

export const RefreshSuccessResponseSchema = z.object({
  ok: z.literal(true),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string(),
});

export const RefreshResponseSchema = z.discriminatedUnion("ok", [
  RefreshSuccessResponseSchema,
  ApiErrorSchema,
]);

export const MeSuccessResponseSchema = z.object({
  ok: z.literal(true),
  user: AuthUserSchema,
});

export const MeResponseSchema = z.discriminatedUnion("ok", [
  MeSuccessResponseSchema,
  ApiErrorSchema,
]);

export const TicketImageSchema = z.object({
  url: z.string().min(1),
  name: z.string().nullish(),
});

export const TicketItemSchema = z.object({
  id: z.string(),
  label: z.string().nullish(),
  images: z.array(TicketImageSchema),
});

export const TicketDateGroupSchema = z.object({
  date: z.string(),
  tickets: z.array(TicketItemSchema),
});

export const TicketSuccessResponseSchema = z.object({
  ok: z.literal(true),
  groups: z.array(TicketDateGroupSchema),
});

export const TicketResponseSchema = z.discriminatedUnion("ok", [
  TicketSuccessResponseSchema,
  ApiErrorSchema,
]);

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type LoginSuccessResponse = z.infer<typeof LoginSuccessResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshSuccessResponse = z.infer<typeof RefreshSuccessResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type MeSuccessResponse = z.infer<typeof MeSuccessResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type TicketImage = z.infer<typeof TicketImageSchema>;
export type TicketItem = z.infer<typeof TicketItemSchema>;
export type TicketDateGroup = z.infer<typeof TicketDateGroupSchema>;
export type TicketSuccessResponse = z.infer<typeof TicketSuccessResponseSchema>;
export type TicketResponse = z.infer<typeof TicketResponseSchema>;
