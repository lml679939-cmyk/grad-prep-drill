/* quiz.js — 選擇題與錯題本
 *
 * 錯題本規則：答錯就進去，之後要「連續答對 2 次」才移出。
 * 只對一次就移出太寬鬆——很可能只是猜到或記得選項位置。
 *
 * 選項每次出題都重新洗牌，避免背到「答案在第三個」。
 * ★ 因此撰寫詳解時不要寫「選項 (B) 錯在…」，代號每次都不一樣。
 *
 * SRS：答對記 grade 2（會），答錯記 grade 0（忘記）。選擇題不另外要求自評，
 * 對錯本身就是夠好的訊號，多一次點擊只會拖慢刷題節奏。
 */

import { state, save, bumpDaily, today } from './storage.js';
import { allMcqs, itemsInScope, conceptById, chapterById, subjectById } from './content.js';
import { buildQueue, review, isSprint, shuffle } from './srs.js';
import { openSheet, renderSheet, closeSheet, el, icon, btn, md, empty, toast, setSubjectTheme } from './ui.js';

const byId = new Map(allMcqs.map((m) => [m.id, m]));
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function countScope(scope, ctx) {
  return itemsInScope(allMcqs, scope, ctx).length;
}

/* ─────────── 錯題本 ─────────── */

export function wrongIds() {
  return Object.keys(state.wrong).filter((id) => byId.has(id));
}

function markWrong(id) {
  const prev = state.wrong[id];
  state.wrong[id] = {
    streak: 0,
    count: (prev ? prev.count : 0) + 1,
    lastAt: today()
  };
}

function markRight(id) {
  const prev = state.wrong[id];
  if (!prev) return;
  prev.streak += 1;
  if (prev.streak >= 2) delete state.wrong[id];
}

/* ─────────── 出題 ─────────── */

export function start(scope, ctx, onDone) {
  const pool = itemsInScope(allMcqs, scope, ctx);
  if (!pool.length) {
    toast(scope.only === 'wrong' ? '錯題本是空的，先去刷題' : '這個範圍沒有選擇題');
    return;
  }

  const starred = new Set(state.starred);
  const weight = (id) => {
    const m = byId.get(id);
    const c = conceptById.get(m.conceptId);
    let w = 0;
    if (state.wrong[id]) w += 4;
    if (starred.has(c.id)) w += 2;
    if (c.tags.includes('必考')) w += 1;
    return w;
  };

  // 只練錯題時不套用「到期才出」的排程，錯題本的語意就是隨時可以練
  const ids = scope.only === 'wrong'
    ? shuffle(pool.map((m) => m.id)).slice(0, state.settings.mcqPerSession)
    : buildQueue(pool.map((m) => m.id), { limit: state.settings.mcqPerSession, weight });

  if (!ids.length) {
    toast('這個範圍今天沒有到期的題目，去「練」換個範圍或改練錯題');
    return;
  }

  const s = {
    ids: shuffle(ids),
    idx: 0,
    total: ids.length,
    right: 0,
    picked: null,
    prepared: null,
    ctx,
    onDone
  };

  openSheet(scope.only === 'wrong' ? '錯題重練' : (isSprint() ? '選擇題・衝刺' : '選擇題'), () => {
    save();
    if (s.onDone) s.onDone();
  });
  render(s);
}

function prepare(mcq) {
  const order = mcq.options.map((_, i) => i);
  shuffle(order);
  return {
    mcq,
    opts: order.map((i) => mcq.options[i]),
    answer: order.indexOf(mcq.answer)
  };
}

function render(s) {
  if (s.idx >= s.ids.length) return finish(s);

  if (!s.prepared) s.prepared = prepare(byId.get(s.ids[s.idx]));
  const { mcq, opts, answer } = s.prepared;
  const concept = conceptById.get(mcq.conceptId);
  setSubjectTheme(mcq.subjectId);

  const wrongRec = state.wrong[mcq.id];

  const body = el('div', { class: 'q' },
    el('div', { class: 'concept__crumb' },
      `${subjectById.get(mcq.subjectId).name}・${chapterById.get(mcq.chapterId).title}`,
      wrongRec ? `　·　錯過 ${wrongRec.count} 次` : ''
    ),
    el('div', { class: 'q__stem', html: md(mcq.q) }),
    el('div', { class: 'q__opts' },
      opts.map((text, i) => optionBtn(s, i, text, answer))
    )
  );

  if (s.picked !== null) {
    const ok = s.picked === answer;
    body.append(
      el('div', { class: `verdict ${ok ? 'is-right' : 'is-wrong'}` },
        icon(ok ? 'check' : 'x'),
        ok ? '答對' : '答錯'
      ),
      el('div', { class: 'explain' },
        el('div', { class: 'explain__t', text: '詳解' }),
        el('div', { html: md(mcq.explain) })
      ),
      btn(`回去看「${concept.title}」`, {
        variant: 'ghost', size: 'sm', icon: 'book',
        onClick: () => {
          closeSheet();
          if (s.ctx.openConcept) s.ctx.openConcept(concept.id);
        }
      })
    );
  }

  renderSheet({
    body,
    foot: s.picked === null ? null : nextBtn(s),
    count: `${s.idx + (s.picked === null ? 0 : 1)} / ${s.total}`,
    progress: (s.idx + (s.picked === null ? 0 : 1)) / s.total
  });
}

function optionBtn(s, i, text, answer) {
  const answered = s.picked !== null;
  let cls = 'opt';
  if (answered) {
    if (i === answer) cls += ' is-right';
    else if (i === s.picked) cls += ' is-wrong';
    else cls += ' is-dim';
  }
  return el('button', {
    class: cls, type: 'button', disabled: answered,
    onclick: answered ? null : () => answer_(s, i, answer)
  },
    el('span', { class: 'opt__k', text: KEYS[i] }),
    el('span', { html: md(text) })
  );
}

function answer_(s, picked, answer) {
  const { mcq } = s.prepared;
  const ok = picked === answer;
  s.picked = picked;

  review(mcq.id, ok ? 2 : 0);
  if (ok) { markRight(mcq.id); s.right++; } else { markWrong(mcq.id); }

  bumpDaily('mcqs');
  if (ok) bumpDaily('mcqRight');
  save();
  render(s);
}

function nextBtn(s) {
  const last = s.idx === s.ids.length - 1;
  return btn(last ? '看結果' : '下一題', {
    variant: 'primary', block: true,
    onClick: () => { s.idx++; s.picked = null; s.prepared = null; render(s); }
  });
}

function finish(s) {
  setSubjectTheme(null);
  const pct = s.total ? Math.round((s.right / s.total) * 100) : 0;
  const missed = s.total - s.right;

  renderSheet({
    count: `${s.total} / ${s.total}`,
    progress: 1,
    body: el('div', { class: 'concept' },
      el('div', { class: 'statgrid' },
        stat(s.right, '答對'),
        stat(missed, '答錯'),
        stat(`${pct}%`, '正確率')
      ),
      missed > 0
        ? el('div', { class: 'callout' },
          el('div', { class: 'callout__t', text: '錯的題目已進錯題本' }),
          el('div', { text: '要連續答對 2 次才會移出。在「練」的範圍選「只練錯題」隨時可以重刷。' })
        )
        : el('div', { class: 'callout' },
          el('div', { class: 'callout__t', text: '全對' }),
          el('div', { text: '這個範圍暫時穩了，下次到期時間已往後排。' })
        )
    ),
    foot: btn('完成', { variant: 'primary', block: true, onClick: closeSheet })
  });
}

function stat(n, label) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__n', text: String(n) }),
    el('div', { class: 'stat__l', text: label })
  );
}
