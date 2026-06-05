import "dotenv/config";
import { Client } from "@notionhq/client";

function getNotionToken() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("缺少環境變數 NOTION_TOKEN");
  return token;
}

export function getNotionClient() {
  return new Client({ auth: getNotionToken() });
}

