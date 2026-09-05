# 吳平種苗廠 — 排程與生產出貨管理系統 系統分析與功能規格

> 版本 0.1（2026-09-05）。本文件同時是「分析報告」與「已實作內容的對照」：每一節末尾的 **實作對照** 指出程式碼位置。
>
> 定位：這不只是排程工具，而是一套**輕量的種苗場 ERP**——接單 → 排程 → 田間紀錄 → 出貨 → 匯出/對帳，全部在手機上完成，資料自動上雲端共用。

---

## 0. 專案約束（來自業主）

| 項目 | 決定 |
|---|---|
| 費用 | **全免費**（主機、資料庫、同步皆使用免費層，不需信用卡） |
| 使用者 | 小型團隊，10 人以內，共用同一份資料 |
| 裝置 | 手機瀏覽器為主，可「加到主畫面」當 App 使用（PWA） |
| 資料 | **雲端為主要儲存**，手機只是暫存；離線可操作，連線後自動上傳 |
| 介面 | 乾淨簡潔：4 個分頁（今日 / 批次 / 客戶 / 設定）+ 1 個新增按鈕 |
| 交貨方式 | 只有「客戶自取」與「本場送貨」，沒有貨運 |
| 交貨對象 | **同一批次可分給多個客戶**（各自盤數、交貨方式、單價），出貨逐一記錄 |

---

## 1. 種苗生產週期與排程關鍵要素

### 1.1 生命週期節點（穴盤苗）

| # | 節點 | 說明 | 系統欄位 |
|---|---|---|---|
| 1 | 接單 / 排程 | 客戶下單，確定作物、品種、盤數、目標交苗日 | `orderDate`, `targetShipDate` |
| 2 | 浸種 / 催芽 | 部分作物（番茄、甜椒、瓜類）需先浸種或催芽 1–3 天；十字花科通常直播 | `soakDate` / `actualSoakDate` |
| 3 | 播種 | 介質裝盤 → 播種 → 覆土 → 澆水 → 進發芽室或直接上床 | `sowDate` / `actualSowDate` |
| 4 | 移穴 / 移床 | 發芽後移出發芽室、補苗、換床位 | 事件 `move` |
| 5 | 苗床管理 | 澆水、施肥、病蟲害防治、巡視 | 事件 `water` `fertilize` `pest` `inspect` |
| 6 | 損耗 | 發芽不良、徒長、病害、天災造成的盤數損失 | 事件 `loss` → 加總為 `lossTrays` |
| 7 | 健化（煉苗） | 出貨前 3–7 天減水、增光、降溫，提高定植存活率 | `hardenDate` / `actualHardenDate` |
| 8 | 可出貨日 | 苗齡到達、葉數達標（高麗菜 4–5 片本葉） | `readyDate` |
| 9 | 出貨 / 交苗 | 依交貨對象逐一出貨（可分次），全部出完自動結案；也可「剩餘不出貨，結案」 | `orders[].shippedTrays / shippedDate`, `actualShipDate`, `shippedTrays` |

### 1.2 排程邏輯（以高麗菜 128 穴為例）

作物主檔參數（可在「設定 → 產品」修改）：

| 參數 | 高麗菜預設 | 說明 |
|---|---|---|
| 苗期天數 `seedlingDays` | 28 | 播種 → 可交苗（夏季 25、冬季 30–35） |
| 浸種天數 `soakDays` | 0 | 不需浸種 |
| 健化天數 `hardenDays` | 5 | 出貨前開始健化 |
| 預估損耗率 `expectedLossRate` | 5% | 用於預估育成株數 |
| 預設穴盤 `defaultTrayCells` | 128 | |

**倒推（輸入目標交苗日）**

```
可出貨日 readyDate  = 目標交苗日 − 安全緩衝天數(bufferDays, 預設 0)
播種日   sowDate    = readyDate − seedlingDays
浸種日   soakDate   = sowDate − soakDays          （soakDays > 0 才有）
健化日   hardenDate = readyDate − hardenDays
```

範例：目標交苗 10/5、苗期 28、健化 5、緩衝 0
→ 可出貨 10/5、播種 **9/7**、健化開始 **9/30**。

**順推（輸入播種日）**

```
readyDate      = sowDate + seedlingDays
hardenDate     = readyDate − hardenDays
targetShipDate = readyDate + bufferDays
```

**其他自動計算**

```
預計育成株數 targetPlants = 穴數 × 盤數 × (1 − 預估損耗率)   例：128 × 10 × 0.95 = 1,216
實際損耗率              = 累計損耗盤數 ÷ 總盤數
苗齡（天）              = 今天 − (實際播種日 ?? 預計播種日)
預估金額                = (實際出貨盤數 ?? 總盤數) × 單價
```

**批次編號**：`B` + 播種日 YYMMDD + 流水號，例 `B260907-01`。用播種日而非接單日，是因為現場人員都以「哪天播的」認批。

**今日待辦產生規則**：每個未完成批次，取「最早一個尚未完成且到期（含逾期）」的里程碑（浸種 → 播種 → 健化 → 出貨），逾期天數以紅色提示。

> **實作對照**：`src/lib/schedule.ts`（`backward` / `forward` / `targetPlants` / `buildTodos` / `nextBatchId`）。

---

## 2. 核心資料模型（Data Schema）

### 2.1 資料表

**Crop 產品／作物主檔**

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | string | UUID |
| name | string | 高麗菜、花椰菜… |
| seedlingDays / soakDays / hardenDays | number | 排程天數 |
| expectedLossRate | number | 0–1 |
| defaultTrayCells | number | 預設穴盤規格 |
| varieties | string[] | 常用品種，表單快速帶入 |
| sortOrder, active | | 顯示順序、是否停用 |

**Customer 客戶**

| 欄位 | 說明 |
|---|---|
| id, name | |
| phone | 手機（詳情頁一鍵撥打） |
| deliveryMethod | `pickup` 客戶自取 / `deliver` 本場送貨（建批次時自動帶入） |
| address | 送貨地址 |
| note | 收貨習慣、結帳方式 |
| active | 停用後不出現在下拉 |

**Location 溫室／床位**：`id, name, active`

**Batch 生產批次**（核心表）

| 欄位群 | 欄位 |
|---|---|
| 識別 | `id`（批次編號）, `status` |
| 產品 | `cropId, cropName, variety, trayCells, trayCount, expectedLossRate, targetPlants` |
| 交貨對象 | `orders: BatchOrder[]`，每筆 `{customerId, customerName, trays, deliveryMethod, unitPrice?, shippedTrays, shippedDate?}`；`customerName` 為摘要字串供搜尋 |
| 位置 | `locationId, locationName` |
| 預計日期 | `orderDate, soakDate?, sowDate, hardenDate, readyDate, targetShipDate` |
| 實際日期 | `actualSoakDate?, actualSowDate?, actualHardenDate?, actualShipDate?` |
| 結果 | `shippedTrays?, lossTrays` |
| 其他 | `note, createdAt, updatedAt, deleted`（軟刪除，供同步） |

`status`：`planned` 排程中 → `soaking` 浸種催芽 → `growing` 苗床管理 → `hardening` 健化中 → `ready` 可出貨 → `shipped` 已出貨；另有 `cancelled`。

**BatchEvent 作業紀錄**：`id, batchId, type, date, qty?, orderId?, customerName?, note?, createdAt, updatedAt, deleted`（出貨事件帶客戶）
`type`：`soak | sow | move | harden | ship | water | fertilize | pest | inspect | loss | note`

**AppSettings**：`farmName, sheetsWebhookUrl, sheetsToken, supabaseUrl, supabaseAnonKey, lastSyncAt`

**SyncQueue**：每次寫入記一筆 `{table, rowId, op, at}`，同步成功後清除。

冗餘欄位（`cropName`、`customerName`、`locationName`）是刻意設計：匯出 CSV 與離線顯示不需 JOIN，主檔改名也不會改寫歷史批次。

### 2.2 手機端輸入方式對照（降低打字錯誤）

| 欄位 | 輸入方式 | 原因 |
|---|---|---|
| 作物 | **下拉選單**（選後自動帶入苗期、損耗率、穴盤、品種） | 一次帶入 5 個欄位 |
| 品種 | 下拉 + 可自由輸入（datalist） | 常用品種一鍵，新品種也能打 |
| 穴盤規格 | **大按鈕晶片**（50/72/105/128/200/288） | 現場常用值固定 |
| 盤數、損耗%、苗期天數、緩衝天數 | **＋／－ 步進器** + 數字鍵盤 | 戴手套也能按 |
| 客戶、床位 | 下拉 + 旁邊「＋」快速新增 | 不需離開表單 |
| 交貨對象 | 「＋ 新增」抽屜：客戶下拉、盤數（預設帶入未分配盤數）、交貨方式（隨客戶帶入）、單價 | 一批多客戶不需重複建批次 |
| 日期 | 原生日期選擇器（手機自帶滾輪） | |
| 排程日期 | **唯讀自動計算**，只改交苗日或播種日 | 避免手算錯 |
| 作業紀錄類型 | 晶片 | |
| 批次編號 | 系統自動產生 | |

> **實作對照**：`src/lib/types.ts`（型別）、`src/lib/db.ts`（IndexedDB schema、預設主檔）、`src/pages/BatchForm.tsx`（表單）。

---

## 3. 手機版操作體驗（UI/UX for Mobile）

農事現場條件：單手、強光、手指有泥土或戴手套、網路不穩、常常只有 10 秒可以操作。

| 原則 | 本系統作法 |
|---|---|
| 點擊目標 ≥ 48px | 所有按鈕、輸入框最小高度 52px；底部分頁 64px |
| 單手可及 | 主要動作在**底部**：新增批次浮動按鈕、底部分頁、動作用「底部抽屜（bottom sheet）」而不是置中彈窗 |
| 強光下可讀 | 深綠／白高對比、字體 17px 起、狀態用色塊徽章不用細線 |
| 少打字 | 見 2.2；一個批次從頭到尾只需要打「盤數」與「日期」 |
| 一鍵完成 | 今日頁每張待辦卡一顆「✓ 完成播種」，兩下完成紀錄 |
| 錯誤可回復 | 刪除皆為軟刪除；主檔停用不刪除；有 JSON 備份還原 |
| 離線 | PWA Service Worker 快取整個 App；資料先寫本機 IndexedDB，連線後自動上傳 |
| 不用登入 | 10 人小團隊用「共用密語」而非帳號密碼，減少現場登入摩擦（見 §4 風險說明） |
| 分頁極簡 | 今日（做事）/ 批次（查）/ 客戶（聯絡）/ 設定（很少進） |
| 一鍵撥打 | 客戶與批次詳情有 `tel:` 連結 |

未來可加：語音輸入備註、拍照記錄病蟲害（見 TODO）。

> **實作對照**：`src/styles.css`、`src/components/ui.tsx`（Sheet / Stepper / Chips）。

---

## 4. 雲端同步與資料匯出方案

### 4.1 兩條路線比較

| 面向 | A. Google Sheets（Apps Script Web App） | B. Supabase（Postgres） |
|---|---|---|
| 費用 | **完全免費**，Google 帳號即可，無信用卡 | 免費層（500MB、暫停閒置專案 7 天後需手動喚醒） |
| 建置難度 | 貼一段 Apps Script、按「部署」，5 分鐘 | 建專案、跑 SQL、設 RLS，30 分鐘 |
| 老闆看資料 | **直接開 Google 試算表**，會自動多一張「批次總表」可讀工作表，可直接做樞紐、圖表 | 需再接 Sheets/Looker 或自建報表 |
| 即時性 | 每次操作後 2 秒自動上傳；每 5 分鐘、回到前景時拉回別人的更新 | 同上，另可開 Realtime 秒級推送 |
| 併發衝突 | 以 `updatedAt` 後寫者勝（LWW）；Apps Script 有 Lock 防止同時寫壞 | 同 LWW；DB 交易保證 |
| 資料量上限 | 單表 1,000 萬儲存格；小型種苗場十年也用不完 | 500MB 免費層 |
| 安全 | 共用密語 Token 放在 Script 內；網址 + 密語外洩＝可讀寫 | anon key 外洩＝可讀寫（除非做 Auth） |
| 離線 | 由 App 端 IndexedDB + 佇列處理，兩案相同 | 相同 |
| 風險 | Apps Script 每日執行配額（免費帳號 90 分鐘/日），10 人足夠 | 專案閒置暫停 |

### 4.2 建議

**第一階段採用 A（Google Sheets）**：零成本、老闆可直接用試算表看報表、最容易讓 10 人團隊共用（分享一條「設定連結」即可）。
**B 保留為升級路徑**：程式已內建 Supabase 同步器，未來若要做帳號權限、Realtime、或資料量變大，只要在設定頁填入 URL/anon key 即可切換（表結構為 `id / updated_at / deleted / data jsonb`，不需改前端）。

### 4.3 同步機制（已實作，兩案共用）

1. 每次寫入（批次／紀錄／主檔）→ 存本機 IndexedDB + 記入 `syncQueue`。
2. 佇列有資料 → 2 秒後自動 `push`（合併連續操作）；同時帶 `since=lastSyncAt` 做 `pull`。
3. 觸發時機：資料變動、網路恢復、App 回到前景、開啟 App、每 5 分鐘。
4. 衝突：同一 id 比 `updatedAt`，新的蓋舊的；刪除用 `deleted=1` 軟刪除同步。
5. 頂欄徽章顯示狀態：`⚠ 未連雲端`（黃，點擊去設定）/ `☁ n 筆待傳` / `⏳ 同步中` / `☁ 已同步 12:30` / `⚠ 同步失敗，重試`。
6. 新手機加入：開啟團隊設定連結 → `since` 為空 → 拉回全部資料。

### 4.4 匯出

* CSV（UTF-8 BOM，Excel 直接開中文不亂碼）：批次總表、作業紀錄。手機上走 Web Share → 可直接存到 Google Drive、傳 LINE。
* JSON 全量備份／還原（設定 → 備份與還原）。
* Google Sheets 方案本身就是即時的雲端 Excel。

> **實作對照**：`src/lib/sync.ts`、`src/lib/autosync.ts`、`src/lib/export.ts`、`docs/google-apps-script.md`、`docs/apps-script/Code.gs`、`docs/supabase.sql`。

---

## 5. 技術棧與 MVP

### 5.1 技術棧

| 層 | 選擇 | 理由 |
|---|---|---|
| 前端 | **Vite + React 18 + TypeScript** | 建置快、生態成熟、TypeScript 保護資料欄位 |
| 本機儲存 | **Dexie (IndexedDB)** + `dexie-react-hooks` | 離線優先、`useLiveQuery` 畫面自動更新 |
| PWA | `vite-plugin-pwa` (Workbox) | 加到主畫面、離線開啟、自動更新 |
| 路由 | 自製 hash router（60 行） | 不需要 react-router 的體積；靜態主機免設定 |
| 樣式 | 純 CSS 變數（無 UI 框架） | 體積小、完全掌控觸控尺寸 |
| 日期 | dayjs | 2KB |
| 雲端 | Google Apps Script（主）/ Supabase JS（選，動態載入） | 見 §4 |
| 主機 | **Cloudflare Pages** 或 **GitHub Pages**（免費、HTTPS、PWA 必須 HTTPS） | 見 README |

打包後約 150KB gzip（不含 Supabase，需要時才載入）。

### 5.2 MVP 範圍（本版已完成）

- [x] 作物／客戶／床位主檔（可新增、停用）
- [x] 新增批次：倒推／順推排程、自動批號、預估株數、交貨方式、單價
- [x] 今日待辦：到期／逾期里程碑一鍵完成，未來 7 天預告
- [x] 批次列表：篩選（育苗中／可出貨／已出貨）、搜尋、進度條
- [x] 批次詳情：時間軸、實際日期、作業紀錄（損耗／澆水／施肥／病蟲害／移床／巡視）、出貨盤數、金額
- [x] 客戶頁：姓名、手機（一鍵撥打）、交貨方式、地址、備註
- [x] 離線 PWA、自動雲端同步、同步狀態徽章、團隊設定連結
- [x] CSV 匯出、JSON 備份還原
- [x] Google Sheets 後端（Apps Script）、Supabase 後端（SQL）

### 5.3 建置與部署步驟

```bash
npm install
npm run dev          # 本機開發，手機同 Wi-Fi 可用 http://<電腦IP>:5173 測
npm run build        # 產出 dist/
```

免費部署到 Cloudflare Pages：把專案推到 GitHub → Cloudflare Pages「連接 Git」→ Build command `npm run build`、Output `dist` → 取得 `https://xxx.pages.dev`。手機 Chrome/Safari 開啟 → 「加到主畫面」。

### 5.4 參考外部分析報告（Gemini）

業主提供的 Gemini 分析報告偏向大型設施農場（IoT、積溫模型、苗床熱點圖、條碼刷卡）。依業主指示「太複雜的先不列入，最多人會用到的才先放」，本版只採納：美生菜（結球萵苣）作物主檔（苗期 22 天、播前預措 1 天）。其餘（發芽率普查與補播建議、種子批號追溯、作物管理要點提示、GDD 積溫預測、苗床熱點圖、QR 標籤、REI 鎖區、甘特圖）全部列入 `docs/TODO.md`「待討論」，之後逐項討論再加。

### 5.5 參考外部分析報告（GPT 深度研究）

業主提供的 GPT 報告《種苗場排程紀錄頁面與系統建置藍圖》偏向中大型場的完整 ERP（訂單／批次／植床三物件、週看板、QR 掃碼、品質四關卡、權限稽核、法規欄位）。與本版重疊且已具備的：訂單交期回推播期、一批次對多客戶（本版以「交貨對象」實作，出貨逐筆分配可追回客戶）、手機少填字、資料匯出備份。依「先放最多人會用的」原則，其餘列入 `docs/TODO.md` 待討論：拆批／合批、品質關卡（發芽／成活／出貨前苗況／裝車確認）、修改稽核軌跡、床位容量、種子與資材批號、種苗標示法規欄位、QR 掃碼、權限角色。報告中對苗期的建議（高麗菜 25–30 天、美生菜 128 格約 20–21 天）與本版預設一致，可在「設定 → 產品」依場內實績校正。

### 5.6 下一階段（見 `docs/TODO.md`）

出貨單範本輸出、拍照紀錄、床位容量規劃、種子庫存、每週報表推播等。
