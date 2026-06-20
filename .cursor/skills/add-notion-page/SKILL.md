---
name: add-notion-page
description: >-
  Add a new Notion-backed info page to trip-flow (route, API key, Nav, NotionPageView).
  Use when the user asks to add, connect, or wire up a new Notion page, info page,
  or navigation item for content from Notion (e.g. 飛機資訊, 住宿資訊, 新頁面).
---

# 新增 Notion 資訊頁（trip-flow）

依既有 **飛機資訊 / 住宿資訊** 模式新增一個從 Notion 拉內容的頁面。

## 架構約定（必守）

| 層級 | 用途 | 檔案 |
|------|------|------|
| 全站 Layout | 頂部導覽列 | `src/components/Layout/Layout.tsx` |
| 頁面殼層 | 薄 wrapper，只傳 `pageKey` | `src/pages/{Name}Page.tsx` |
| 內容呈現 | 共用 Notion 淺色版型 + 快取按鈕 | `src/components/NotionPage/NotionPageView` |
| API | `GET /api/pages/:key` | `server/notionPage.ts` |
| 區塊轉 HTML | callout、toggle、heading 等 | `server/notionPageBlocks.ts` |

**不要**為每個 Notion 頁另寫 fetch / HTML 邏輯；**不要**跳過 `Layout`；**不要**自建深色 Notion 主題（已統一為專案淺色 `--bg` / `--text`）。

## 實作前先向使用者確認

1. **頁面中文名稱**（導覽列顯示，如「交通資訊」）
2. **路由 path**（kebab-case，如 `transport` → `/transport`）
3. **API page key**（小寫英文，與路由一致，如 `transport`）
4. **Notion 頁面 URL 或 page ID**（32 位 hex）
5. **導覽 icon**（沿用 `NavIcons.tsx` 風格的新 SVG，或指定語意）

## Agent 實作步驟

### 1. 契約 `shared/api/pages.ts`

- [ ] `PageKeySchema` 的 `z.enum([...])` 加入新 key
- [ ] 確認 `PageSuccessResponseSchema` / `PageResponseSchema` 仍適用（通常不需改）

### 2. 後端 `server/notionPage.ts`

- [ ] `EnvSchema` 加入 `NOTION_{KEY_UPPER}_PAGE_ID`（optional string）
- [ ] `DEFAULT_PAGE_IDS` 加入該 key（預設可為 `""`）
- [ ] `resolvePageId()` 加入對應分支：讀 `env.NOTION_{KEY}_PAGE_ID`，無值時拋錯或 fallback
- [ ] `buildPagePayload()` 回傳前已由 `PageSuccessResponseSchema.parse()` 驗證；回應用 `sendJson`

> `PageKeySchema` 已移至 `shared/api/pages.ts`，勿在 `notionPage.ts` 重複定義。

環境變數命名：`NOTION_FLIGHT_PAGE_ID` → 新頁用 `NOTION_{SCREAMING_SNAKE}_PAGE_ID`（key `transport` → `NOTION_TRANSPORT_PAGE_ID`）。

`server/index.ts` 已有 `app.get("/api/pages/:key", handleNotionPage)`，通常不需改。

### 3. 前端頁面 `src/pages/{PascalCase}Page.tsx`

```tsx
import { NotionPageView } from "../components/NotionPage";

export function TransportPage() {
  return <NotionPageView pageKey="transport" />;
}
```

### 4. 擴充 `NotionPageView` 的 `pageKey`

`PageKey` 型別來自 `@shared/api/pages`（隨 `PageKeySchema` 自動更新）。若 TypeScript 報錯，確認 `shared/api/pages.ts` 已加入新 key。

### 5. 路由 `src/App.tsx`

在 `<Route element={<Layout />}>` 內新增：

```tsx
<Route path="transport" element={<TransportPage />} />
```

### 6. 導覽列 `src/components/Nav/`

- [ ] `NavIcons.tsx`：新增對應 SVG icon 元件
- [ ] `Nav.tsx`：`navItems` 加入 `{ to: "/transport", label: "交通資訊", end: false, Icon: TransportIcon }`

### 7. `.env.example`

```env
# NOTION_TRANSPORT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 8. 驗證

```bash
npm run typecheck
curl -s "http://localhost:3001/api/pages/{key}?refresh=1" | head -c 400
```

確認 `title` 與 Notion 頁面標題一致；瀏覽器開 `/{path}` 檢查版型與 `RefreshStatusButton` 快取狀態。

## 快取狀態（已共用，勿重寫）

前端使用 `src/lib/cacheStatus.ts` + `RefreshStatusButton`。Notion 頁對應：

| 情境 | `CacheStatus` |
|------|----------------|
| 請求中 | `Loading` |
| 304 | `Unchanged` |
| `meta.cached` | `ServerCached` |
| 新資料 | `Updated` |

## Page ID 格式

Notion URL 末尾 32 位 hex，有無 dash 皆可；`normalizePageId()` 會處理。

範例：`https://www.notion.so/29fffcbed67380b19c3be90865c2c921` → `29fffcbed67380b19c3be90865c2c921`

## 完成後：必須提醒使用者（User Checklist）

**每次依此 skill 完成實作後，在回覆末尾以「你需要手動完成」區塊列出以下項目（逐項勾選說明，不可省略）：**

```markdown
## 你需要手動完成

- [ ] **Notion 權限**：在 Notion 開啟該頁 → ⋯ → 連結 → 加入 integration「trip flow」（未分享會 500 或抓到錯誤頁）
- [ ] **`.env`**：加入 `NOTION_{KEY}_PAGE_ID=<你的 page ID>`（`.env.example` 僅供參考，不會被程式讀取）
- [ ] **確認 page ID**：從 Notion「複製連結」取 URL 末尾 32 碼，與 `.env` 一致
- [ ] **重新整理頁面**：開發中改 `.env` 後端會自動重載；瀏覽器到 `/{path}` 點右上角快取按鈕強制更新
- [ ] **目視確認**：標題、callout、摺疊「詳細」等區塊是否與 Notion 一致
```

若使用者尚未提供 page ID，提醒先建立/整理好 Notion 內容再補 `.env`。

## 常見問題

| 症狀 | 原因 | 處理 |
|------|------|------|
| 標題是別的頁面 | page ID 錯或 integration 無權限 | 檢查 `.env` 與 Notion 分享 |
| 改 `.env` 沒變 | 舊版需重啟 server | 現已 `reloadEnv`；仍異常則重跑 `npm run dev` |
| 區塊缺漏 | 未支援的 block type | 擴充 `server/notionPageBlocks.ts` |

## 參考實例

- 飛機：`pageKey=flight`，路由 `/flight`，`NOTION_FLIGHT_PAGE_ID`
- 住宿：`pageKey=accommodation`，路由 `/accommodation`，`NOTION_ACCOMMODATION_PAGE_ID`
