/* content.js — 載入教材並建立索引
 *
 * 內容以「知識點」為中心：一個知識點物件同時餵養四種練習模式
 * （閃卡 / 選擇題 / 申論 / 口試）。這裡把它攤平成四份索引供各引擎取用。
 *
 * ★ 重要：所有練習項目的 id 由「知識點 id + 陣列位置」推導。
 *   要新增題目請一律往陣列「尾端」加，不要插在中間，
 *   否則使用者已累積的 SRS 進度會整批錯位對到別題。
 */

import { SUBJECTS, GENERAL_ORAL, SCHOOLS } from '../content/index.js';

export const subjects = SUBJECTS;
export const schools = SCHOOLS;

export const subjectById = new Map();
export const chapterById = new Map();
export const conceptById = new Map();

export const allConcepts = [];
export const allCards = [];
export const allMcqs = [];
export const allEssays = [];
export const allOrals = [];

for (const subject of SUBJECTS) {
  subjectById.set(subject.id, subject);

  subject.chapters.forEach((chapter, ci) => {
    chapter.subjectId = subject.id;
    // 章節 id 已按最終十章編號預留，內容分批補齊。用資料裡寫死的 no，
    // 這樣現在只有第 1、5、6 章時，畫面上仍顯示 1／5／6 而不是 1／2／3。
    chapter.no = chapter.no ?? ci + 1;
    chapterById.set(chapter.id, chapter);

    for (const concept of chapter.concepts) {
      concept.subjectId = subject.id;
      concept.chapterId = chapter.id;
      concept.tags = concept.tags || [];
      conceptById.set(concept.id, concept);
      allConcepts.push(concept);

      (concept.terms || []).forEach((t, i) => {
        allCards.push({
          id: `c:${concept.id}:${i}`,
          conceptId: concept.id,
          subjectId: subject.id,
          chapterId: chapter.id,
          ...t
        });
      });

      (concept.mcqs || []).forEach((m, i) => {
        allMcqs.push({
          id: `q:${concept.id}:${i}`,
          conceptId: concept.id,
          subjectId: subject.id,
          chapterId: chapter.id,
          ...m
        });
      });

      (concept.essays || []).forEach((e, i) => {
        allEssays.push({
          id: `e:${concept.id}:${i}`,
          conceptId: concept.id,
          subjectId: subject.id,
          chapterId: chapter.id,
          ...e
        });
      });

      (concept.oral || []).forEach((o, i) => {
        allOrals.push({
          id: `o:${concept.id}:${i}`,
          conceptId: concept.id,
          subjectId: subject.id,
          chapterId: chapter.id,
          group: '專業題',
          ...o
        });
      });
    }
  });
}

// 通用面試題（為什麼選本所、研究興趣…）不屬於任何知識點。
// 這類題目在實際面試佔比往往高於專業題，所以一視同仁納入抽題池。
GENERAL_ORAL.forEach((o, i) => {
  allOrals.push({
    id: `og:${i}`,
    conceptId: null,
    subjectId: null,
    chapterId: null,
    ...o
  });
});

/* ─────────── 範圍篩選 ─────────── */

/** scope: { subject: 'all'|id, chapter: 'all'|id, only: 'all'|'star'|'must'|'wrong' } */
export const DEFAULT_SCOPE = { subject: 'all', chapter: 'all', only: 'all' };

export function conceptsInScope(scope = DEFAULT_SCOPE, ctx = {}) {
  const starred = new Set(ctx.starred || []);
  return allConcepts.filter((c) => {
    if (scope.subject !== 'all' && c.subjectId !== scope.subject) return false;
    if (scope.chapter !== 'all' && c.chapterId !== scope.chapter) return false;
    if (scope.only === 'star' && !starred.has(c.id)) return false;
    if (scope.only === 'must' && !c.tags.includes('必考')) return false;
    return true;
  });
}

/** 依範圍取出練習項目。pool 是 allCards / allMcqs / allEssays / allOrals 其中之一 */
export function itemsInScope(pool, scope = DEFAULT_SCOPE, ctx = {}) {
  const ids = new Set(conceptsInScope(scope, ctx).map((c) => c.id));
  const wrongSet = ctx.wrong ? new Set(Object.keys(ctx.wrong)) : new Set();
  return pool.filter((it) => {
    // 錯題也要吃科目／章節篩選。原本只看 wrongSet，於是在「練」分頁把科目切成
    // 行銷再選「只練錯題」，出來的仍是全部五科的錯題（且模式卡上的題數也是全站的）。
    // ids 已經是該科／該章的知識點，通用口試題沒有 conceptId 自然被排除。
    if (scope.only === 'wrong') return wrongSet.has(it.id) && ids.has(it.conceptId);
    if (!it.conceptId) return scope.subject === 'all' && scope.only === 'all';  // 通用口試題
    return ids.has(it.conceptId);
  });
}

/* ─────────── 統計小工具 ─────────── */

export function chaptersOf(subjectId) {
  if (subjectId === 'all') return SUBJECTS.flatMap((s) => s.chapters);
  const s = subjectById.get(subjectId);
  return s ? s.chapters : [];
}

export function conceptCount(chapter) {
  return chapter.concepts.length;
}

export function subjectOf(concept) {
  return subjectById.get(concept.subjectId);
}

export function chapterOf(concept) {
  return chapterById.get(concept.chapterId);
}

/** 一個知識點底下總共有幾個練習項目 */
export function drillCount(concept) {
  return (concept.terms || []).length
    + (concept.mcqs || []).length
    + (concept.essays || []).length
    + (concept.oral || []).length;
}
