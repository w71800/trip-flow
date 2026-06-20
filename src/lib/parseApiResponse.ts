import type { z } from "zod";
import { ZodError } from "zod";
import { formatZodError, parseApiPayload } from "@shared/api/parsePayload";

export async function parseApiResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("無法解析伺服器回應");
  }

  try {
    return parseApiPayload(schema, json);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new Error(`資料格式錯誤：${formatZodError(e)}`);
    }
    throw e;
  }
}
