/* flash.js — 名詞閃卡（間隔複習）
 *
 * 正面只給名詞，逼自己先在腦中講一遍定義再翻面——這一步是整個模式的重點，
 * 直接看答案等於沒練到。翻面後四級自評餵給 SM-2 排下次複習時間。
 *
 * 評「忘記」的卡片會排回本輪隊尾再考一次（同一輪內至少要對過一次才放行）。
 */

import { state, save, bumpDaily } from './storage.js';
import { allCards, itemsInScope, conceptById, chapterById, subjectById } from './content.js';
import { buildQueue, review, intervalLabel, GRADES, isSprint, shuffle } from './srs.js';
import { openSheet, renderSheet, closeSheet, el, icon, btn, md, empty, toast, setSubjectTheme } from './ui.js';

const byId = new Map(allCards.map((c) => [c.id, c]));

export function countScope(scope, ctx) {
  return itemsInScope(allCards, scope, ctx).length;
}

export function start(scope, ctx, onDone) {
  const pool = itemsInScope(allCards, scope, ctx);
  if (!pool.length) {
    toast('這個範圍沒有名詞卡');
    return;
  }

  const starred = new Set(state.starred);
  const weight = (id) => {
    const card = byId.get(id);
    const c = conceptById.get(card.conceptId);
    let w = 0;
    if (starred.has(c.id)) w += 2;
    if (c.tags.includes('必考')) w += 1;
    if (state.wrong[id]) w += 3;
    return w;
  };

  const queue = buildQueue(pool.map((c) => c.id), {
    limit: state.settings.cardPerSession,
    weight
  });

  if (!queue.length) {
    toast('這個範圍今天沒有到期的卡片，去「練」選其他範圍');
    return;
  }

  const s = {
    queue: shuffle(queue),
    idx: 0,
    total: queue.length,
    graded: 0,
    flipped: false,
    onDone
  };

  openSheet(isSprint() ? '名詞閃卡・衝刺' : '名詞閃卡', () => {
    save();
    if (s.onDone) s.onDone();
  });
  render(s);
}

function render(s) {
  if (s.idx >= s.queue.length) return finish(s);

  const card = byId.get(s.queue[s.idx]);
  const concept = conceptById.get(card.conceptId);
  setSubjectTheme(card.subjectId);

  const body = s.flipped ? back(card, concept) : front(card);
  const foot = s.flipped ? grades(s, card) : flipBtn(s);

  renderSheet({
    body,
    foot,
    count: `${s.graded} / ${s.total}`,
    progress: s.graded / s.total
  });
}

function front(card) {
  return el('div', { class: 'flash' },
    el('div', { class: 'flash__card' },
      el('div', { class: 'flash__term', text: card.term }),
      card.en && el('div', { class: 'flash__en', text: card.en }),
      el('div', { class: 'flash__hint', text: '先在心裡講一遍定義，再翻面' })
    )
  );
}

function back(card, concept) {
  const chapter = chapterById.get(card.chapterId);
  const subject = subjectById.get(card.subjectId);

  return el('div', { class: 'flash' },
    el('div', { class: 'flash__card' },
      el('div', { class: 'flash__back' },
        el('div', { class: 'flash__term', text: card.term }),
        card.en && el('div', { class: 'flash__en', text: card.en }),
        el('div', { class: 'flash__def', html: md(card.def) }),
        card.tip && el('div', { class: 'callout' },
          el('div', { class: 'callout__t', text: '面試講法' }),
          el('div', { html: md(card.tip) })
        ),
        el('div', { class: 'flash__from', text: `${subject.name}・${chapter.title}｜${concept.title}` })
      )
    )
  );
}

function flipBtn(s) {
  return btn('翻面看答案', {
    variant: 'primary', block: true,
    onClick: () => { s.flipped = true; render(s); }
  });
}

function grades(s, card) {
  const row = el('div', { class: 'gradegrid' });
  for (const { g, label } of GRADES) {
    row.append(el('button', {
      class: 'grade', type: 'button', dataset: { g },
      onclick: () => grade(s, card, g)
    },
      label,
      el('small', { text: intervalLabel(card.id, g) })
    ));
  }
  return row;
}

function grade(s, card, g) {
  review(card.id, g);
  bumpDaily('cards');
  s.graded++;

  // 評「忘記」的卡片排回隊尾，本輪還要再見一次面
  if (g === 0 && s.queue.length < s.total + 12) {
    s.queue.push(card.id);
  }

  s.idx++;
  s.flipped = false;
  save();
  render(s);
}

function finish(s) {
  setSubjectTheme(null);
  renderSheet({
    count: `${s.graded} / ${s.total}`,
    progress: 1,
    body: empty('check', '這一輪刷完了', `複習了 ${s.graded} 張卡。下次到期時間已排好，回「今天」看還有什麼要做。`),
    foot: btn('完成', { variant: 'primary', block: true, onClick: closeSheet })
  });
}
