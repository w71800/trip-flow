---
name: add-api
description: >-
  Add or extend a trip-flow BFF API endpoint with shared Zod contracts (schema,
  server sendJson, client parseApiResponse). Use when adding a new /api route,
  changing API response shape, or wiring frontend fetch to a new endpoint.
---

# 新增 / 擴充 API（trip-flow）

依 **shared Zod 契約 + Server 驗證 + Client 驗證** 模式實作。Notion 原始結構不得泄漏到前端。

## 架構（必守）

```
Notion / 其他資料源
        ↓  server adapter（notion*.ts、itinerary.ts 等）
   build*Payload() → SuccessResponseSchema.parse()
        ↓
   sendJson(res, Schema, data)     ← server 邊界
        ↓
   fetch → parseApiResponse(res, ResponseSchema)   ← client 邊界
        ↓
   React state / UI
```

| 層級 | 職責 | 典型檔案 |
|------|------|----------|
| 契約（唯一真相） | Zod schema + `z.infer` 型別 | `shared/api/{name}.ts` |
| Server adapter | 拉資料、正規化、組 payload | `server/{handler}.ts` |
| Server 送出 | runtime 驗證後 `res.json` | `server/sendJson.ts` |
| Client 接收 | runtime 驗證 fetch 結果 | `src/lib/parseApiResponse.ts` |
| Client 快取（若有） | localStorage schema | 同 `shared/api/` 或 consumer 旁 |

**不要**在前端 parse Notion blocks/properties。**不要**在前端重複手寫 response interface（用 `z.infer`）。**不要**用 `as SomeType` 斷言 API JSON。

## 實作步驟 checklist

### 1. 定義契約 `shared/api/{feature}.ts`

```ts
import { z } from "zod";
import { ApiErrorSchema } from "./common.js";

export const FooSuccessResponseSchema = z.object({
  ok: z.literal(true),
  // ...欄位
});

export const FooResponseSchema = z.discriminatedUnion("ok", [
  FooSuccessResponseSchema,
  ApiErrorSchema,
]);

export type FooSuccessResponse = z.infer<typeof FooSuccessResponseSchema>;
export type FooResponse = z.infer<typeof FooResponseSchema>;
```

- [ ] 成功與失敗用 `discriminatedUnion("ok", [...])`（`ok: true | false`）
- [ ] 在 `shared/api/index.ts` re-export
- [ ] 若有 localStorage 快取，加 `StoredFooCacheSchema`（參考 `StoredItineraryCacheSchema`）

### 2. Server handler

- [ ] 新增或擴充 `server/{feature}.ts` 的 `build*Payload()`，**回傳前** `FooSuccessResponseSchema.parse(...)`
- [ ] 註冊路由於 `server/index.ts`（若為新 endpoint）
- [ ] 所有 `res.json()` 改為 `sendJson(res, Schema, data)`
- [ ] 錯誤回應：`sendJson(res.status(4xx/5xx), ApiErrorSchema, { ok: false, error: "..." })`
- [ ] Server import 使用 `@shared/api/...js`（NodeNext 副檔名）

```ts
import { sendJson } from "./sendJson.js";
import { FooSuccessResponseSchema } from "@shared/api/foo.js";
import { ApiErrorSchema } from "@shared/api/common.js";

sendJson(res, FooSuccessResponseSchema, payload);
```

### 3. 前端 consumer

- [ ] `import { FooResponseSchema, type FooItem } from "@shared/api/foo"`
- [ ] `const json = await parseApiResponse(res, FooResponseSchema)`
- [ ] 判斷 `if (!json.ok) { ... error ... }`
- [ ] 快取讀寫用 shared schema 的 `safeParse` / `parse`

### 4. 驗證

```bash
npm run typecheck
curl -s "http://localhost:3001/api/..." | head -c 400
```

## 現有 API 契約（參考）

| Endpoint | 契約檔 | Success schema | Client |
|----------|--------|----------------|--------|
| `GET /api/itinerary` | `shared/api/itinerary.ts` | `ItinerarySuccessResponseSchema` | `ItineraryPage.tsx` |
| `GET /api/pages/:key` | `shared/api/pages.ts` | `PageSuccessResponseSchema` | `NotionPageView` |
| `GET /api/ticket` | `shared/api/auth.ts` | `TicketSuccessResponseSchema` | `TicketPage.tsx` |
| `POST /api/auth/login` 等 | `shared/api/auth.ts` | `LoginSuccessResponseSchema` 等 | `authClient.ts` |

## 與 Notion 頁的關係

新增 Notion **資訊頁**（`/api/pages/:key`）時：

1. 先依本 skill 擴充 `shared/api/pages.ts` 的 `PageKeySchema`
2. 再依 `.cursor/skills/add-notion-page/SKILL.md` 接路由、Nav、`.env`

## 常見問題

| 症狀 | 原因 | 處理 |
|------|------|------|
| Server 500 含 Zod 路徑 | payload 與 schema 不一致 | 修正 builder 或 schema |
| 前端「資料格式錯誤」 | 契約 drift 或舊 cache | 對齊 shared；清 localStorage |
| `@shared` runtime 找不到 | tsx 需從專案根目錄啟動 | `npm run dev`（勿在 `server/` 子目錄單獨跑） |

## 延伸閱讀

- 人類可讀總覽：根目錄 `README.md` →「API 契約與 Zod 驗證」
- 快取行為：`docs/caching-strategy.md`
