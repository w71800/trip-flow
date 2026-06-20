import type { Request, Response } from "express";
import { ApiErrorSchema } from "@shared/api/common.js";
import {
  TripDetailSuccessResponseSchema,
  TripsListSuccessResponseSchema,
} from "@shared/api/trips.js";
import { sendJson } from "../sendJson.js";
import type { AuthedRequest } from "../auth/middleware.js";
import { fetchTripsForUser } from "./notionTrips.js";
import { resolveTripConfig } from "./resolveTripConfig.js";
import type { TripConfig } from "./types.js";

function toTripSummary(trip: TripConfig) {
  return {
    slug: trip.slug,
    displayName: trip.displayName,
    status: trip.status,
    tripStart: trip.tripStart,
    tripEnd: trip.tripEnd,
  };
}

export async function handleTripsList(req: Request, res: Response) {
  try {
    const user = (req as AuthedRequest).user;
    const trips = await fetchTripsForUser(user.id);
    sendJson(res, TripsListSuccessResponseSchema, {
      ok: true,
      trips: trips.map(toTripSummary),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}

export async function handleTripDetail(req: Request, res: Response) {
  try {
    const slug = String(req.params.slug ?? "").trim();
    if (!slug) {
      sendJson(res.status(400), ApiErrorSchema, { ok: false, error: "缺少旅行 slug" });
      return;
    }

    const trip = await resolveTripConfig(slug);
    if (!trip) {
      sendJson(res.status(404), ApiErrorSchema, { ok: false, error: "找不到此旅行" });
      return;
    }

    sendJson(res, TripDetailSuccessResponseSchema, {
      ok: true,
      trip: {
        ...toTripSummary(trip),
        participantCount: trip.participantPageIds.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sendJson(res.status(500), ApiErrorSchema, { ok: false, error: message });
  }
}
