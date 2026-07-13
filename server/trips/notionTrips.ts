import { z } from "zod";
import { getNotionClient } from "../notion.js";
import { reloadEnv } from "../env.js";
import type { TripConfig } from "./types.js";

const EnvSchema = z.object({
  NOTION_TOKEN: z.string().min(1),
  NOTION_TRIPS_DATABASE_ID: z.string().min(1),
  NOTION_USERS_DATABASE_ID: z.string().optional(),
  NOTION_FLOW_DATABASE_ID: z.string().optional(),
  NOTION_FLIGHT_PAGE_ID: z.string().optional(),
  NOTION_ACCOMMODATION_PAGE_ID: z.string().optional(),
  NOTION_PRETRIP_PAGE_ID: z.string().optional(),
  NOTION_TICKET_PAGE_ID: z.string().optional(),
  TRIP_START_DATE: z.string().optional(),
  TRIP_END_DATE: z.string().optional(),
});

const TRIP_FIELDS = {
  displayName: "displayName",
  status: "status",
  participants: "participants",
  flowDatabaseId: "flow_database_id",
  flightPageId: "flight_page_id",
  accommodationPageId: "accommodation_page_id",
  pretripPageId: "pretrip_page_id",
  ticketPageId: "ticket_page_id",
  period: "period",
} as const;

function getEnv() {
  reloadEnv();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("缺少環境變數 NOTION_TOKEN 或 NOTION_TRIPS_DATABASE_ID");
  }
  return parsed.data;
}

function getTitlePlain(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; title?: Array<{ plain_text?: string }> }
    | undefined;
  if (prop?.type !== "title") return null;
  return prop.title?.map((part) => part.plain_text ?? "").join("").trim() || null;
}

function getRichTextPlain(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  if (prop?.type !== "rich_text") return null;
  return prop.rich_text?.map((part) => part.plain_text ?? "").join("").trim() || null;
}

function getSelectValue(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as { type?: string; select?: { name?: string } | null } | undefined;
  if (prop?.type !== "select") return null;
  return prop.select?.name ?? null;
}

function getRelationIds(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; relation?: Array<{ id?: string }> }
    | undefined;
  if (prop?.type !== "relation") return [];
  return (prop.relation ?? []).map((entry) => entry.id).filter(Boolean) as string[];
}

function getDateRange(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; date?: { start?: string | null; end?: string | null } | null }
    | undefined;
  if (prop?.type !== "date" || !prop.date?.start) return null;
  const start = String(prop.date.start).slice(0, 10);
  const end = prop.date.end ? String(prop.date.end).slice(0, 10) : start;
  return { start, end };
}

function pickTitlePropertyName(schema: Record<string, unknown>) {
  for (const [name, prop] of Object.entries(schema)) {
    if ((prop as { type?: string })?.type === "title") return name;
  }
  throw new Error("Trips database 找不到 title 欄位");
}

function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").trim();
}

async function resolveDataSourceId(databaseId: string) {
  const notion = getNotionClient();
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id as string | undefined;

  if (!dataSourceId) {
    throw new Error(
      "Trips database 沒有 data source；請確認 NOTION_TRIPS_DATABASE_ID 是否正確。",
    );
  }

  const dataSource: any = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  return {
    dataSourceId,
    titlePropertyName: pickTitlePropertyName(dataSource?.properties ?? {}),
  };
}

function applyEnvFallback(
  partial: Omit<TripConfig, "slug" | "displayName" | "status" | "participantPageIds"> &
    Pick<TripConfig, "slug" | "displayName" | "status" | "participantPageIds">,
): TripConfig {
  const env = getEnv();

  const flowDatabaseId =
    partial.flowDatabaseId || env.NOTION_FLOW_DATABASE_ID?.trim() || "";
  if (!flowDatabaseId) {
    throw new Error(
      `旅行「${partial.slug}」缺少 flow_database_id，且環境變數 NOTION_FLOW_DATABASE_ID 也未設定`,
    );
  }

  return {
    ...partial,
    flowDatabaseId: normalizeNotionId(flowDatabaseId),
    flightPageId: partial.flightPageId || env.NOTION_FLIGHT_PAGE_ID?.trim() || null,
    accommodationPageId:
      partial.accommodationPageId || env.NOTION_ACCOMMODATION_PAGE_ID?.trim() || null,
    pretripPageId: partial.pretripPageId || env.NOTION_PRETRIP_PAGE_ID?.trim() || null,
    ticketPageId: partial.ticketPageId || env.NOTION_TICKET_PAGE_ID?.trim() || null,
    tripStart: partial.tripStart || env.TRIP_START_DATE || "2026-07-16",
    tripEnd: partial.tripEnd || env.TRIP_END_DATE || "2026-07-23",
  };
}

function parseTripPage(page: any, titlePropertyName: string): TripConfig {
  const properties = page.properties ?? {};
  const slug = getTitlePlain(properties, titlePropertyName);
  if (!slug) {
    throw new Error("Trips database 有一筆資料缺少 slug（title）");
  }

  const period = getDateRange(properties, TRIP_FIELDS.period);
  const flowDatabaseId = getRichTextPlain(properties, TRIP_FIELDS.flowDatabaseId);

  return applyEnvFallback({
    slug,
    displayName:
      getRichTextPlain(properties, TRIP_FIELDS.displayName) || slug,
    status: getSelectValue(properties, TRIP_FIELDS.status) || "未知",
    flowDatabaseId: flowDatabaseId ? normalizeNotionId(flowDatabaseId) : "",
    flightPageId: getRichTextPlain(properties, TRIP_FIELDS.flightPageId),
    accommodationPageId: getRichTextPlain(properties, TRIP_FIELDS.accommodationPageId),
    pretripPageId: getRichTextPlain(properties, TRIP_FIELDS.pretripPageId),
    ticketPageId: getRichTextPlain(properties, TRIP_FIELDS.ticketPageId),
    tripStart: period?.start ?? "",
    tripEnd: period?.end ?? "",
    participantPageIds: getRelationIds(properties, TRIP_FIELDS.participants),
  });
}

export async function fetchTripConfigBySlug(slug: string): Promise<TripConfig | null> {
  const env = getEnv();
  const notion = getNotionClient();
  const { dataSourceId, titlePropertyName } = await resolveDataSourceId(
    env.NOTION_TRIPS_DATABASE_ID,
  );

  const res: any = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: titlePropertyName,
      title: { equals: slug },
    },
    page_size: 1,
  });

  const page = res.results?.[0];
  if (!page?.properties) return null;

  return parseTripPage(page, titlePropertyName);
}

export async function fetchAllTripConfigs(): Promise<TripConfig[]> {
  const env = getEnv();
  const notion = getNotionClient();
  const { dataSourceId, titlePropertyName } = await resolveDataSourceId(
    env.NOTION_TRIPS_DATABASE_ID,
  );

  const trips: TripConfig[] = [];
  let startCursor: string | undefined;

  while (true) {
    const res: any = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
      page_size: 100,
    });

    for (const page of res.results ?? []) {
      if (!page?.properties) continue;
      trips.push(parseTripPage(page, titlePropertyName));
    }

    if (!res.has_more) break;
    startCursor = res.next_cursor ?? undefined;
  }

  return trips;
}

export async function findUserNotionPageId(loginId: string): Promise<string | null> {
  const env = getEnv();
  if (!env.NOTION_USERS_DATABASE_ID) return null;

  const notion = getNotionClient();
  const { dataSourceId } = await resolveDataSourceId(env.NOTION_USERS_DATABASE_ID);

  const res: any = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "id",
      title: { equals: loginId },
    },
    page_size: 1,
  });

  return res.results?.[0]?.id ?? null;
}

export async function fetchTripsForUser(loginId: string): Promise<TripConfig[]> {
  const userPageId = await findUserNotionPageId(loginId);
  if (!userPageId) return [];

  const allTrips = await fetchAllTripConfigs();
  return allTrips.filter((trip) => trip.participantPageIds.includes(userPageId));
}
