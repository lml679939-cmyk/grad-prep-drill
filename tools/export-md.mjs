/* tools/export-md.mjs — 把教材與題庫匯出成 Markdown（給 NotebookLM 等第三方檢查用）
 *
 * 用法：node tools/export-md.mjs
 * 產出：export/ 目錄下的 .md 檔（總覽 1 + 教材每科 1 + 題庫 3）+ 內容品質檢核報告（印在終端機）
 *
 * 這支腳本只讀 content/，不動任何 App 資料。純 Node，無外部套件。
 */

import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'export');
mkdirSync(OUT, { recursive: true });

const { SUBJECTS, GENERAL_ORAL, SCHOOLS } = await import(
  new URL('../content/index.js', import.meta.url)
);

/* ─────────── 攤平索引（與 js/content.js 的 id 推導規則一致） ─────────── */

const concepts = [];
for (const s of SUBJECTS) {
  s.chapters.forEach((ch, ci) => {
    ch.no = ch.no ?? ci + 1;
    for (const c of ch.concepts) {
      concepts.push({ ...c, subject: s, chapter: ch });
    }
  });
}
const conceptTitle = new Map(concepts.map((c) => [c.id, c.title]));

const cards = concepts.flatMap((c) => (c.terms || []).map((t, i) => ({ ...t, id: `c:${c.id}:${i}`, c })));
const mcqs = concepts.flatMap((c) => (c.mcqs || []).map((m, i) => ({ ...m, id: `q:${c.id}:${i}`, c })));
const essays = concepts.flatMap((c) => (c.essays || []).map((e, i) => ({ ...e, id: `e:${c.id}:${i}`, c })));
const orals = concepts.flatMap((c) => (c.oral || []).map((o, i) => ({ ...o, id: `o:${c.id}:${i}`, c })));

/* ─────────── 工具 ─────────── */

const LETTER = ['A', 'B', 'C', 'D'];

/** [[mkt-01-02]] → [[mkt-01-02｜行銷觀念的演進]]，讓第三方看得懂跨章連結指向哪裡 */
function links(s) {
  return String(s ?? '').replace(/\[\[([a-z]+-\d+-\d+)\]\]/g,
    (m, id) => (conceptTitle.has(id) ? `[[${id}｜${conceptTitle.get(id)}]]` : `[[${id}｜⚠ 找不到此知識點]]`));
}

const list = (arr, bullet = '-') => (arr || []).map((x) => `${bullet} ${links(x)}`).join('\n');
const numbered = (arr) => (arr || []).map((x, i) => `${i + 1}. ${links(x)}`).join('\n');

const writtenNames = new Set();

function write(name, body) {
  const path = join(OUT, name);
  writeFileSync(path, body.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n', 'utf8');
  writtenNames.add(name);
  return `${name}（${(Buffer.byteLength(body, 'utf8') / 1024).toFixed(0)} KB）`;
}

/* 清掉上一次匯出留下、這次不再產生的檔（例如教材從 01_ 改編號成 01a_ 之後的舊檔）。
 * 使用者的流程是把整個 export/ 丟給 NotebookLM，留著舊檔會變成同一份教材上傳兩次。
 * 只刪符合本腳本命名規則（兩位數字＋可選字母＋底線＋.md）且這次沒寫過的檔，
 * 使用者自己放進 export/ 的東西不會被動到。 */
function pruneStale() {
  const stale = readdirSync(OUT).filter(
    (f) => /^\d{2}[a-z]?_.+\.md$/.test(f) && !writtenNames.has(f)
  );
  stale.forEach((f) => rmSync(join(OUT, f)));
  return stale;
}

const TODAY = new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD 本地時區

/* ─────────── 1. 教材（每科一檔） ─────────── */

function lecture(subject) {
  let out = `# ${subject.name}｜教材講義

> 匯出自「推甄戰備室」內容庫，${TODAY}。
> 每個「知識點」分兩層：**面試層**（30 秒講得出口）與**進階層**（模型細節、限制、爭論）。
> \`[[id｜標題]]\` 表示跨章連結。每則末尾的名詞卡即 App 內的閃卡。

---
`;

  for (const ch of subject.chapters) {
    out += `\n## 第 ${ch.no} 章　${ch.title}\n`;
    out += `\n> 章節代號：\`${ch.id}\`　知識點數：${ch.concepts.length}\n`;

    for (const c of ch.concepts) {
      out += `\n---\n\n### ${c.id}　${c.title}\n\n`;
      out += `**標籤**：${(c.tags || []).join('、') || '（無）'}　|　**出處**：${c.source || '（未標）'}\n`;
      out += `\n#### 面試層（brief）\n\n${links(c.brief)}\n`;
      if (c.advanced) out += `\n#### 進階層（advanced）\n\n${links(c.advanced)}\n`;
      if (c.example) out += `\n#### 實務案例（example）\n\n${links(c.example)}\n`;

      if (c.terms?.length) {
        out += `\n#### 名詞卡（${c.terms.length} 張）\n`;
        c.terms.forEach((t, i) => {
          out += `\n**卡 ${i + 1}｜${t.term}${t.en ? `（${t.en}）` : ''}**　\`c:${c.id}:${i}\`\n\n`;
          out += `- 定義：${links(t.def)}\n`;
          if (t.tip) out += `- 面試講法：${links(t.tip)}\n`;
        });
      }
    }
  }
  return out;
}

/* 教材檔一科一個，檔名由 SUBJECTS 動態產生 —— 不要再寫死 SUBJECTS[0]、SUBJECTS[1]，
 * 那正是經濟學建檔後教材長期沒被匯出的原因（題庫有出、只有教材漏掉）。
 *
 * 編號用 01a / 01b / 01c… 而不是 01 / 02 / 03：03–05 已被三個題庫檔佔用，
 * 而使用者的 NotebookLM 筆記本是照檔名建立來源的，重編號等於要他整本重傳。
 * 往後補統計、財管只會往後長成 01d / 01e，題庫的 03–05 永遠不必動。
 */
const lectureFiles = SUBJECTS.map((s, i) => ({
  subject: s,
  file: `01${String.fromCharCode(97 + i)}_${s.name}_教材.md`
}));

/* 管院五科的最終範圍。SUBJECTS 只含「已建檔」的科目，兩者相減即為待補，
 * 這樣總覽裡的「尚未建檔」不會像先前那樣停留在舊狀態。 */
const PLANNED_SUBJECTS = ['行銷管理', '管理學', '經濟學', '統計學', '財務管理'];
const pendingSubjects = PLANNED_SUBJECTS.filter((n) => !SUBJECTS.some((s) => s.name === n));

/* ─────────── 2. 選擇題題庫 ─────────── */

function mcqBank() {
  let out = `# 選擇題題庫（共 ${mcqs.length} 題）

> 匯出自「推甄戰備室」，${TODAY}。**這是給第三方核對用的版本，已標出正解。**
> App 內每次出題選項都會重新洗牌，因此詳解中不會出現「選項 (B)」這類代號 —— 若發現詳解提到選項代號，那是錯誤，請指出。
> 每題的 \`q:章節-序號:題號\` 是題目在系統內的唯一代號，回報問題時請附上。

---
`;
  for (const s of SUBJECTS) {
    out += `\n## ${s.name}\n`;
    for (const ch of s.chapters) {
      const inCh = mcqs.filter((m) => m.c.chapter.id === ch.id);
      if (!inCh.length) continue;
      out += `\n### 第 ${ch.no} 章　${ch.title}（${inCh.length} 題）\n`;
      let lastConcept = null;
      for (const m of inCh) {
        if (m.c.id !== lastConcept) {
          out += `\n**［知識點 ${m.c.id}　${m.c.title}］**　出處：${m.c.source || '未標'}\n`;
          lastConcept = m.c.id;
        }
        out += `\n---\n\n**${m.id}**\n\n${links(m.q)}\n\n`;
        (m.options || []).forEach((o, i) => {
          out += `- (${LETTER[i]}) ${links(o)}${i === m.answer ? '　　✅ **正解**' : ''}\n`;
        });
        out += `\n**詳解**：${links(m.explain)}\n`;
      }
    }
  }
  return out;
}

/* ─────────── 3. 申論題題庫 ─────────── */

function essayBank() {
  let out = `# 申論題題庫（共 ${essays.length} 題）

> 匯出自「推甄戰備室」，${TODAY}。
> 每題含四段：題目、答題大綱（outline）、評分要點（rubric）、完整範答（sample）。
> App 的設計是**使用者先自己寫，再逐點對照範答自評**，不做自動批改。

---
`;
  for (const s of SUBJECTS) {
    out += `\n## ${s.name}\n`;
    for (const ch of s.chapters) {
      const inCh = essays.filter((e) => e.c.chapter.id === ch.id);
      if (!inCh.length) continue;
      out += `\n### 第 ${ch.no} 章　${ch.title}\n`;
      for (const e of inCh) {
        out += `\n---\n\n#### ${e.id}｜${e.c.title}\n\n`;
        out += `**題目**：${links(e.q)}\n`;
        if (e.outline?.length) out += `\n**答題大綱**\n\n${numbered(e.outline)}\n`;
        if (e.rubric?.length) out += `\n**評分要點**\n\n${list(e.rubric)}\n`;
        if (e.sample) out += `\n**範答**\n\n${links(e.sample)}\n`;
      }
    }
  }
  return out;
}

/* ─────────── 4. 口試題題庫 ─────────── */

function oralBank() {
  let out = `# 口試題題庫（共 ${orals.length + GENERAL_ORAL.length} 題）

> 匯出自「推甄戰備室」，${TODAY}。分「專業題」（掛在知識點下）與「通用題」（自我介紹、研究興趣等）。
> 每題含答題框架（framework）與常見地雷（pitfall），部分題目另有各校側重提醒（schools）。

---

## 一、專業題（${orals.length} 題）
`;
  for (const s of SUBJECTS) {
    out += `\n### ${s.name}\n`;
    for (const ch of s.chapters) {
      const inCh = orals.filter((o) => o.c.chapter.id === ch.id);
      if (!inCh.length) continue;
      out += `\n#### 第 ${ch.no} 章　${ch.title}\n`;
      for (const o of inCh) {
        out += `\n---\n\n**${o.id}｜${o.c.title}**\n\n`;
        out += `**題目**：${links(o.q)}\n`;
        if (o.framework?.length) out += `\n**答題框架**\n\n${list(o.framework)}\n`;
        if (o.pitfall) out += `\n**常見地雷**：${links(o.pitfall)}\n`;
        if (o.schools) out += `\n**各校側重**：${links(o.schools)}\n`;
      }
    }
  }

  out += `\n\n## 二、通用題（${GENERAL_ORAL.length} 題）\n`;
  GENERAL_ORAL.forEach((o, i) => {
    out += `\n---\n\n**og:${i}**\n\n**題目**：${links(o.q)}\n`;
    if (o.framework?.length) out += `\n**答題框架**\n\n${list(o.framework)}\n`;
    if (o.pitfall) out += `\n**常見地雷**：${links(o.pitfall)}\n`;
    if (o.schools) out += `\n**各校側重**：${links(o.schools)}\n`;
  });

  out += `\n\n## 三、各校側重（${SCHOOLS.length} 間）\n`;
  for (const sc of SCHOOLS) {
    out += `\n### ${sc.name}　${sc.program}\n\n${links(sc.focus)}\n`;
  }
  return out;
}

/* ─────────── 5. 總覽與檢查指引 ─────────── */

function overview(qc) {
  const rows = SUBJECTS.map((s) => {
    const cs = concepts.filter((c) => c.subject.id === s.id);
    const n = (pool) => pool.filter((x) => x.c.subject.id === s.id).length;
    return `| ${s.name} | ${s.chapters.length} | ${cs.length} | ${n(cards)} | ${n(mcqs)} | ${n(essays)} | ${n(orals)} |`;
  }).join('\n');

  // 檔案清單必須跟著實際產出走，否則第三方會照著總覽去找一個不存在的檔
  const fileRows = lectureFiles
    .map(({ subject, file }) => `| \`${file}\` | ${subject.name}講義（含名詞卡） |`)
    .join('\n');

  return `# 推甄戰備室｜內容總覽與檢查指引

匯出日期：${TODAY}

## 這是什麼

這是一套為**台灣研究所推甄（管理學院）**準備的自學題庫內容。目標有兩個，順序有意義：
1. 面試被教授問到專業知識時答得上來；
2. 銜接研究所課程。

因此每個「知識點」都寫成雙層：**面試層**（30 秒講得出口的版本）與**進階層**（模型細節、限制、學術爭論）。

## 內容架構

以「知識點」為中心，一個知識點同時衍生四種練習：

- **名詞卡**（閃卡）：術語 + 英文 + 定義 + 面試講法
- **選擇題**：4 選項 + 詳解
- **申論題**：答題大綱 + 評分要點 + 完整範答
- **口試題**：答題框架 + 常見地雷

## 目前規模

| 科目 | 章節 | 知識點 | 名詞卡 | 選擇題 | 申論題 | 口試題 |
|---|---|---|---|---|---|---|
${rows}
| **合計** | **${SUBJECTS.reduce((a, s) => a + s.chapters.length, 0)}** | **${concepts.length}** | **${cards.length}** | **${mcqs.length}** | **${essays.length}** | **${orals.length}** |

另有通用面試題 ${GENERAL_ORAL.length} 題、各校側重 ${SCHOOLS.length} 間。

${pendingSubjects.length
  ? `尚未建檔的科目：**${pendingSubjects.join('、')}**，本次匯出不含這些科目的任何內容。`
  : '管院五科皆已建檔。'}

## 檔案清單

| 檔案 | 內容 |
|---|---|
| \`00_總覽與檢查指引.md\` | 本檔 |
${fileRows}
| \`03_選擇題題庫.md\` | 全部選擇題，**已標正解與詳解** |
| \`04_申論題題庫.md\` | 全部申論題，含大綱、評分要點、範答 |
| \`05_口試題題庫.md\` | 全部口試題 + 通用面試題 + 各校側重 |

## 自動檢核結果（匯出當下）

${qc}

---

# 給第三方檢查者的提示語（可直接複製使用）

貼進 NotebookLM 之類的工具時，可以照下面的順序一題一題問，一次問一項比一次問完準確：

### 1. 事實正確性
> 請逐一檢查這些教材中的**學術歸屬與年份**是否正確：理論是不是這位學者提出的、年份對不對、定義有沒有偏離原始文獻。列出所有可疑之處，並附上知識點代號（例如 mkt-01-01）與正確版本。

### 2. 選擇題正確性
> 請檢查每一題選擇題：(a) 標示的正解是否真的正確；(b) 其他三個選項是否都確實錯誤，有沒有「其實也對」的干擾項；(c) 詳解的說明是否與正解一致；(d) 題幹有沒有語意不清或雙重否定。請用題號（例如 q:mkt-01-01:2）回報。

### 3. 選項代號洩漏
> 這個 App 每次出題都會把選項順序**重新洗牌**，所以詳解裡絕對不能出現「選項 (B)」「(C) 錯在」這類指涉選項位置的文字。請找出所有違反這條規則的題目。

### 4. 申論範答品質
> 請以台灣研究所推甄的標準評估這些申論範答：論點是否完整、有沒有明顯遺漏的主流理論、評分要點與範答內容是否對得起來、有沒有事實錯誤。

### 5. 案例可查證性
> 教材中的實務案例（多為台灣企業）刻意避免對企業內部運作做無法查證的斷言。請找出任何**可能無法查證、或與公開事實不符**的敘述。

### 6. 涵蓋範圍缺口
> 以台灣研究所推甄（管理學院）的常見考題範圍來看，這些教材**遺漏了哪些高頻考點**？請依重要性排序。

### 7. 跨科重複與矛盾
> ${SUBJECTS.map((s) => s.name).join('、')}各科之間，有沒有**互相矛盾的敘述**，或同一概念在兩處定義不一致的情況？
`;
}

/* ─────────── 內容品質檢核（對應 CLAUDE.md 的 console 腳本） ─────────── */

const isRow = (s) => /^\|.*\|$/.test(s);
const isSep = (s) => /^\|[\s:|-]+\|$/.test(s) && s.includes('-');

function runQc() {
  const bad = mcqs.filter((m) => !Array.isArray(m.options) || m.options.length !== 4
    || !Number.isInteger(m.answer) || m.answer < 0 || m.answer > 3 || !m.q || !m.explain).map((m) => m.id);
  const letters = mcqs.filter((m) => /選項\s*[（(]?\s*[A-D]\s*[)）]?/.test(m.explain)).map((m) => m.id);
  const incomplete = concepts.filter((c) => !c.brief || !c.terms?.length || !c.mcqs?.length
    || !c.essays?.length || !c.oral?.length).map((c) => c.id);
  const ids = concepts.map((c) => c.id);
  const dupIds = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const itemIds = [...cards, ...mcqs, ...essays, ...orals].map((x) => x.id);
  const dupItemIds = [...new Set(itemIds.filter((v, i) => itemIds.indexOf(v) !== i))];

  /* 掃描範圍不只知識點的三個欄位——選擇題詳解與申論範答同樣走 md() 渲染，
   * 統計學開始把公式與跨章連結寫進 explain 與 sample，漏掉這兩處等於沒檢查。
   * 這裡把每個要檢查的字串攤平成 { id, field, text } 一起處理。 */
  const texts = [];
  for (const c of concepts) {
    for (const f of ['brief', 'advanced', 'example']) {
      if (typeof c[f] === 'string') texts.push({ id: c.id, field: f, text: c[f] });
    }
  }
  for (const m of mcqs) {
    if (typeof m.explain === 'string') texts.push({ id: m.id, field: 'explain', text: m.explain });
  }
  for (const e of essays) {
    if (typeof e.sample === 'string') texts.push({ id: e.id, field: 'sample', text: e.sample });
  }

  // 表格語法：有分隔列但上一行不是標題列 → md() 會把 |---|---| 當文字印出來
  const brokenTables = [];
  const deadLinks = [];
  {
    for (const { id, field, text: v } of texts) {
      const lines = v.split('\n').map((l) => l.trim());
      lines.forEach((l, i) => {
        if (isSep(l) && !(i > 0 && isRow(lines[i - 1]))) brokenTables.push(`${id}.${field}`);
      });
      for (const m of v.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (!conceptTitle.has(m[1])) deadLinks.push(`${id}.${field} → ${m[1]}`);
      }
    }
  }

  // 行內公式 `x` 必須成對。經濟／統計／財管大量使用，而欄位本身是樣板字串，
  // 少寫一個 escape 反引號就會變成語法錯誤或整段公式外洩，這裡先擋一次。
  const oddBackticks = texts
    .filter(({ text }) => (text.match(/`/g) || []).length % 2 !== 0)
    .map(({ id, field }) => `${id}.${field}`);

  const missingEn = cards.filter((t) => !t.en).map((t) => t.id);
  const missingSource = concepts.filter((c) => !c.source).map((c) => c.id);
  const shortSample = essays.filter((e) => (e.sample || '').length < 500).map((e) => e.id);

  return {
    格式錯誤的選擇題: bad,
    詳解提到選項代號: letters,
    欄位不完整的知識點: incomplete,
    重複的知識點id: dupIds,
    重複的題目id: dupItemIds,
    表格語法壞掉: [...new Set(brokenTables)],
    行內公式反引號未成對: oddBackticks,
    指向不存在知識點的連結: deadLinks,
    名詞卡缺英文: missingEn,
    知識點缺出處: missingSource,
    範答短於500字: shortSample
  };
}

/* ─────────── 執行 ─────────── */

const qc = runQc();
const qcMd = Object.entries(qc)
  .map(([k, v]) => `- ${v.length === 0 ? '✅' : '⚠️'} **${k}**：${v.length === 0 ? '無' : `${v.length} 筆 —— ${v.join('、')}`}`)
  .join('\n');

const written = [
  write('00_總覽與檢查指引.md', overview(qcMd)),
  ...lectureFiles.map(({ subject, file }) => write(file, lecture(subject))),
  write('03_選擇題題庫.md', mcqBank()),
  write('04_申論題題庫.md', essayBank()),
  write('05_口試題題庫.md', oralBank())
];

const stale = pruneStale();

console.log('已產出 export/：');
written.forEach((w) => console.log('  ' + w));
if (stale.length) console.log('\n已清掉舊檔：', stale.join('、'));
console.log('\n統計：', {
  知識點: concepts.length, 名詞卡: cards.length, 選擇題: mcqs.length,
  申論: essays.length, 口試: orals.length + GENERAL_ORAL.length
});
console.log('\n品質檢核：');
for (const [k, v] of Object.entries(qc)) {
  console.log(`  ${v.length === 0 ? 'OK  ' : '注意'} ${k}：${v.length === 0 ? '無' : v.join('、')}`);
}
