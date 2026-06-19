# Trip Flow (Notion -> RWD 行程卡片)

把 Notion 裡的「行程 flow」依 `next / previous` 關聯排序，並把每個行程對應到的「行程 page」內容渲染成卡片。

## 功能符合你的需求
- `next / previous` 用來串出行程順序
- 若行程沒有對應到「行程 page 連結」，則不顯示
- 每個行程用一張卡片呈現，卡片內會放入行程 page 的內容（轉成乾淨的 HTML 片段）
- RWD（用 CSS grid，自動適配手機/桌機）
- 下一次重新渲染會重新向 Notion 抓取最新資料

## 你需要準備
1. Notion 的 `Integration Token`（給 API 用）
2. 你的 flow 對應的 **Database ID**（或至少：程式要用到 `NOTION_FLOW_DATABASE_ID`）

> 程式會嘗試自動找出資料庫中的「title / next / previous / details(行程 page 連結)」欄位；若偵測失敗，可用環境變數手動指定。

> 註：`NOTION_FLOW_DATABASE_ID` 若你填的是「頁面 id」（頁面裡嵌了 `child_database`/database view），程式也會嘗試從該頁面找出 child database 再繼續。

## 設定環境變數
在專案根目錄建立 `.env`：

```bash
NOTION_TOKEN=secret_xxx
NOTION_FLOW_DATABASE_ID=240ffcbed67380a6a63bf247ee62444c

# 可選：如果自動偵測不到，請填實際欄位名稱
NOTION_FLOW_TITLE_PROPERTY=名稱
NOTION_FLOW_NEXT_PROPERTY=Next
NOTION_FLOW_PREVIOUS_PROPERTY=Previous
# 可選：若有獨立的「行程 page」關聯欄位才需要
# NOTION_FLOW_DETAILS_PROPERTY=行程 page

# 可選：微調渲染長度
NOTION_BLOCKS_MAX_RENDER=12
NOTION_BLOCKS_MAX_FETCH=60
NOTION_MAX_CARDS=50

# 可選：後端 port
PORT=3001

# 身份驗證（詳見下方「身份驗證架構」）
NOTION_USERS_DATABASE_ID=xxx
JWT_SECRET=change-me-to-a-long-random-string
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
AUTH_PROVIDER=notion
```

## 啟動
```bash
npm run dev
```

然後打開：
- `http://localhost:5173`

畫面右上角有「重新渲染（抓最新 Notion）」按鈕；Notion 有改動後，按一下或重新整理即可反映。

## 身份驗證架構

本專案提供登入機制，讓使用者能存取個人專屬資料（例如票券）。目前採 **Notion 管理帳號 + Express BFF 簽發 JWT** 的方案；架構預留 `AUTH_PROVIDER` 切換點，之後可遷移至 Supabase Auth 而不必大幅改動前端。

### 設計目標

- **公開頁面**：行程時間軸、飛機資訊、住宿資訊——所有人皆可瀏覽。
- **受保護頁面**：票券（`/ticket`）——需登入後才能進入。
- **使用者規模**：10 人以內，由管理者在 Notion 預建帳號，不開放公開註冊。
- **資料來源分離**：身份驗證走 Notion Users database；業務資料（票券等）之後也從 Notion 讀取，並以穩定的 `user.id` 對應。

### 整體架構

```
┌─────────────────────────────────────────────────────────────┐
│  React 前端                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐ │
│  │ LoginPage    │  │ ProtectedRoute │  │ AuthProvider    │ │
│  │ /login       │  │ （路由守衛）    │  │ useAuth()       │ │
│  └──────────────┘  └────────────────┘  └─────────────────┘ │
│         │                    │                    │          │
│         └────────────────────┴────────────────────┘          │
│                              │                               │
│                    authClient / apiFetch                     │
│                    localStorage 存 token                     │
└──────────────────────────────┼───────────────────────────────┘
                               │ Authorization: Bearer <accessToken>
┌──────────────────────────────┼───────────────────────────────┐
│  Express BFF（server/）       │                               │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │ requireAuth middleware（API 統一門關）                  │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                               │
│  ┌──────────────┐  ┌─────────▼────────┐  ┌───────────────┐  │
│  │ auth/routes  │  │ auth/jwt         │  │ providers/    │  │
│  │ login/refresh│  │ 簽發與驗證 token  │  │ notion.ts     │  │
│  └──────────────┘  └──────────────────┘  └───────┬───────┘  │
└──────────────────────────────────────────────────┼──────────┘
                                                   │ 登入時查詢
                                          ┌────────▼────────┐
                                          │ Notion Users DB │
                                          └─────────────────┘
```

### 兩層防護：路由守衛 vs API middleware

| 層級 | 實作 | 目的 |
|------|------|------|
| 前端 `ProtectedRoute` | 未登入時導向 `/login?redirect=...` | 使用者體驗 |
| 後端 `requireAuth` | 驗證 `Authorization` header，無效則 401 | **真正的安全邊界** |

前端路由守衛可被繞過（例如直接 `fetch('/api/ticket')`），因此受保護的 API 必須在 Express 掛上 `requireAuth` middleware。公開 API（`/api/itinerary`、`/api/pages/:key`）則不掛。

### Session 與 Token 策略

採 **localStorage + JWT（access + refresh）**：

| Token | 預設有效期 | 用途 |
|-------|-----------|------|
| `accessToken` | 1 小時（`JWT_ACCESS_EXPIRES_IN`） | 每次 API 請求帶在 `Authorization: Bearer` |
| `refreshToken` | 7 天（`JWT_REFRESH_EXPIRES_IN`） | access 過期時換發新 access token |

前端將 session 存在 `localStorage`（key：`trip_flow_session`），內含 `user`、`accessToken`、`refreshToken`、`expiresAt`。

- App 啟動時：`AuthProvider` 讀取 localStorage，若 access 過期則自動呼叫 `/api/auth/refresh`。
- API 請求時：`apiFetch` 自動帶 token；收到 401 時嘗試 refresh 並重試一次。
- 登出：清除 localStorage，並呼叫 `/api/auth/logout`（server 端為無狀態，不做 blacklist）。

Access token payload 含 `sub`（user id）、`displayName`、`type: "access"`；refresh token 含 `sub`、`type: "refresh"`。兩者皆以 `JWT_SECRET` 簽署（使用 [`jose`](https://github.com/panva/jose)）。

### Notion Users Database

在 Notion 建立使用者 database，並 share 給 integration。欄位：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | Title | 登入帳號（例如 `admin`） |
| `displayName` | Text | 顯示名稱（Nav 上顯示） |
| `password` | Text | 密碼（目前明文儲存，符合小團體內部使用情境） |

**登入時才向 Notion 查詢**，不做使用者快取。以 `id` 欄位 filter 比對帳號，再對照 `password`。

環境變數 `NOTION_USERS_DATABASE_ID` 填入此 database 的 ID。

### API 契約

```
POST /api/auth/login
  Body: { "id": "admin", "password": "admin" }
  → 200 { ok, user, accessToken, refreshToken, expiresAt }
  → 401 { ok: false, error: "invalid_credentials" }

POST /api/auth/refresh
  Body: { "refreshToken": "..." }
  → 200 { ok, accessToken, refreshToken, expiresAt }
  → 401

POST /api/auth/logout
  → 204

GET /api/auth/me
  Header: Authorization: Bearer <accessToken>
  → 200 { ok, user: { id, displayName } }
  → 401

GET /api/ticket          （需登入）
  Header: Authorization: Bearer <accessToken>
  → 200 { ok, message, user }
  → 401
```

登入失敗時，前端統一顯示「帳號或密碼錯誤」，不區分帳號不存在或密碼錯誤。

### 前端路由與導覽行為

| 路由 | 是否需登入 | 說明 |
|------|-----------|------|
| `/` | 否 | 行程時間軸 |
| `/flight` | 否 | 飛機資訊 |
| `/accommodation` | 否 | 住宿資訊 |
| `/login` | 否 | 登入頁（**無 Nav**） |
| `/ticket` | 是 | 票券（目前為 placeholder） |

- 未登入點 Nav「票券」→ `ProtectedRoute` 導向 `/login?redirect=/ticket`。
- 登入成功後：若有 `redirect` 參數則回到該路由；直接開 `/login` 則回到 `/`。
- Nav 永遠顯示「票券」連結；右側顯示「登入」或「{displayName} + 登出」。

### 程式碼結構

```
server/auth/
  types.ts              # AuthUser、Session 型別
  jwt.ts                # 簽發 / 驗證 access、refresh token
  middleware.ts         # requireAuth（API 統一門關）
  routes.ts             # login / refresh / logout / me / ticket handlers
  providers/
    notion.ts           # 登入時查 Notion Users DB

src/auth/
  types.ts              # 前端 Session 型別（與後端契約對齊）
  storage.ts            # localStorage 讀寫
  authClient.ts         # login / refresh / logout / ensureValidSession
  apiFetch.ts           # 帶 token 的 fetch，自動 refresh
  AuthContext.tsx       # AuthProvider、useAuth()
  ProtectedRoute.tsx    # 路由守衛

src/pages/
  LoginPage.tsx         # 登入表單
  TicketPage.tsx        # 受保護的票券頁（開發中）
```

### 身份驗證相關環境變數

```bash
# Notion Users database ID
NOTION_USERS_DATABASE_ID=xxx

# JWT 簽章密鑰（部署時請換成夠長的隨機字串）
JWT_SECRET=change-me-to-a-long-random-string

# Token 有效期（可選）
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Auth provider（目前為 notion；預留給之後切換 Supabase）
AUTH_PROVIDER=notion
```

### 之後遷移至 Supabase 的方向

架構上已預留無痛轉移的設計原則：

1. **前端只認 Session 契約**（`user` + token），不關心底層是 Notion 還是 Supabase。
2. **穩定的 `user.id`**：票券等個人資料以 `id` 對應；遷移時可將原 id 存入 Supabase `user_metadata.trip_flow_id`。
3. **`AUTH_PROVIDER` 環境變數**：之後在 server 端新增 `providers/supabase.ts`，切換 provider 即可；前端 API 路徑（`/api/auth/*`）可維持不變。

## 快取策略

專案已實作三層快取（本機 localStorage、伺服器 ETag/304、伺服器記憶體快取），用於在旅行期間減少 Notion API 與網路流量。詳見 [docs/caching-strategy.md](./docs/caching-strategy.md)。

