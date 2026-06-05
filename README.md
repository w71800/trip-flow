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
```

## 啟動
```bash
npm run dev
```

然後打開：
- `http://localhost:5173`

畫面右上角有「重新渲染（抓最新 Notion）」按鈕；Notion 有改動後，按一下或重新整理即可反映。

