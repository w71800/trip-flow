import {
  TicketSuccessResponseSchema,
  type TicketDateGroup,
  type TicketItem,
} from "@shared/api/auth.js";
import { getNotionClient } from "./notion.js";
import { findUserNotionPageId } from "./trips/notionTrips.js";
import type { TripConfig } from "./trips/types.js";

const TICKET_FIELDS = {
  id: "id",
  owner: "owner",
  date: "date",
  label: "label",
  image: "image",
} as const;

function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").trim();
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

function getMultiSelectValues(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; multi_select?: Array<{ name?: string }> }
    | undefined;
  if (prop?.type !== "multi_select") return [];
  return (prop.multi_select ?? []).map((item) => item.name).filter(Boolean) as string[];
}

function getLabelValue(properties: Record<string, unknown>, name: string) {
  return (
    getRichTextPlain(properties, name) ??
    getSelectValue(properties, name) ??
    getMultiSelectValues(properties, name)[0] ??
    null
  );
}

function getDateStart(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; date?: { start?: string | null } | null }
    | undefined;
  if (prop?.type !== "date" || !prop.date?.start) return null;
  return String(prop.date.start).slice(0, 10);
}

function getFileUrls(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | {
        type?: string;
        files?: Array<{
          name?: string;
          type?: string;
          file?: { url?: string };
          external?: { url?: string };
        }>;
      }
    | undefined;
  if (prop?.type !== "files") return [];

  return (prop.files ?? [])
    .map((entry) => {
      const url = entry.file?.url ?? entry.external?.url ?? null;
      if (!url) return null;
      return {
        url,
        name: entry.name ?? null,
      };
    })
    .filter(Boolean) as Array<{ url: string; name: string | null }>;
}

async function resolveDataSourceId(databaseId: string) {
  const notion = getNotionClient();
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id as string | undefined;

  if (!dataSourceId) {
    throw new Error("票券 database 沒有 data source；請確認 ticket_page_id 是否正確。");
  }

  return dataSourceId;
}

function parseTicketPage(page: any): TicketItem | null {
  const properties = page.properties ?? {};
  const id = getTitlePlain(properties, TICKET_FIELDS.id);
  if (!id) return null;

  return {
    id,
    label: getLabelValue(properties, TICKET_FIELDS.label),
    images: getFileUrls(properties, TICKET_FIELDS.image),
  };
}

function groupTicketsByDate(
  rows: Array<{ date: string | null; ticket: TicketItem }>,
): TicketDateGroup[] {
  const groups = new Map<string, TicketItem[]>();

  for (const row of rows) {
    if (!row.date) continue;
    const list = groups.get(row.date) ?? [];
    list.push(row.ticket);
    groups.set(row.date, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tickets]) => ({ date, tickets }));
}

export async function fetchTripTickets(
  trip: TripConfig,
  loginId: string,
): Promise<{ ok: true; groups: TicketDateGroup[] }> {
  const databaseId = trip.ticketPageId?.trim();
  if (!databaseId) {
    return TicketSuccessResponseSchema.parse({ ok: true, groups: [] });
  }

  const ownerPageId = await findUserNotionPageId(loginId);
  if (!ownerPageId) {
    return TicketSuccessResponseSchema.parse({ ok: true, groups: [] });
  }

  const notion = getNotionClient();
  const dataSourceId = await resolveDataSourceId(normalizeNotionId(databaseId));
  const rows: Array<{ date: string | null; ticket: TicketItem }> = [];
  let startCursor: string | undefined;

  while (true) {
    const res: any = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: TICKET_FIELDS.owner,
        relation: { contains: ownerPageId },
      },
      start_cursor: startCursor,
      page_size: 100,
    });

    for (const page of res.results ?? []) {
      const ticket = parseTicketPage(page);
      if (!ticket) continue;

      const date = getDateStart(page.properties ?? {}, TICKET_FIELDS.date);
      rows.push({ date, ticket });
    }

    if (!res.has_more) break;
    startCursor = res.next_cursor ?? undefined;
  }

  return TicketSuccessResponseSchema.parse({
    ok: true,
    groups: groupTicketsByDate(rows),
  });
}
