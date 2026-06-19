import { z } from "zod";
import { getNotionClient } from "../../notion.js";
import type { AuthUser } from "../types.js";

const EnvSchema = z.object({
  NOTION_USERS_DATABASE_ID: z.string().min(1),
});

function getEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("缺少環境變數 NOTION_USERS_DATABASE_ID");
  }
  return parsed.data;
}

function getTitlePlain(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; title?: Array<{ plain_text?: string }> }
    | undefined;
  if (prop?.type !== "title") return null;
  return prop.title?.[0]?.plain_text ?? null;
}

function getRichTextPlain(properties: Record<string, unknown>, name: string) {
  const prop = properties[name] as
    | { type?: string; rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  if (prop?.type !== "rich_text") return null;
  return prop.rich_text?.[0]?.plain_text ?? null;
}

async function resolveDataSourceId(databaseId: string) {
  const notion = getNotionClient();
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id as string | undefined;

  if (!dataSourceId) {
    throw new Error(
      "使用者 database 沒有 data source；請確認 NOTION_USERS_DATABASE_ID 是否正確。",
    );
  }

  return dataSourceId;
}

type NotionUserRecord = AuthUser & { password: string };

async function findUserById(loginId: string): Promise<NotionUserRecord | null> {
  const env = getEnv();
  const notion = getNotionClient();
  const dataSourceId = await resolveDataSourceId(env.NOTION_USERS_DATABASE_ID);

  const res: any = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "id",
      title: { equals: loginId },
    },
    page_size: 1,
  });

  const page = res.results?.[0];
  if (!page?.properties) return null;

  const id = getTitlePlain(page.properties, "id");
  const displayName = getRichTextPlain(page.properties, "displayName");
  const password = getRichTextPlain(page.properties, "password");

  if (!id || !password) return null;

  return {
    id,
    displayName: displayName ?? id,
    password,
  };
}

export async function authenticateWithNotion(
  loginId: string,
  password: string,
): Promise<AuthUser | null> {
  const record = await findUserById(loginId);
  if (!record) return null;
  if (record.password !== password) return null;

  return {
    id: record.id,
    displayName: record.displayName,
  };
}

export async function getNotionUserById(userId: string): Promise<AuthUser | null> {
  const record = await findUserById(userId);
  if (!record) return null;

  return {
    id: record.id,
    displayName: record.displayName,
  };
}
