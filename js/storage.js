/* storage.js — localStorage 持久層
 *
 * 三條規矩：
 *   1. 日期一律用「本地時區」的 YYYY-MM-DD，絕不用 toISOString()（那是 UTC，跨半夜會算錯天）
 *   2. 讀取一律 sanitize：localStorage 可能被手改壞或匯入爛檔，一律夾範圍、退回預設，不讓 App 白畫面
 *   3. 只在狀態改變時寫入，不做定時寫入
 */

const KEY = 'gradprep.v1';
const SCHEMA_VERSION = 1;

/* ─────────── 日期工具 ─────────── */

/** 本地時區的 YYYY-MM-DD */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today() {
  return dateKey();
}

/** 把 'YYYY-MM-DD' 解析成當地時間的正午 Date（正午可避開日光節約時間的邊界問題） */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(dayStr, n) {
  const d = parseDay(dayStr) || new Date();
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** b - a，單位為天（整數）。任一為無效日期時回傳 null */
export function daysBetween(a, b) {
  const da = parseDay(a);
  const db = parseDay(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

export function formatDay(dayStr) {
  const d = parseDay(dayStr);
  if (!d) return '—';
  const week = '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${week}）`;
}

/* ─────────── 預設值 ─────────── */

const DEFAULT_SETTINGS = {
  targetDate: '2026-10-15',  // 推甄面試目標日；使用者可改
  sprintDays: 14,            // 考前幾天進入衝刺模式
  dailyNewTarget: 12,        // 每日新項目的基準量（不是上限——進度落後時
                             // srs.newQuota() 算出的平攤值會超過它）
  mcqPerSession: 15,
  cardPerSession: 20,
  oralSeconds: 60,
  textSize: 16          // html 的 font-size（px）。全站字體都是 rem，改這個等於整頁縮放
};

/** 字級預設檔。value 是 html 的 font-size（px） */
export const TEXT_SIZES = [
  { value: 14, label: '小' },
  { value: 16, label: '標準' },
  { value: 18, label: '大' },
  { value: 21, label: '特大' },
  { value: 24, label: '最大' }
];

function blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    srs: {},        // 'card:<id>' | 'mcq:<id>' → { ease, interval, due, reps, lapses, last }
    wrong: {},      // mcqId → { streak, count, lastAt }
    starred: [],    // conceptId[]
    read: {},       // conceptId → dateKey（第一次讀完的日期）
    essayLog: [],   // { essayId, score, at, answer }
    oralLog: [],    // { oralId, seconds, at }
    stories: [],    // { id, title, situation, action, result, theory }
    daily: {},      // dateKey → { cards, mcqs, mcqRight, essays, oral, newConcepts }
    streak: { current: 0, best: 0, lastDay: null }
  };
}

/* ─────────── sanitize ─────────── */

const num = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

const int = (v, lo, hi, dflt) => Math.round(num(v, lo, hi, dflt));

const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

const arr = (v) => (Array.isArray(v) ? v : []);

function sanitize(raw) {
  const base = blank();
  const src = obj(raw);

  // 設定
  const s = obj(src.settings);
  base.settings.targetDate = parseDay(s.targetDate) ? s.targetDate : DEFAULT_SETTINGS.targetDate;
  base.settings.sprintDays = int(s.sprintDays, 0, 90, DEFAULT_SETTINGS.sprintDays);
  base.settings.dailyNewTarget = int(s.dailyNewTarget, 1, 60, DEFAULT_SETTINGS.dailyNewTarget);
  base.settings.mcqPerSession = int(s.mcqPerSession, 5, 60, DEFAULT_SETTINGS.mcqPerSession);
  base.settings.cardPerSession = int(s.cardPerSession, 5, 80, DEFAULT_SETTINGS.cardPerSession);
  base.settings.oralSeconds = int(s.oralSeconds, 20, 300, DEFAULT_SETTINGS.oralSeconds);
  base.settings.textSize = int(s.textSize, 12, 30, DEFAULT_SETTINGS.textSize);

  // SRS 排程
  for (const [k, v] of Object.entries(obj(src.srs))) {
    const r = obj(v);
    if (!parseDay(r.due)) continue;           // 沒有有效到期日的紀錄直接丟掉
    base.srs[str(k, 120)] = {
      ease: num(r.ease, 1.3, 3.0, 2.5),
      interval: int(r.interval, 0, 365, 1),
      due: r.due,
      reps: int(r.reps, 0, 9999, 0),
      lapses: int(r.lapses, 0, 9999, 0),
      last: parseDay(r.last) ? r.last : null
    };
  }

  // 錯題本
  for (const [k, v] of Object.entries(obj(src.wrong))) {
    const r = obj(v);
    base.wrong[str(k, 120)] = {
      streak: int(r.streak, 0, 99, 0),
      count: int(r.count, 0, 9999, 1),
      lastAt: parseDay(r.lastAt) ? r.lastAt : null
    };
  }

  base.starred = [...new Set(arr(src.starred).map((x) => str(x, 120)).filter(Boolean))].slice(0, 2000);

  for (const [k, v] of Object.entries(obj(src.read))) {
    if (parseDay(v)) base.read[str(k, 120)] = v;
  }

  base.essayLog = arr(src.essayLog).slice(-500).map((v) => {
    const r = obj(v);
    return {
      essayId: str(r.essayId, 120),
      score: int(r.score, 0, 5, 0),
      at: parseDay(r.at) ? r.at : today(),
      answer: str(r.answer, 8000)
    };
  }).filter((r) => r.essayId);

  base.oralLog = arr(src.oralLog).slice(-500).map((v) => {
    const r = obj(v);
    return {
      oralId: str(r.oralId, 120),
      seconds: int(r.seconds, 0, 3600, 0),
      at: parseDay(r.at) ? r.at : today()
    };
  }).filter((r) => r.oralId);

  base.stories = arr(src.stories).slice(0, 100).map((v) => {
    const r = obj(v);
    return {
      id: str(r.id, 60) || uid(),
      title: str(r.title, 120),
      situation: str(r.situation, 1500),
      action: str(r.action, 1500),
      result: str(r.result, 1500),
      theory: str(r.theory, 500)
    };
  });

  for (const [k, v] of Object.entries(obj(src.daily))) {
    if (!parseDay(k)) continue;
    const r = obj(v);
    base.daily[k] = {
      cards: int(r.cards, 0, 99999, 0),
      mcqs: int(r.mcqs, 0, 99999, 0),
      mcqRight: int(r.mcqRight, 0, 99999, 0),
      essays: int(r.essays, 0, 9999, 0),
      oral: int(r.oral, 0, 9999, 0),
      newConcepts: int(r.newConcepts, 0, 9999, 0)
    };
  }

  const st = obj(src.streak);
  base.streak = {
    current: int(st.current, 0, 99999, 0),
    best: int(st.best, 0, 99999, 0),
    lastDay: parseDay(st.lastDay) ? st.lastDay : null
  };

  return base;
}

/* ─────────── 讀寫 ─────────── */

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('[storage] 讀取失敗，改用空白資料：', err);
    return blank();
  }
}

export const state = load();

let saveTimer = null;

export function save() {
  // 連續操作（例如快速刷閃卡）合併成一次寫入
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}

export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[storage] 寫入失敗：', err);
  }
}

// 關頁前確保最後一次操作有寫進去
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

/* ─────────── 每日紀錄與連續天數 ─────────── */

export function dayRecord(day = today()) {
  if (!state.daily[day]) {
    state.daily[day] = { cards: 0, mcqs: 0, mcqRight: 0, essays: 0, oral: 0, newConcepts: 0 };
  }
  return state.daily[day];
}

/** 累加今日某項統計，並順手更新連續天數 */
export function bumpDaily(field, n = 1) {
  const rec = dayRecord();
  if (!(field in rec)) return;
  rec[field] += n;
  touchStreak();
  save();
}

function touchStreak() {
  const t = today();
  const s = state.streak;
  if (s.lastDay === t) return;                     // 今天已經算過了
  s.current = s.lastDay === addDays(t, -1) ? s.current + 1 : 1;
  s.lastDay = t;
  if (s.current > s.best) s.best = s.current;
}

/* ─────────── 匯出／匯入 ─────────── */

export function exportJSON() {
  flush();
  return JSON.stringify(state, null, 2);
}

// 備份檔至少要有其中一個 key，否則就不是這個 App 匯出的東西
const KNOWN_KEYS = ['schemaVersion', 'settings', 'srs', 'wrong', 'starred', 'read',
  'essayLog', 'oralLog', 'stories', 'daily', 'streak'];

/**
 * 回傳 { ok, msg }。整包置換而非合併——語意單純，使用者比較不會搞混。
 *
 * 匯入是唯一會一次抹掉全部進度的操作，所以驗證刻意嚴格：
 * 只要不像本 App 的備份檔就直接拒絕。早期版本只檢查 `typeof === 'object'`，
 * 結果 JSON 陣列（別的 App 的匯出檔）也會通過，sanitize 後變成空白資料，
 * 使用者選錯檔案就會在看到「已匯入」的同時失去所有進度。
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, msg: '這不是有效的 JSON 檔' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, msg: '檔案格式看起來不對' };
  }
  if (!KNOWN_KEYS.some((k) => k in parsed)) {
    return { ok: false, msg: '這不像是推甄戰備室的備份檔' };
  }
  const clean = sanitize(parsed);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, clean);
  flush();
  return { ok: true, msg: '已匯入' };
}

export function resetAll() {
  const clean = blank();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, clean);
  flush();
}

/* ─────────── 小工具 ─────────── */

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
