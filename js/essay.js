/* essay.js — 申論／簡答自評
 *
 * 刻意不做自動批改。申論題的學習訊號來自「自己先產出，再跟範答逐點對照」，
 * 中間那個「我漏了哪一點」的落差感才是記得住的原因。機器打一個分數反而
 * 讓人跳過對照。
 *
 * 所以流程是：先寫（或至少在腦中列點）→ 展開大綱逐點打勾 →
 * 由勾選數建議一個分數 → 使用者確認或自己改。
 */

import { state, save, bumpDaily, today, uid } from './storage.js';
import { allEssays, itemsInScope, conceptById, chapterById, subjectById } from './content.js';
import { shuffle } from './srs.js';
import { openSheet, renderSheet, closeSheet, el, icon, btn, md, empty, toast, setSubjectTheme } from './ui.js';

const byId = new Map(allEssays.map((e) => [e.id, e]));

export function countScope(scope, ctx) {
  return itemsInScope(allEssays, scope, ctx).length;
}

/** 這題寫過幾次、上次幾分 */
export function historyOf(essayId) {
  const rows = state.essayLog.filter((r) => r.essayId === essayId);
  return { times: rows.length, last: rows.length ? rows[rows.length - 1] : null };
}

export function start(scope, ctx, onDone) {
  const pool = itemsInScope(allEssays, scope, ctx);
  if (!pool.length) {
    toast('這個範圍沒有申論題');
    return;
  }

  // 沒寫過的優先；都寫過就挑最久沒碰的
  const scored = pool.map((e) => {
    const h = historyOf(e.id);
    return { e, times: h.times, lastAt: h.last ? h.last.at : '0000-00-00' };
  });
  shuffle(scored);
  scored.sort((a, b) => (a.times - b.times) || (a.lastAt < b.lastAt ? -1 : 1));

  const s = {
    item: scored[0].e,
    revealed: false,
    checked: new Set(),
    score: null,
    answer: '',
    ctx,
    onDone
  };

  openSheet('申論自評', () => {
    save();
    if (s.onDone) s.onDone();
  });
  render(s);
}

function render(s) {
  const e = s.item;
  const concept = conceptById.get(e.conceptId);
  setSubjectTheme(e.subjectId);

  const h = historyOf(e.id);

  const body = el('div', { class: 'essay' },
    el('div', { class: 'concept__crumb' },
      `${subjectById.get(e.subjectId).name}・${chapterById.get(e.chapterId).title}`,
      h.times ? `　·　寫過 ${h.times} 次，上次 ${h.last.score}/5` : ''
    ),
    el('div', { class: 'essay__q', html: md(e.q) })
  );

  if (!s.revealed) {
    body.append(
      el('div', { class: 'field' },
        el('div', { class: 'field__lbl', text: '你的答案' }),
        el('div', { class: 'field__hint', text: '打字或只列重點都可以。趕時間的話，在腦中把要點講一遍再按下面的按鈕也行。' }),
        el('textarea', {
          placeholder: '先自己想過再看解答，落差感才是記得住的原因…',
          oninput: (ev) => { s.answer = ev.target.value; }
        }, s.answer)
      )
    );
    renderSheet({
      body,
      foot: btn('我寫完了，看解答', {
        variant: 'primary', block: true,
        onClick: () => { s.revealed = true; render(s); }
      }),
      count: '',
      progress: 0.3
    });
    return;
  }

  /* ── 展開解答 ── */

  const outline = e.outline || [];
  body.append(
    el('div', { class: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { class: 'layer__head', style: 'background:var(--accent-bg);color:var(--accent)' },
        icon('list'), '答題大綱', el('span', { class: 'badge', text: '勾掉你有寫到的' })
      ),
      el('div', { style: 'padding:12px 14px;display:flex;flex-direction:column;gap:7px' },
        outline.map((point, i) => checkline(s, i, point))
      )
    )
  );

  if (e.rubric && e.rubric.length) {
    body.append(
      el('div', { class: 'explain' },
        el('div', { class: 'explain__t', text: '評分要點（教授在看什麼）' }),
        el('ul', {}, e.rubric.map((r) => el('li', { html: md(r).replace(/^<p>|<\/p>$/g, '') })))
      )
    );
  }

  if (e.sample) {
    body.append(
      el('details', { class: 'layer layer--adv' },
        el('summary', { class: 'layer__head' }, icon('pencil'), '參考答案', icon('chev-d')),
        el('div', { class: 'layer__body', html: md(e.sample) })
      )
    );
  }

  const hit = s.checked.size;
  const suggested = outline.length ? Math.round((hit / outline.length) * 5) : 3;
  if (s.score === null) s.score = suggested;

  body.append(
    el('div', { class: 'field' },
      el('div', { class: 'field__lbl', text: `自評分數（勾到 ${hit}/${outline.length} 個要點，建議 ${suggested} 分）` }),
      el('div', { class: 'scorerow' },
        [0, 1, 2, 3, 4, 5].map((n) => el('button', {
          class: `scorebtn ${s.score === n ? 'is-on' : ''}`, type: 'button',
          onclick: () => { s.score = n; render(s); }
        }, String(n)))
      )
    ),
    btn(concept ? `回去看「${concept.title}」` : '回去看知識點', {
      variant: 'ghost', size: 'sm', icon: 'book',
      onClick: () => {
        submit(s, false);
        closeSheet();
        if (s.ctx.openConcept && concept) s.ctx.openConcept(concept.id);
      }
    })
  );

  renderSheet({
    body,
    foot: btn('記錄這次，換一題', {
      variant: 'primary', block: true,
      onClick: () => { submit(s, true); }
    }),
    count: '',
    progress: 1
  });
}

function checkline(s, i, point) {
  const on = s.checked.has(i);
  return el('button', {
    class: `checkline ${on ? 'is-on' : ''}`, type: 'button',
    onclick: () => {
      if (on) s.checked.delete(i); else s.checked.add(i);
      s.score = null;              // 重算建議分數
      render(s);
    }
  },
    el('span', { class: 'checkline__box' }, icon('check')),
    el('span', { html: md(point).replace(/^<p>|<\/p>$/g, '') })
  );
}

/* 這一題只能記錄一次：使用者可能先按「回去看知識點」再回來，
   旗標放在 session 物件上而不是模組層，否則會跨場次殘留。 */
function submit(s, next) {
  if (!s.submitted) {
    state.essayLog.push({
      essayId: s.item.id,
      score: s.score ?? 0,
      at: today(),
      answer: s.answer.slice(0, 8000)
    });
    if (state.essayLog.length > 500) state.essayLog.splice(0, state.essayLog.length - 500);
    bumpDaily('essays');
    save();
    s.submitted = true;
  }
  if (next) {
    closeSheet();
    // 立刻換下一題，維持節奏
    setTimeout(() => start(s.ctx.scope, s.ctx, s.onDone), 60);
  }
}
