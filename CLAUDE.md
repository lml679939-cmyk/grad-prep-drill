# 推甄戰備室 — 專案交接文件

> 供下一個 AI 對話框快速了解專案現況，無需重新詢問使用者。
>
> **先讀這三段就能開始工作**：① 下方「專案概述」② 「★ 內容模型」的五條撰寫規則
> ③ 「★ 待辦」的 P0。若使用者說「繼續補內容」，直接照 P0 的順序做，程式碼不用動。

---

## 專案概述

**名稱**：推甄戰備室
**目標**：為研究所推甄準備管院五科。兩個需求，順序有意義——(1) 面試被問到專業知識時答得上來，(2) 銜接研究所課程。教材因此一律做成雙層（面試層／進階層）。
**起造日**：2026-08-09
**型態**：純前端 PWA，無後端、無帳號、無外部依賴
**資料**：全部存 localStorage（目標日期等設定皆可在 App 內調整）

---

## 本機路徑與指令

```
C:\Users\user\Downloads\生成式AI人文導論\我自己想要開發的專案\管理學相關題庫\
```

```bash
python serve.py     # 本機預覽，port 8770（.claude/launch.json 已設定）
```

**已部署**：GitHub Pages，`main` 分支根目錄。沒有建置步驟，`git push` 後約一兩分鐘自動更新。

**推 GitHub 前一律先問過使用者**——這是對外發布的動作，不要自己推。

---

## 檔案結構

```
管理學相關題庫/
├── index.html          # 單頁四分頁 + SVG 圖示庫（<symbol>）
├── manifest.json       # PWA 設定
├── sw.js               # Service Worker（Stale-While-Revalidate）
├── serve.py            # 開發伺服器（強制 no-cache）
├── README.md           # 給使用者看的使用說明 + 67 天讀書排程
├── .claude/launch.json # port 8770
├── css/
│   ├── tokens.css      # 色票與版面變數、五科配色、深色模式
│   └── style.css       # 版面與元件
├── js/
│   ├── app.js          # ★ 進入點：分頁路由、四個畫面渲染、設定、匯出匯入
│   ├── storage.js      # ★ localStorage 持久層、sanitize、匯出匯入
│   ├── srs.js          # ★ 間隔複習排程（SM-2 改良版）
│   ├── content.js      # 載入教材並攤平成四份索引
│   ├── plan.js         # 倒數、每日目標、進度、統計聚合
│   ├── ui.js           # DOM 工具、輕量 Markdown、Sheet／Modal／Toast
│   ├── flash.js        # 閃卡引擎
│   ├── quiz.js         # 選擇題引擎 + 錯題本
│   ├── essay.js        # 申論自評
│   └── interview.js    # 面試模擬 + 我的素材庫 + 各校側重
├── content/
│   ├── index.js        # 科目註冊表 + 通用面試題 + 各校側重
│   ├── marketing.js    # 行銷管理（第 1、5、6 章）
│   └── management.js   # 管理學（第 1、4、8 章）
│   （economics.js / statistics.js / finance.js 尚未建立）
└── icons/              # 192/512/maskable-512 PNG（Pillow 產生）
```

**沒有 stats.js**——原本規劃有，實作時發現統計聚合只有三個函式，併進 `plan.js`（`recentDays`／`accuracy`／`countdownText`）比多開一個近乎空的模組乾淨。

---

## 技術架構

| 項目 | 選擇 | 理由 |
|------|------|------|
| 框架 | 無，Vanilla JS + ES Modules | 沒有 build step 就沒有 node_modules，推上去即部署 |
| CSS | 原生 CSS + 變數 | 沿用既有專案規矩，且不想為離線 PWA 增加外部依賴 |
| Markdown | 自己寫 30 行（`ui.js` 的 `md()`） | 教材只用到 `**粗體**`、清單、段落三種語法，為此引入函式庫不划算 |
| 數學公式 | HTML + CSS 排版 | 統計／財管之後要用，但**不引入 KaTeX**——外部依賴會破壞離線 |
| 圖示 | 全 SVG `<symbol>`，不用 emoji | emoji 跨平台長相不一致，且無法吃 CSS 變數配色 |
| 儲存 | localStorage | 零成本零設定，無隱私疑慮 |

**外部依賴數量：0。**

---

## ★ 內容模型（動內容前務必先讀）

**核心決策：以「知識點」為中心，而非以「題目」為中心。**

一個知識點物件同時餵養四種練習模式。寫一個知識點約 15 分鐘，一次產出 2–4 張閃卡 + 3 題選擇 + 1 題申論 + 1 題口試。若四種模式各自維護資料，同樣的產出要花四倍時間——這是 67 天內兩科寫得完的唯一辦法。

```js
{
  id: 'mkt-05-01',              // 章節 id + 兩位序號
  title: '…',
  tags: ['必考', '核心'],        // '必考' 會被「只練必考」篩選到
  source: 'Kotler & Keller…',   // 出處學者，方便使用者對照課本抽查
  brief: '…',                   // 面試層：30 秒能講出口
  advanced: '…',                // 進階層：模型細節、限制、學術爭論
  example: '…',                 // 台灣實務案例
  terms:  [{ term, en, def, tip }],              // → 閃卡（tip 是「面試講法」）
  mcqs:   [{ q, options[4], answer, explain }],  // → 選擇題
  essays: [{ q, outline[], rubric[], sample }],  // → 申論自評
  oral:   [{ q, framework[], pitfall, schools }] // → 面試模擬
}
```

### 撰寫規則（違反會弄壞使用者的進度）

1. **練習項目的 id 由「知識點 id + 陣列位置」推導**（`c:<id>:<i>`、`q:<id>:<i>`…）。
   所以 `terms` / `mcqs` / `essays` / `oral` **一律往陣列尾端加**，不要插在中間，
   否則使用者已累積的 SRS 排程會整批錯位對到別題。
2. **章節與知識點 id 一經發布就不要改。**
3. **選擇題選項每次出題都會洗牌**，所以**詳解裡不要寫「選項 (B) 錯在…」**。
4. `brief` / `advanced` / `example` 支援的語法只有 `**粗體**`、`- ` 清單、`1. ` 編號清單、空行分段。渲染前會先跳脫 HTML，內容打錯不會弄壞版面。
5. **章節 id 已按最終十章預留**（`mkt-01`…`mkt-10`、`mgt-01`…`mgt-10`），且章節物件帶顯式的 `no` 欄位。因此現在只有第 1、5、6 章時，畫面上仍正確顯示「第 5 章」而非「第 2 章」，之後補中間章節也不影響現有進度。

---

## ★ SRS 排程（`srs.js`，改動前務必先讀）

**不是標準 SM-2。** 原版設計給「終身保留」，熟題間隔會拉到好幾個月——但這個 App 服務的是一個有明確截止日的衝刺，排到考後才複習等於沒複習。兩項關鍵調整：

### 1. 間隔上限 = `min(21, 距離目標日的天數)`

保證每個項目在面試前至少再滾一輪。已驗證：目標日剩 3 天時，`intervalCap()` 回傳 3，連評四次「秒答」間隔仍停在 3。

### 2. 考前 `sprintDays`（預設 14）天自動進衝刺

`buildQueue()` 改為忽略到期日，用權重排序全刷：**錯題 +4 / 標記 +2 / 必考 +1**，同權重時 `staleness`（lapses 多、ease 低）優先。介面同步轉紅。

### 評分與間隔

四級：`0 忘記 / 1 勉強 / 2 會 / 3 秒答`

```
grade 0 → reps=0, lapses++, ease-0.2, interval=0（今天再來，且排回本輪隊尾）
grade≥1 → reps++, ease+[-0.15, 0, +0.15]
          reps 0→[1,1,2]  reps 1→[2,3,5]  reps≥2→max(prev+1, round(prev×factor))
          factor: 勉強 1.2 / 會 ease / 秒答 ease×1.25
          ease 夾在 [1.3, 2.8]，interval 夾在 intervalCap()
```

已驗證的成長序列（一路評「會」）：`1 → 3 → 8 → 20 → 21 → 21 …`

### ★ `newQuota()` 是每日目標與出題佇列的**單一來源**

```js
newQuota(remainingNew) = min(remainingNew, max(settings.dailyNewTarget, ceil(remainingNew / 剩餘天數)))
```

`plan.js` 算每日目標、`buildQueue()` 發新題，兩邊都呼叫它。**不要讓它們各自算**——第一版就是因為目標用「平攤值」而佇列用另一個 cap，出現「目標 10 題但佇列只給 6 題」這種永遠達不成的情況。

`dailyNewTarget` 是**基準不是上限**：題庫小、天數多時由它撐住（否則會算出「每天 1 張卡」這種不值得打開 App 的目標）；進度落後時平攤值會超過它，該追的量誠實呈現。

---

## 資料 Schema

localStorage key：`gradprep.v1`

```js
{
  schemaVersion: 1,
  settings: { targetDate, sprintDays, dailyNewTarget,
              mcqPerSession, cardPerSession, oralSeconds,
              textSize },                                  // html font-size（px），12–30
  srs:     { 'c:<conceptId>:<i>' | 'q:<conceptId>:<i>':
             { ease, interval, due, reps, lapses, last } },
  wrong:   { '<mcqId>': { streak, count, lastAt } },   // 連續答對 2 次才刪除
  starred: ['<conceptId>'],
  read:    { '<conceptId>': 'YYYY-MM-DD' },
  essayLog:[{ essayId, score, at, answer }],           // 保留最近 500 筆
  oralLog: [{ oralId, seconds, at }],                  // 保留最近 500 筆
  stories: [{ id, title, situation, action, result, theory }],
  daily:   { 'YYYY-MM-DD': { cards, mcqs, mcqRight, essays, oral, newConcepts } },
  streak:  { current, best, lastDay }
}
```

**`sanitize()` 是防禦式的**：一律夾範圍、退回預設值。已驗證塞入 `ease: 99`、`interval: 'abc'`、`starred: 'not-an-array'`、負數 streak 等爛值後 App 不會掛。

**日期一律用本地時區**（`storage.dateKey()`）。**不要改用 `toISOString()`**，那是 UTC，跨半夜會算錯天。

**匯入驗證刻意嚴格**：拒絕陣列、拒絕不含任何已知 key 的物件。第一版只檢查 `typeof === 'object'`，結果 JSON 陣列也會通過、sanitize 後變空白資料——使用者選錯檔案就會在看到「已匯入」的同時失去所有進度。這個 bug 已修，測試時請連帶回歸。

---

## 設計系統

```css
--indigo: #2E4374   /* 骨幹 */    --amber: #E08A3C   /* 強調 */
--paper:  #F7F5F0   /* 紙感底 */  --ink:   #1F2430
```

### ★ 可調字級（2026-08-09 加入）

使用者要求「把電腦拿遠一點也能看清楚」。作法是 **JS 把 `settings.textSize` 寫進 `html` 的 `font-size`**，全站字體一律用 `rem`，一個變數整頁縮放。五段：14 / 16 / 18 / 21 / 24 px（`storage.js` 的 `TEXT_SIZES`）。

三個實作要點，改版時不要弄丟：

1. **`--topbar-h` / `--tabbar-h` / `--maxw` 必須是 rem**，不能是 px。固定 px 在 24px 字級下會把文字切掉；`--maxw` 用 rem 還有個好處是桌機放大字時內容欄跟著加寬（45rem：16px→720px、24px→1080px），不會變成大字擠窄欄。
2. **padding / 圓角維持 px**，放大的是「字」不是整個版面被吹脹。
3. **`.tab .ic` 用 em 不用 px**，否則會變成大字配小圖示。`.ic` 本身已是 `1.25em`。

**`index.html` 的 `<head>` 有一小段同步腳本**先從 localStorage 讀 `textSize` 套上去。`js/app.js` 是 module（延後執行），只靠它會讓每次開啟先閃一下 16px 再跳到 24px——字調越大越刺眼。`app.js` 啟動時仍會再呼叫一次 `applyTextSize()`，讓 `sanitize()` 夾過範圍的值成為最終依據。

字級面板刻意做成**按下去立刻生效並存檔**，沒有確定鍵——使用者是把螢幕推遠了才在調，中間隔一個確認會逼他來回試。

**已驗證**：五段字級 × {手機 375、桌機 1280} × 四個分頁 + 知識點內文 + 閃卡評分列，皆無水平溢出與文字截斷。順帶修掉一個相關問題：作答層標題原本是「科目・知識點名稱」，在大字級會被 ellipsis 截掉，已改成只放科目名（知識點名稱在內文本來就是 h2）。

五科各有主色，由 `body[data-subject]` 切換 `--accent`：
行銷 `#D96A3C`／管理 `#3E7C6A`／經濟 `#5B6BB5`／統計 `#8A5FA8`／財管 `#B8862B`。
進入某一科的教材或練習時整頁換色，「我現在在讀哪一科」不必靠讀字判斷。

深色模式由 `prefers-color-scheme` 驅動，五科主色另有一組較亮的深色版本。

---

## 已驗證項目（2026-08-09／08-10）

SRS 間隔成長與 21 天封頂、目標日逼近時上限跟著縮、ease 上下限、忘記後 reps 歸零並排回隊尾、衝刺模式切換、每日目標與佇列數量一致、錯題本進出規則（錯→進，對 1 次留，對 2 次出）、選項洗牌、閃卡翻面與四級自評、申論勾選要點即時重算建議分數與作答存檔、口試牆鐘計時與關閉後清理、素材庫 CRUD 並在口試 review 列出、匯出匯入往返完全一致、爛 JSON 與錯誤格式被擋下且不動既有進度、手機 375×812 與桌機 1280×860 四個分頁皆無水平溢出、深色模式對比、**關掉伺服器後離線完整可用**（21 個資源全快取，仍能開教材與作答）。

08-10 追加：五段字級 ×{手機、桌機} 無溢出／截斷、字級在首次繪製前套用（無閃爍）、任務卡與工具列標題副標分行、四種作答層底部按鈕置中且左右對稱（誤差 < 2px）、手機滿版鍵與雙鍵列不受影響。

**未能自動驗證**：真機加到主畫面後的行為、內容正確性（已標出處學者供使用者對照課本）、實際各校考古題偏好。

**已知潛在問題**（實測確認，見「★ 待辦」P3）：`wrongCount` 與 `readCount` 未過濾失效 id；`daily` 與 `srs` 永不清理。只要遵守「id 只能往陣列尾端加」就不會觸發。

---

## ★ 開發時的陷阱

**改了 js/ 或 content/ 卻沒生效** —— Service Worker 用 Stale-While-Revalidate，會先回舊快取。開發時每次改完要跑：

```js
(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  location.reload();
})()
```

`serve.py` 已送 `no-store`，但擋不住 SW。**改版時記得把 `sw.js` 的 `CACHE` 版本號加一**，並在新增 `js/` 或 `content/` 檔案時同步加進 `ASSETS`。

**用 preview 工具測試時**：
- `computer{action:'screenshot'}` 在這個環境會逾時，改用 `javascript_tool` 讀 DOM 驗證
- 答題後整塊 sheet body 會重繪，**舊的 DOM 參考會脫離**——要重新 query 才拿得到新狀態
- 用 `await import('./js/srs.js')` 可在頁面內取得模組實例，直接驗證演算法，比點 UI 快很多

### ★ `<span>` 預設 inline 造成的版面錯位（已咬過三次）

`ui.js` 的 `el()` 產生什麼標籤就是什麼標籤，**不會自動補 `display`**。而 app.js 大量用 `<span>` 當結構容器，`<span>` 預設是 inline，會造成兩類症狀：

1. **該分行卻擠在同一行** —— 容器是 `<span>` 且未設 `display`，裡面兩個子 `<span>`（標題／說明）就會並排。已修：`.task__main`、`.row__main`。**日後新增這種「標題＋副標」結構時，容器一定要加 `display:flex; flex-direction:column`。**
2. **`margin:auto` 置中失效** —— `margin:auto` 的置中效果**只對 block 級盒子生效，inline 級（含 `inline-flex`）一律算 0**。`.btn` 預設 `inline-flex`，導致 `.sheet__foot > *` 的置中對它無效、按鈕貼左。已修：`.btn--block` 改為 `display:flex`。

改版面後的快速自檢（在 console 跑）：

```js
// 找出「應該分行卻擠在一起」的容器
document.querySelectorAll('[class*="__main"]').forEach(m => {
  if (getComputedStyle(m).display.includes('inline'))
    console.warn('容器仍是 inline：', m.className);
});
```

---

## 開發慣例

- Windows 環境，git 指令走終端機
- 內容與註解一律繁體中文
- 修改後請依上方「已驗證項目」重跑一次回歸，特別是 SRS 數學與匯入驗證這兩處——它們都曾經有過會靜默出錯的 bug

---

## 現況盤點（2026-08-10）

### 教材完成度

| 科目 | 章節進度 | 知識點 |
|---|---|---|
| 行銷管理 | 3 / 10 章（第 1、5、6 章） | 11 |
| 管理學 | 3 / 10 章（第 1、4、8 章） | 9 |
| 經濟學 | **0 / 尚未建檔** | 0 |
| 統計學 | **0 / 尚未建檔** | 0 |
| 財務管理 | **0 / 尚未建檔** | 0 |

合計 20 個知識點、71 張名詞卡、60 題選擇、20 題申論、29 題口試（含 9 題通用面試題）、5 間學校側重。

**程式面功能已完整，瓶頸完全在內容。** 兩科規劃各 10 章、約 96 個知識點，目前完成約兩成；另三科尚未開檔（連 `content/economics.js` 這類檔案都還沒有）。

---

## ★ 待辦（依重要性排序）

### P0 — 補教材（其他事都可以往後排）

程式碼**完全不用動**，只往 `content/` 加資料。建議順序（依面試被問到的機率）：

1. **行銷第 3 章 消費者行為**（購買決策過程、涉入度、B2B 採購）— 面試常問
2. **行銷第 9 章 整合行銷傳播 IMC** — 中山行銷傳播管理特別重視
3. **行銷第 10 章 數位行銷**（社群、KOL、CLV、行銷 4.0/5.0、ESG）
4. **管理第 7 章 領導**（權變理論、轉換型 vs 交易型）
5. **行銷第 2 章 行銷環境與五力**、**管理第 5 章 組織結構與文化**
6. 其餘章節 → 經濟學 → 統計學 → 財務管理

新增科目：寫 `content/<科目>.js`，在 `content/index.js` 匯入並放進 `SUBJECTS`；`tokens.css` 已預留 `--sub-econ` / `--sub-stat` / `--sub-finance` 三個主色。

**動內容前務必先讀上方「內容模型」的五條撰寫規則**，尤其 id 只能往陣列尾端加。

### P1 — 會實際影響讀書效率的功能缺口

- [ ] **錯題本瀏覽頁**（最有價值的一個）。目前只能「練錯題」，看不到**哪些知識點反覆答錯**——而這正是最強的診斷訊號，卻完全沒有呈現。應列出錯題並依 `wrong[id].count` 排序、可跳回該知識點。
- [ ] **鍵盤快捷鍵**。桌機刷卡全靠滑鼠點，速度差很多。建議：空白鍵翻面、`1`–`4` 對應四級評分、選擇題 `1`–`4` 選項、`Enter` 下一題、`Esc` 關閉（Esc 已實作）。
- [ ] **申論歷史回看**。`state.essayLog` 有存 `answer` 全文，但**沒有任何畫面顯示它**。同一題寫第二次時看不到上次寫了什麼，無從判斷有沒有進步。
- [ ] **到期分佈圖**。看不到未來幾天的複習負擔，可能某天突然湧入 80 張卡。「我」分頁加一張未來 14 天的長條圖即可。

### P2 — 教材品質的結構性缺口

- [ ] **沒有任何圖表**。BCG 矩陣、定位圖、PLC 曲線、需求供給圖本質上是視覺概念，目前全用文字描述，理解成本高。建議在 concept 加一個選用的 `diagram` 欄位放**內嵌 SVG**（維持零依賴，且能吃 CSS 變數配色，深色模式自動適應）。
- [ ] **沒有計算題**。統計學與財務管理必然需要，但目前 MCQ 結構沒有「顯示計算過程」的欄位。這兩科開工前要先決定：`explain` 直接寫算式，或另加 `steps[]`。
- [ ] **公式排版未解**。統計／財管的公式用 HTML+CSS 排到什麼程度可接受，尚未實驗。**不要引入 KaTeX**——會破壞零依賴與離線。

### P3 — 穩健性（目前不會壞，但教材改版後會咬人）

以下三項已用程式實測確認，都屬**潛在**問題：只要遵守「id 只能往尾端加」就不會觸發，但值得補上防護。

- [ ] **錯題數字會灌水**。`plan.js` 的 `wrongCount` 用 `Object.keys(state.wrong).length`，**沒有過濾已不存在的題目 id**。實測：注入一筆失效 id 後，徽章顯示「錯題重練（2）」但實際只練得到 1 題。`quiz.js` 已有 `wrongIds()` 會過濾，但**它是死程式碼、沒有任何地方呼叫**——把 `plan.js` 改用它即可。
- [ ] **`readCount` 同樣未過濾**（`plan.js:52`）。若教材縮減，「已讀 N／總 M」的 N 可能大於 M。
- [ ] **`daily` 與 `srs` 永不清理**。實測 401 天的 `daily` 紀錄經過 `sanitize()` 後仍是 401 筆；失效的 `srs` 條目也會永久殘留。`essayLog`／`oralLog` 已有 500 筆上限，`daily` 可比照保留最近 400 天，`srs` 可在載入後比對 `content.js` 的索引清掉孤兒。

### P4 — 有想過但刻意沒做

- [ ] **Service Worker 更新提示**。目前是 SWR + `skipWaiting`，使用者會在**第二次開啟**才拿到新版，中間不會有任何提示。要做的話：偵測 `registration.waiting` 後跳一個「有新版本，點此更新」的 toast。
- [ ] **面試模擬錄音**（`MediaRecorder`，純本機不上傳）。能聽自己講話是很強的回饋，但會需要處理權限與儲存空間。
- [ ] **自訂學校**。`SCHOOLS` 目前寫死五間，使用者無法自己增刪。
- [ ] **雲端同步**。刻意不做——見下方「刻意不做的事」。

---

## 刻意不做的事（別好心加回來）

| 項目 | 為什麼不做 |
|---|---|
| 申論自動批改 | 學習訊號來自「自己先產出，再跟範答逐點對照」。機器給一個分數，人就會跳過對照那一步，而那一步才是真正記得住的原因。 |
| 任何外部 CDN／函式庫 | 零依賴是這個 App 能完全離線的前提。通勤時沒網路仍要能刷題，是它存在的主要情境之一。 |
| 雲端同步／帳號 | 一個人自己用，匯出匯入已足夠。加帳號要處理隱私、後端與成本，收益不成比例。 |
| emoji 當圖示 | 跨平台長相不一致，且無法吃 CSS 變數配色。全站用 SVG `<symbol>`。 |
| 標準 SM-2 的長間隔 | 服務的是有明確截止日的衝刺，排到考後才複習等於沒複習。見上方 SRS 章節。 |
