# 吳平種苗廠 育苗排程（Nursery Tracker）

手機優先的種苗場排程與生產出貨管理 PWA。接單 → 自動排程 → 田間紀錄 → 出貨 → 雲端共用／匯出，全程免費。

* 系統分析與規格：[docs/SPEC.md](docs/SPEC.md)
* 雲端同步設定（Google Sheets，免費）：[docs/google-apps-script.md](docs/google-apps-script.md)
* 待辦功能：[docs/TODO.md](docs/TODO.md)

## 功能

| 分頁 | 內容 |
|---|---|
| 今日 | 到期／逾期作業一鍵完成（浸種、播種、健化、出貨）、未來 7 天預告、同步狀態 |
| 批次 | 育苗中／可出貨／已出貨篩選、搜尋、進度條；詳情頁有交貨對象（可多個客戶、逐一出貨）、時間軸、作業紀錄、損耗、金額 |
| 客戶 | 姓名、手機（一鍵撥打）、交貨方式（自取／送貨）、地址、備註 |
| 設定 | 產品（作物）與育苗天數、床位、雲端同步、CSV 匯出、備份還原 |

新增批次只要選作物、按盤數、選交苗日，系統自動倒推播種日／健化日並產生批號。

## 本機開發

```bash
npm install
npm run dev
```

手機與電腦同一個 Wi-Fi 時，可用終端機顯示的 `http://<電腦IP>:5173` 在手機上測試。

## 免費部署（GitHub Pages，推 code 自動部署）

與 D:\YenTool 相同做法：推到 `main` → GitHub Actions 自動 `npm run build` → 發佈到 GitHub Pages。

* 網址：<https://luke820001.github.io/nursery-tracker/>
* 工作流程：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)
* 之後更新只要 `git push`，約 1 分鐘後上線；手機上的 PWA 會自動抓新版本。
* 手機 Chrome/Safari 開啟網址 → 瀏覽器選單 → **加到主畫面**。

若日後改用自訂網域或 Cloudflare Pages，把 `vite.config.ts` 的 `base` 改成 `'/'` 即可。

## 雲端同步

依 [docs/google-apps-script.md](docs/google-apps-script.md) 建好 Apps Script 後，在 App **設定 → 雲端同步** 貼上網址與密語。之後：

* 每次操作 2 秒後自動上傳；開啟 App、回到前景、網路恢復、每 5 分鐘自動拉回別人的更新。
* 頂欄徽章：`⚠ 未連雲端` / `☁ n 筆待傳` / `☁ 已同步 12:30` / `⚠ 同步失敗，重試`。
* 按「分享團隊設定連結」把連結傳給同事，同事開啟即自動加入。

進階：Supabase（[docs/supabase.sql](docs/supabase.sql)）在同一頁填入 URL / anon key 即可切換。

## 專案結構

```
src/
  lib/
    types.ts      資料模型
    db.ts         IndexedDB（Dexie）、預設主檔、寫入輔助、備份
    schedule.ts   排程倒推／順推、待辦、批號
    actions.ts    完成里程碑、新增事件
    export.ts     CSV、分享／下載
    sync.ts       Google Sheets / Supabase 同步
    autosync.ts   自動同步、狀態、團隊設定連結
  pages/          Today / Batches / BatchForm / BatchDetail / Customers / Settings
  components/     ui.tsx（路由、Sheet、Stepper、Chips…）、SyncBadge.tsx
docs/
  SPEC.md, TODO.md, google-apps-script.md, apps-script/Code.gs, supabase.sql
```
