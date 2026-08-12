/* wrongbook.js — 錯題本瀏覽頁
 *
 * 在這一頁出現之前，錯題本只能「重練」——題目洗一洗丟出來，
 * 使用者永遠不知道自己到底哪裡反覆錯。但那正是整個 App 裡
 * 診斷訊號最強的一筆資料：同一個知識點錯三次，代表的是觀念沒建立，
 * 不是手滑。所以這一頁以「知識點」而非「題目」為單位聚合，
 * 讓最該回頭補的那幾個知識點自己浮到最上面。
 *
 * 排序：知識點總錯次數 → 題數 → 最近答錯的日期。
 *
 * ★ 取 id 一律走 quiz.wrongIds()，它會濾掉教材改版後已不存在的題目。
 *   直接讀 state.wrong 的 key 會把失效紀錄一起算進來，數字灌水
 *   （plan.js 的 wrongCount 曾經就是這樣，已一併改掉）。
 */

import { state, formatDay } from './storage.js';
import { allMcqs, conceptById, chapterById, subjectById } from './content.js';
import * as quiz from './quiz.js';
import {
  openSheet, renderSheet, closeSheet, el, icon, btn, md,
  empty, sectionTitle, setSubjectTheme
} from './ui.js';

const byId = new Map(allMcqs.map((m) => [m.id, m]));

/* ─────────── 聚合 ─────────── */

/** 錯題依知識點聚合，已排序。也給 app.js 的「我」分頁拿來顯示筆數。 */
export function groups() {
  const map = new Map();

  for (const id of quiz.wrongIds()) {
    const mcq = byId.get(id);
    const rec = state.wrong[id];
    let g = map.get(mcq.conceptId);
    if (!g) {
      g = {
        concept: conceptById.get(mcq.conceptId),
        subject: subjectById.get(mcq.subjectId),
        chapter: chapterById.get(mcq.chapterId),
        items: [], total: 0, lastAt: ''
      };
      map.set(mcq.conceptId, g);
    }
    g.items.push({ mcq, rec });
    g.total += rec.count;
    if ((rec.lastAt || '') > g.lastAt) g.lastAt = rec.lastAt || '';
  }

  for (const g of map.values()) {
    g.items.sort((a, b) =>
      b.rec.count - a.rec.count
      || (b.rec.lastAt || '').localeCompare(a.rec.lastAt || ''));
  }

  return [...map.values()].sort((a, b) =>
    b.total - a.total
    || b.items.length - a.items.length
    || b.lastAt.localeCompare(a.lastAt));
}

/** 各科的錯題分佈，題數多的在前 */
function bySubject(gs) {
  const map = new Map();
  for (const g of gs) {
    const cur = map.get(g.subject.id) || { subject: g.subject, items: 0, total: 0 };
    cur.items += g.items.length;
    cur.total += g.total;
    map.set(g.subject.id, cur);
  }
  return [...map.values()].sort((a, b) => b.items - a.items || b.total - a.total);
}

/* ─────────── 畫面 ─────────── */

export function open(ctx, onChange) {
  // 這一頁橫跨五科，主色要退回骨幹的靛藍。進場時就設，否則從某一科的
  // 錯題重練關掉再回來時，整頁會殘留那一科的顏色（重練會把主題切成該科）。
  setSubjectTheme(null);
  openSheet('錯題本', () => { setSubjectTheme(null); onChange?.(); });
  draw(ctx, onChange);
}

function draw(ctx, onChange) {
  const gs = groups();
  const items = gs.reduce((n, g) => n + g.items.length, 0);

  if (!items) {
    renderSheet({
      count: '',
      progress: 0,
      body: empty('check', '錯題本是空的',
        '選擇題答錯會自動收進來，連續答對 2 次才移出。現在沒有欠的。'),
      foot: btn('關閉', { variant: 'ghost', block: true, onClick: closeSheet })
    });
    return;
  }

  const near = gs.reduce((n, g) => n + g.items.filter((it) => it.rec.streak >= 1).length, 0);

  renderSheet({
    count: `${items} 題`,
    progress: 0,
    body: el('div', { class: 'concept' },
      el('div', { class: 'statgrid' },
        stat(items, '錯題'),
        stat(gs.length, '個知識點'),
        stat(near, '再對 1 次移出')
      ),

      el('div', { class: 'callout' },
        el('div', { class: 'callout__t', text: '怎麼看這一頁' }),
        el('div', { text: '同一個知識點反覆錯，代表觀念沒建立而不是手滑——先點進去把教材重看一遍，再回來重練。' })
      ),

      gs.length > 1 && el('div', {},
        sectionTitle('各科分佈', '點一下只重練該科'),
        el('div', { class: 'card card--pad0', style: 'margin-top:8px' },
          el('div', { class: 'rows' },
            bySubject(gs).map((s) => subjectRow(s, ctx, onChange))
          )
        )
      ),

      el('div', {},
        sectionTitle('最常錯的知識點', `${gs.length} 個`),
        el('div', { class: 'wblist', style: 'margin-top:8px' },
          gs.map((g) => conceptCard(g, ctx))
        )
      )
    ),
    foot: btn(`重練全部錯題（${items} 題）`, {
      variant: 'primary', block: true, icon: 'shuffle',
      onClick: () => drill({ subject: 'all', chapter: 'all', only: 'wrong' }, ctx, onChange)
    })
  });
}

function subjectRow(s, ctx, onChange) {
  return el('button', {
    class: 'row', type: 'button',
    onclick: () => drill({ subject: s.subject.id, chapter: 'all', only: 'wrong' }, ctx, onChange)
  },
    el('span', { class: 'chip__dot', style: `--c:${s.subject.accent}` }),
    el('span', { class: 'row__main' },
      el('span', { class: 'row__t', text: s.subject.name }),
      el('span', { class: 'row__s', text: `${s.items} 題・共錯 ${s.total} 次` })
    ),
    icon('chev-r')
  );
}

function conceptCard(g, ctx) {
  return el('div', { class: 'card card--pad0' },
    el('button', {
      class: 'row', type: 'button',
      onclick: () => {
        closeSheet();
        setTimeout(() => ctx.openConcept?.(g.concept.id), 60);
      }
    },
      el('span', { class: 'chip__dot', style: `--c:${g.subject.accent}` }),
      el('span', { class: 'row__main' },
        el('span', { class: 'row__t', text: g.concept.title }),
        el('span', {
          class: 'row__s',
          text: `${g.subject.name}・第 ${g.chapter.no} 章・${g.items.length} 題・共錯 ${g.total} 次`
        })
      ),
      icon('chev-r')
    ),
    el('div', { class: 'wqs' }, g.items.map(questionRow))
  );
}

function questionRow(it) {
  const { rec } = it;
  return el('div', { class: 'wq' },
    // ★ md() 的結果必須放在自己的容器裡。.wq 是 block 不是 flex，
    //   所以這裡不會像 .step 那樣被拆成多欄（見 CLAUDE.md 的開發陷阱）。
    el('div', { class: 'wq__stem', html: md(it.mcq.q) }),
    el('div', { class: 'wq__meta' },
      el('span', { class: 'wq__n', text: `錯 ${rec.count} 次` }),
      el('span', {
        class: rec.streak >= 1 ? 'wq__near' : '',
        text: rec.streak >= 1 ? '再對 1 次就移出' : '要連續答對 2 次'
      }),
      rec.lastAt ? el('span', { text: `最後答錯 ${formatDay(rec.lastAt)}` }) : null
    )
  );
}

function stat(n, label) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__n', text: String(n) }),
    el('div', { class: 'stat__l', text: label })
  );
}

/* 練完直接回到錯題本，才看得到清單少了哪幾題——這是這一頁存在的理由。
   先 closeSheet 再開，是因為全站共用同一個 #sheet（同 drawConcept 的作法）。 */
function drill(scope, ctx, onChange) {
  closeSheet();
  setTimeout(() => {
    quiz.start(scope, ctx, () => {
      onChange?.();
      setTimeout(() => open(ctx, onChange), 60);
    });
  }, 60);
}
