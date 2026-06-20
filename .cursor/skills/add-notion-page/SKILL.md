---
name: add-notion-page
description: >-
  Add a new Notion-backed info page to trip-flow (route, API key, Nav, NotionPageView).
  Use when the user asks to add, connect, or wire up a new Notion page, info page,
  or navigation item for content from Notion (e.g. 飛機資訊, 住宿資訊, 新頁面).
---

# 新增 Notion 資訊頁（trip-flow）

依既有 **飛機資訊 / 住宿資訊** 模式新增一個從 Notion 拉內容的頁面。

本專案已支援 **multi-trip**：各旅行的 page ID 優先寫在 **Notion Trips database**，程式透過 `/:tripSlug` 路由與 `GET /api/trips/:slug/pages/:key` 讀取。

## 先判斷情境

| 情境 | 要做的事 |
|------|----------|
| **A. 新頁面類型**（第一次出現，如「交通資訊」） | 改程式 + Notion Trips DB 加欄位（下方「Agent 實作步驟」） |
| **B. 既有頁面類型，套到新旅行** | **只改 Notion**：在該 trip 列填 `{key}_page_id`、分享頁面給 integration；**不需改程式** |

## 架構約定（必守）

| 層級 | 用途 | 檔案 |
|------|------|------|
| 旅行 context | 提供 `slug`、旅行 meta | `src/trip/TripContext.tsx` |
| 旅行 Layout | `TripProvider` + 頂部 Nav | `src/components/Layout/TripLayout.tsx` |
| 頁面殼層 | 薄 wrapper，只傳 `pageKey` | `src/pages/{Name}Page.tsx` |
| 內容呈現 | 共用 Notion 淺色版型 + 快取按鈕 | `src/components/NotionPage/NotionPageView` |
| API（主路徑） | `GET /api/trips/:slug/pages/:key` | `server/notionPage.ts` → `handleTripNotionPage` |
| Trip registry | 解析 `{key}_page_id` | `server/trips/notionTrips.ts`、`server/trips/types.ts` |
| 區塊轉 HTML | callout、toggle、heading 等 | `server/notionPageBlocks.ts` |

**不要**為每個 Notion 頁另寫 fetch / HTML 邏輯；**不要**跳過 `TripLayout`；**不要**自建深色 Notion 主題（已統一為專案淺色 `--bg` / `--text`）。

> 舊版 `GET /api/pages/:key`（`handleNotionPage`）與 `.env` 的 `NOTION_{KEY}_PAGE_ID` 仍保留作 fallback，但新功能應以 trip-scoped 路徑為準。

## 實作前先向使用者確認

1. **頁面中文名稱**（導覽列顯示，如「交通資訊」）
2. **路由 path**（kebab-case，如 `transport` → `/:tripSlug/transport`）
3. **API page key**（小寫英文，與路由一致，如 `transport`）
4. **Notion Trips DB 欄位名**（慣例：`{key}_page_id`，如 `transport_page_id`）
5. **Notion 頁面 URL 或 page ID**（32 位 hex；至少一筆 trip 要填）
6. **導覽 icon**（沿用 `NavIcons.tsx` 風格的新 SVG，或指定語意）

## Agent 實作步驟（情境 A：新頁面類型）

### 1. 契約 `shared/api/pages.ts`

- [ ] `PageKeySchema` 的 `z.enum([...])` 加入新 key
- [ ] 確認 `PageSuccessResponseSchema` / `PageResponseSchema` 仍適用（通常不需改）

### 2. Trip registry `server/trips/`

- [ ] `server/trips/types.ts`：`TripConfig` 加入 `{key}PageId: string | null`；`PAGE_ID_FIELDS` 加入 mapping（camelCase 欄位名 → PageKey）
- [ ] `server/trips/notionTrips.ts`：`TRIP_FIELDS` 加入 `"{key}_page_id"`；`parseTripPage()` / `applyEnvFallback()` 讀取新欄位

欄位命名慣例：

```
pageKey transport  →  Notion 欄位 transport_page_id  →  TripConfig.transportPageId
```

### 3. 後端 `server/notionPage.ts`

- [ ] `EnvSchema` 加入 `NOTION_{KEY_UPPER}_PAGE_ID`（optional，fallback 用）
- [ ] `DEFAULT_PAGE_IDS` 加入該 key（預設可為 `""`）
- [ ] `resolvePageIdFromEnv()` 加入對應分支（trip DB 欄位為空時 fallback）
- [ ] `resolvePageIdFromTrip()` 透過 `PAGE_ID_FIELDS` 自動解析，通常**不需**另改

`server/index.ts` 已有 `app.get("/api/trips/:slug/pages/:key", handleTripNotionPage)`，通常不需改。

### 4. 前端頁面 `src/pages/{PascalCase}Page.tsx`

```tsx
import { NotionPageView } from "../components/NotionPage";

export function TransportPage() {
  return <NotionPageView pageKey="transport" />;
}
```

`NotionPageView` 已透過 `useTrip()` 組出 `/api/trips/${slug}/pages/${pageKey}`，**不需**改 fetch 邏輯。

### 5. 路由 `src/App.tsx`

在 `<Route path="/:tripSlug" element={<TripLayout />}>` 內新增：

```tsx
<Route path="transport" element={<TransportPage />} />
```

### 6. 導覽列 `src/components/Nav/Nav.tsx`

- [ ] `NavIcons.tsx`：新增對應 SVG icon 元件
- [ ] `buildTripNavItems(tripSlug)` 加入一項，路徑用 `` `/${tripSlug}/transport` ``

**不要**改 `overviewNavItems`（總覽頁 `/` 只有「我的旅行」）。

### 7. `.env.example`（可選 fallback）

在「旅行設定 fallback」區塊加註解範例：

```env
# NOTION_TRANSPORT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 8. 驗證

```bash
npm run typecheck
curl -s "http://localhost:3001/api/trips/kyoto-tokyo-2026-summer/pages/{key}?refresh=1" | head -c 400
```

確認 `title` 與 Notion 頁面標題一致；瀏覽器開 `/{tripSlug}/{path}` 檢查版型與 `RefreshStatusButton` 快取狀態。

## 快取狀態（已共用，勿重寫）

前端使用 `src/lib/cacheStatus.ts` + `RefreshStatusButton`。Notion 頁對應：

| 情境 | `CacheStatus` |
|------|----------------|
| 請求中 | `Loading` |
| 304 | `Unchanged` |
| `meta.cached` | `ServerCached` |
| 新資料 | `Updated` |

後端 page cache key 含 trip slug：`${slug}:${key}:${pageId}`。

## Page ID 格式

Notion URL 末尾 32 位 hex，有無 dash 皆可；`normalizePageId()` 會處理。

範例：`https://www.notion.so/29fffcbed67380b19c3be90865c2c921` → `29fffcbed67380b19c3be90865c2c921`

## 完成後：必須提醒使用者（User Checklist）

**每次依此 skill 完成實作後，在回覆末尾以「你需要手動完成」區塊列出以下項目（逐項勾選說明，不可省略）：**

```markdown
## 你需要手動完成

- [ ] **Notion Trips DB**：新增 `{key}_page_id` 欄位（若尚未有）；各 trip 列填入對應 page ID
- [ ] **Notion 權限**：該資訊頁 → ⋯ → 連結 → 加入 integration「trip flow」（未分享會 500）
- [ ] **（可選）`.env` fallback**：若需舊版 `/api/pages/:key` 或 DB 欄位為空時的後備，加入 `NOTION_{KEY}_PAGE_ID`
- [ ] **確認 page ID**：從 Notion「複製連結」取 URL 末尾 32 碼
- [ ] **重新整理頁面**：瀏覽器到 `/{tripSlug}/{path}` 點右上角快取按鈕強制更新
- [ ] **目視確認**：標題、callout、摺疊「詳細」等區塊是否與 Notion 一致
```

若使用者尚未提供 page ID，提醒先建立/整理好 Notion 內容再填 Trips DB。

## 常見問題

| 症狀 | 原因 | 處理 |
|------|------|------|
| 標題是別的頁面 | page ID 錯或 integration 無權限 | 檢查 Trips DB 欄位與 Notion 分享 |
| 404 找不到此旅行 | slug 錯或 Trips DB 無該列 | 檢查 `title`（slug）與 `NOTION_TRIPS_DATABASE_ID` |
| 改 Trips DB 沒變 | server 有 5 分鐘 config cache | 重啟 server 或等 TTL；API 加 `?refresh=1` |
| 區塊缺漏 | 未支援的 block type | 擴充 `server/notionPageBlocks.ts` |

## 參考實例

- 飛機：`pageKey=flight`，路由 `/:tripSlug/flight`，Trips DB 欄位 `flight_page_id`
- 住宿：`pageKey=accommodation`，路由 `/:tripSlug/accommodation`，Trips DB 欄位 `accommodation_page_id`
