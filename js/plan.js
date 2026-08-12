/* plan.js — 倒數、每日目標、整體進度
 *
 * 每日目標的算法刻意做得可以口頭解釋：
 *
 *   今日目標 = 今天到期的複習量 ＋ 今天該碰的新東西
 *   今天該碰的新東西 = ceil(還沒學過的數量 ÷ 距離目標日的天數)
 *
 * 也就是「把剩下沒學的平均攤到剩下的每一天」。剩越少天，每天要碰的越多——
 * 這個壓力是真的，不該被演算法藏起來。
 *
 * 衝刺期（考前 sprintDays 天）改成全刷，不再談進度攤平。
 */

import { state, today, daysBetween, dayRecord } from './storage.js';
import { allCards, allMcqs, allConcepts, allEssays, allOrals, conceptById } from './content.js';
import { countDue, countNew, countHeld, isSprint, daysToTarget, newQuota } from './srs.js';
import { wrongIds } from './quiz.js';

const SPRINT_CARD_GOAL = 40;
const SPRINT_MCQ_GOAL = 30;

const cardKeys = () => allCards.map((c) => c.id);
const mcqKeys = () => allMcqs.map((m) => m.id);

export function snapshot() {
  const days = daysToTarget();
  const sprint = isSprint();

  const ck = cardKeys();
  const mk = mcqKeys();

  const cardsDue = countDue(ck);
  const cardsNew = countNew(ck);
  const cardsHeld = countHeld(ck);

  const mcqsDue = countDue(mk);
  const mcqsNew = countNew(mk);
  const mcqsHeld = countHeld(mk);

  // 目標＝今天到期的複習量 ＋ 今天該碰的新項目。
  // 新項目的配額直接用 srs.newQuota()，與 buildQueue 實際發題所用的是同一個
  // 函式，因此目標一定拿得到——不會出現「目標 10 題但佇列只給 6 題」。
  // 每輪上限則由設定的 cardPerSession / mcqPerSession 夾住。
  const cardGoal = sprint
    ? Math.min(ck.length, SPRINT_CARD_GOAL)
    : Math.min(state.settings.cardPerSession, cardsDue + newQuota(cardsNew));

  const mcqGoal = sprint
    ? Math.min(mk.length, SPRINT_MCQ_GOAL)
    : Math.min(state.settings.mcqPerSession, mcqsDue + newQuota(mcqsNew));

  const done = dayRecord();

  // 兩個數字都要濾掉「教材已經沒有這個 id」的殘留紀錄，否則會灌水：
  // 錯題徽章顯示 2 題但實際只練得到 1 題、已讀數甚至可能大於知識點總數。
  // 錯題的過濾邏輯在 quiz.wrongIds()，錯題本瀏覽頁也用同一個，數字才會一致。
  const readCount = Object.keys(state.read).filter((id) => conceptById.has(id)).length;
  const wrongCount = wrongIds().length;

  // 整體進度：已經碰過的練習項目 ÷ 全部練習項目
  const totalItems = ck.length + mk.length;
  const seenItems = (ck.length - cardsNew) + (mk.length - mcqsNew);
  const progress = totalItems ? seenItems / totalItems : 0;

  return {
    days, sprint,
    targetDate: state.settings.targetDate,

    cardsDue, cardsNew, cardsHeld, cardsTotal: ck.length,
    mcqsDue, mcqsNew, mcqsHeld, mcqsTotal: mk.length,

    cardGoal, mcqGoal,
    essayGoal: 1,
    oralGoal: 1,

    done,
    readCount,
    conceptTotal: allConcepts.length,
    wrongCount,
    essayTotal: allEssays.length,
    oralTotal: allOrals.length,

    progress,
    streak: state.streak.current,
    bestStreak: state.streak.best
  };
}

/** 今日四項任務是否已達標 */
export function taskStatus(snap = snapshot()) {
  return {
    cards: { done: snap.done.cards, goal: snap.cardGoal, ok: snap.done.cards >= snap.cardGoal && snap.cardGoal > 0 },
    mcqs: { done: snap.done.mcqs, goal: snap.mcqGoal, ok: snap.done.mcqs >= snap.mcqGoal && snap.mcqGoal > 0 },
    essays: { done: snap.done.essays, goal: snap.essayGoal, ok: snap.done.essays >= snap.essayGoal },
    oral: { done: snap.done.oral, goal: snap.oralGoal, ok: snap.done.oral >= snap.oralGoal }
  };
}

/** 最近 n 天的每日練習量，供長條圖使用 */
export function recentDays(n = 7) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const p = (x) => String(x).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const rec = state.daily[key];
    out.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: '日一二三四五六'[d.getDay()],
      total: rec ? rec.cards + rec.mcqs + rec.essays * 5 + rec.oral * 5 : 0,
      rec: rec || null
    });
  }
  return out;
}

/** 目前為止的選擇題正確率（全期間） */
export function accuracy() {
  let asked = 0;
  let right = 0;
  for (const rec of Object.values(state.daily)) {
    asked += rec.mcqs;
    right += rec.mcqRight;
  }
  return { asked, right, pct: asked ? right / asked : 0 };
}

/** 距離目標日的說明文字 */
export function countdownText(snap = snapshot()) {
  if (snap.days === null) return '未設定日期';
  if (snap.days < 0) return `已過 ${Math.abs(snap.days)} 天`;
  if (snap.days === 0) return '就是今天';
  return `剩 ${snap.days} 天`;
}
