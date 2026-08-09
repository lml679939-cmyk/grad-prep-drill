/* srs.js — 間隔複習排程（SM-2 改良版）
 *
 * 為什麼不是原版 SM-2：原版設計給「長期記憶終身保留」，熟題間隔會拉到好幾個月。
 * 這支 App 服務的是一個有明確截止日的衝刺（推甄面試），排到考後才複習的題目等於沒複習。
 * 所以做了兩項調整：
 *
 *   1. 間隔上限 = min(21, 距離目標日的天數)
 *      → 保證每個知識點在面試前至少還會再滾過一輪
 *   2. 考前 sprintDays（預設 14）天自動進入衝刺模式
 *      → 佇列忽略到期日，改以「錯題 > 標記 > 必考 > 生疏」排序全刷
 *
 * 評分四級：0 忘記 / 1 勉強 / 2 會 / 3 秒答
 */

import { state, today, addDays, daysBetween } from './storage.js';

export const MAX_INTERVAL = 21;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

export const GRADES = [
  { g: 0, label: '忘記' },
  { g: 1, label: '勉強' },
  { g: 2, label: '會' },
  { g: 3, label: '秒答' }
];

/* ─────────── 目標日 ─────────── */

/** 距離目標日還有幾天；目標日已過或未設定時回傳 null */
export function daysToTarget() {
  const d = daysBetween(today(), state.settings.targetDate);
  return d === null ? null : d;
}

export function isSprint() {
  const d = daysToTarget();
  return d !== null && d >= 0 && d <= state.settings.sprintDays;
}

/** 這一輪的間隔上限：不讓任何複習被排到目標日之後 */
export function intervalCap() {
  const d = daysToTarget();
  if (d === null || d <= 0) return MAX_INTERVAL;
  return Math.max(1, Math.min(MAX_INTERVAL, d));
}

/**
 * 今天該碰幾個「還沒學過」的項目。
 *
 * 取「設定的每日基準」與「把剩餘題目平攤到剩餘天數」兩者較大值：
 *   - 題庫還小、天數還多時 → 平攤值極小，由基準值撐住，才不會出現
 *     每天 1 張卡這種不值得打開 App 的目標
 *   - 進度落後或逼近目標日時 → 平攤值上升並超過基準，該追的量誠實呈現
 *
 * plan.js 的每日目標與 buildQueue 實際發的題數共用這個函式，
 * 否則會出現「目標 10 題但佇列只給 6 題」這種永遠達不成的情況。
 */
export function newQuota(remainingNew) {
  if (remainingNew <= 0) return 0;
  const days = daysToTarget();
  const spread = days === null || days <= 0 ? 1 : days;
  const paced = Math.ceil(remainingNew / spread);
  return Math.min(remainingNew, Math.max(state.settings.dailyNewTarget, paced));
}

/* ─────────── 單筆排程 ─────────── */

export function getRec(key) {
  return state.srs[key] || null;
}

export function isNew(key) {
  return !state.srs[key];
}

export function isDue(key, day = today()) {
  const r = state.srs[key];
  if (!r) return false;
  return r.due <= day;
}

/** 是否曾經學過（不論到期與否） */
export function isSeen(key) {
  return Boolean(state.srs[key]);
}

const clampEase = (e) => Math.min(MAX_EASE, Math.max(MIN_EASE, e));

/** 算出某個評分會給出的新間隔（天）。grade 0 回傳 0 表示「今天再來一次」 */
export function nextInterval(rec, grade) {
  const cap = intervalCap();
  if (grade === 0) return 0;

  const reps = rec ? rec.reps : 0;
  const ease = rec ? rec.ease : 2.5;
  const prev = rec ? rec.interval : 0;

  let iv;
  if (reps === 0) {
    iv = [1, 1, 2][grade - 1];
  } else if (reps === 1) {
    iv = [2, 3, 5][grade - 1];
  } else {
    const factor = grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.25;
    // 至少要比上次長一天，否則「會」了間隔卻沒成長，複習量永遠降不下來
    iv = Math.max(prev + 1, Math.round(prev * factor));
  }
  return Math.min(iv, cap);
}

/** 給評分按鈕用的提示文字：'今天' / '1 天' / '3 天' */
export function intervalLabel(key, grade) {
  const iv = nextInterval(getRec(key), grade);
  return iv === 0 ? '今天' : `${iv} 天`;
}

/**
 * 記錄一次複習，回傳更新後的排程紀錄。
 * 呼叫端負責 save()（通常一輪結束才存，或由 storage.save() 的防抖合併）。
 */
export function review(key, grade) {
  const t = today();
  const prev = state.srs[key];
  const rec = prev
    ? { ...prev }
    : { ease: 2.5, interval: 0, due: t, reps: 0, lapses: 0, last: null };

  const iv = nextInterval(prev, grade);

  if (grade === 0) {
    rec.reps = 0;
    rec.lapses += 1;
    rec.ease = clampEase(rec.ease - 0.2);
  } else {
    rec.reps += 1;
    rec.ease = clampEase(rec.ease + [-0.15, 0, 0.15][grade - 1]);
  }

  rec.interval = iv;
  rec.due = addDays(t, iv);
  rec.last = t;

  state.srs[key] = rec;
  return rec;
}

/* ─────────── 佇列組裝 ─────────── */

/**
 * 從候選 key 陣列挑出這一輪要練的項目。
 *
 * 一般模式：到期的優先，不夠再補新的（新的有每日上限，避免一天塞爆）
 * 衝刺模式：忽略到期日，用 weight 排序全刷
 *
 * opts: { limit, newCap, weight(key) → 數字，越大越優先 }
 */
export function buildQueue(keys, opts = {}) {
  const limit = opts.limit ?? 20;
  const weight = opts.weight || (() => 0);
  const t = today();

  if (isSprint()) {
    return [...keys]
      .sort((a, b) => {
        const w = weight(b) - weight(a);
        if (w !== 0) return w;
        // 同權重時，生疏的（ease 低、lapses 多）排前面
        return staleness(b) - staleness(a);
      })
      .slice(0, limit);
  }

  const due = [];
  const fresh = [];
  for (const k of keys) {
    const r = state.srs[k];
    if (!r) fresh.push(k);
    else if (r.due <= t) due.push(k);
  }

  due.sort((a, b) => {
    const w = weight(b) - weight(a);
    if (w !== 0) return w;
    return (state.srs[a].due < state.srs[b].due ? -1 : 1);  // 逾期越久越前面
  });

  const newCap = opts.newCap ?? newQuota(fresh.length);
  shuffle(fresh);
  const picked = due.slice(0, limit);
  if (picked.length < limit) {
    picked.push(...fresh.slice(0, Math.min(newCap, limit - picked.length)));
  }
  return picked;
}

function staleness(key) {
  const r = state.srs[key];
  if (!r) return 1.5;                       // 沒學過的算中等優先
  return r.lapses * 0.5 + (2.8 - r.ease);
}

export function countDue(keys, day = today()) {
  let n = 0;
  for (const k of keys) {
    const r = state.srs[k];
    if (r && r.due <= day) n++;
  }
  return n;
}

export function countNew(keys) {
  let n = 0;
  for (const k of keys) if (!state.srs[k]) n++;
  return n;
}

/** 已學過且尚未到期的（＝暫時記住了） */
export function countHeld(keys, day = today()) {
  let n = 0;
  for (const k of keys) {
    const r = state.srs[k];
    if (r && r.due > day) n++;
  }
  return n;
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
