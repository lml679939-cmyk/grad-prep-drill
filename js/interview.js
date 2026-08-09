/* interview.js — 面試模擬 ＋ 我的素材庫
 *
 * 兩件事在這裡綁在一起，因為它們在真實面試裡就是同一件事：
 * 教授問「請舉例說明」時，答不出來通常不是不懂理論，而是沒有事先把
 * 自己的經歷跟理論掛勾。所以答完題一定會把素材庫攤在旁邊提醒。
 *
 * 素材庫的欄位刻意照 STAR 的骨架（情境→行動→結果）再加一欄「可扣什麼理論」，
 * 最後那欄才是這個模組跟一般履歷筆記的差別。
 *
 * 計時用牆鐘（記結束的絕對時刻，而非每秒減一）。切分頁或鎖屏時
 * setInterval 會被節流甚至凍結，用倒數變數會永久偏掉。
 */

import { state, save, bumpDaily, today, uid } from './storage.js';
import { allOrals, itemsInScope, conceptById, subjectById, schools } from './content.js';
import { shuffle } from './srs.js';
import {
  openSheet, renderSheet, closeSheet, openModal, closeModal,
  el, icon, btn, md, empty, toast, setSubjectTheme, $
} from './ui.js';

const byId = new Map(allOrals.map((o) => [o.id, o]));

export function countScope(scope, ctx) {
  return itemsInScope(allOrals, scope, ctx).length;
}

function timesAsked(oralId) {
  return state.oralLog.filter((r) => r.oralId === oralId).length;
}

/* ─────────── 抽題 ─────────── */

export function start(scope, ctx, onDone) {
  let pool = itemsInScope(allOrals, scope, ctx);

  // 範圍限縮到某一科時，itemsInScope 會濾掉沒有科目的通用題；
  // 但「為什麼選本所」這類題目任何時候都值得練，所以固定補回三成。
  if (scope.subject !== 'all' || scope.only !== 'all') {
    const general = allOrals.filter((o) => !o.conceptId);
    pool = pool.concat(shuffle([...general]).slice(0, Math.max(2, Math.ceil(pool.length * 0.3))));
  }

  if (!pool.length) {
    toast('這個範圍沒有口試題');
    return;
  }

  // 沒練過的優先
  const sorted = shuffle([...pool]).sort((a, b) => timesAsked(a.id) - timesAsked(b.id));

  const s = {
    item: sorted[0],
    phase: 'ready',        // ready → speaking → review
    endAt: null,
    elapsed: 0,
    timer: null,
    ctx,
    onDone
  };

  openSheet('面試模擬', () => {
    stopTimer(s);
    save();
    if (s.onDone) s.onDone();
  });
  render(s);
}

/* ─────────── 計時（牆鐘） ─────────── */

function startTimer(s) {
  const secs = state.settings.oralSeconds;
  s.endAt = Date.now() + secs * 1000;
  stopTimer(s);
  s.timer = setInterval(() => tick(s), 250);   // 取樣快於 1 秒才不會掉秒
  tick(s);
}

function stopTimer(s) {
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
}

function tick(s) {
  const node = $('#oral-timer');
  if (!node) return stopTimer(s);
  const leftMs = s.endAt - Date.now();
  const over = leftMs < 0;
  const secs = Math.ceil(Math.abs(leftMs) / 1000);
  node.textContent = `${over ? '+' : ''}${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, '0')}`;
  node.classList.toggle('is-over', over);
}

/* ─────────── 畫面 ─────────── */

function render(s) {
  const o = s.item;
  setSubjectTheme(o.subjectId);

  const asked = timesAsked(o.id);
  const head = el('div', { class: 'concept__crumb' },
    o.conceptId
      ? `${subjectById.get(o.subjectId).name}・專業題`
      : (o.group || '通用題'),
    asked ? `　·　練過 ${asked} 次` : ''
  );

  if (s.phase === 'ready') return renderReady(s, head);
  if (s.phase === 'speaking') return renderSpeaking(s, head);
  return renderReview(s, head);
}

function renderReady(s, head) {
  const o = s.item;
  renderSheet({
    body: el('div', { class: 'oral' },
      head,
      el('div', { class: 'oral__q', html: md(o.q) }),
      el('div', { class: 'callout' },
        el('div', { class: 'callout__t', text: '怎麼用這個模式' }),
        el('div', { text: `按下開始後有 ${state.settings.oralSeconds} 秒，出聲把答案講完整一遍——真的出聲，在心裡想跟講出來是兩件事。講完再看框架，對照自己漏了什麼。` })
      )
    ),
    foot: btn('開始作答', {
      variant: 'primary', block: true, icon: 'mic',
      onClick: () => { s.phase = 'speaking'; render(s); startTimer(s); }
    }),
    count: '',
    progress: 0.2
  });
}

function renderSpeaking(s, head) {
  const o = s.item;
  renderSheet({
    body: el('div', { class: 'oral' },
      head,
      el('div', { class: 'oral__q', html: md(o.q) }),
      el('div', { class: 'oral__bar' },
        el('div', { class: 'oral__timer', id: 'oral-timer', text: '—' }),
        el('div', { class: 'oral__note', text: '出聲講。超時會繼續往上加，不會強制中斷。' })
      )
    ),
    foot: btn('我講完了', {
      variant: 'primary', block: true,
      onClick: () => {
        s.elapsed = Math.max(0, Math.round((Date.now() - (s.endAt - state.settings.oralSeconds * 1000)) / 1000));
        stopTimer(s);
        s.phase = 'review';
        logIt(s);
        render(s);
      }
    }),
    count: '',
    progress: 0.6
  });
}

function renderReview(s, head) {
  const o = s.item;
  const concept = o.conceptId ? conceptById.get(o.conceptId) : null;

  const body = el('div', { class: 'oral' },
    head,
    el('div', { class: 'oral__q', html: md(o.q) }),
    el('div', { class: 'oral__note', text: `你講了 ${s.elapsed} 秒（建議 ${state.settings.oralSeconds} 秒內）` })
  );

  if (o.framework && o.framework.length) {
    body.append(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' }, icon('list'), '答題框架'),
        el('div', { class: 'steps' }, o.framework.map((f) => el('div', { class: 'step', html: md(f).replace(/^<p>|<\/p>$/g, '') })))
      )
    );
  }

  if (o.pitfall) {
    body.append(
      el('div', { class: 'explain' },
        el('div', { class: 'explain__t', text: '常見地雷' }),
        el('div', { html: md(o.pitfall) })
      )
    );
  }

  if (o.schools) {
    body.append(
      el('div', { class: 'callout' },
        el('div', { class: 'callout__t', text: '各校側重' }),
        el('div', { html: md(o.schools) })
      )
    );
  }

  // 素材庫：舉例類題目最容易卡在這裡
  body.append(storyPanel(s));

  if (concept) {
    body.append(btn(`回去看「${concept.title}」`, {
      variant: 'ghost', size: 'sm', icon: 'book',
      onClick: () => {
        closeSheet();
        if (s.ctx.openConcept) s.ctx.openConcept(concept.id);
      }
    }));
  }

  renderSheet({
    body,
    foot: el('div', { class: 'btnrow' },
      btn('換一題', { onClick: () => { closeSheet(); setTimeout(() => start(s.ctx.scope, s.ctx, s.onDone), 60); } }),
      btn('完成', { variant: 'primary', onClick: closeSheet })
    ),
    count: '',
    progress: 1
  });
}

function storyPanel(s) {
  const wrap = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('bulb'), '我的素材庫')
  );

  if (!state.stories.length) {
    wrap.append(
      el('div', { class: 'field__hint', style: 'margin-bottom:10px' },
        '教授最常追問「可以舉個例子嗎」。先把自己的專題、作品、打工經驗寫下來，並標好可以扣哪個理論，臨場才接得上。'),
      btn('新增第一則素材', { size: 'sm', icon: 'plus', onClick: () => editStory(null, () => render(s)) })
    );
    return wrap;
  }

  wrap.append(
    el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      state.stories.map((st) => el('div', { class: 'storycard' },
        el('div', { class: 'storycard__t', text: st.title || '（未命名）' }),
        st.result && el('div', { class: 'storycard__l', text: st.result }),
        st.theory && el('div', { class: 'storycard__theory', text: `→ ${st.theory}` })
      ))
    ),
    el('div', { style: 'margin-top:10px' },
      btn('管理素材', { size: 'sm', variant: 'ghost', icon: 'pencil', onClick: () => openStoryManager(() => render(s)) })
    )
  );
  return wrap;
}

function logIt(s) {
  state.oralLog.push({ oralId: s.item.id, seconds: s.elapsed, at: today() });
  if (state.oralLog.length > 500) state.oralLog.splice(0, state.oralLog.length - 500);
  bumpDaily('oral');
  save();
}

/* ─────────── 素材庫 ─────────── */

export function openStoryManager(onChange) {
  const body = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });

  const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const redraw = () => {
    list.replaceChildren();
    if (!state.stories.length) {
      list.append(el('div', { class: 'field__hint', text: '還沒有素材。按下面的按鈕新增。' }));
    }
    for (const st of state.stories) {
      list.append(el('div', { class: 'storycard' },
        el('div', { class: 'storycard__t', text: st.title || '（未命名）' }),
        st.theory && el('div', { class: 'storycard__theory', text: `→ ${st.theory}` }),
        el('div', { class: 'btnrow', style: 'margin-top:9px' },
          btn('編輯', { size: 'sm', onClick: () => editStory(st, () => { redraw(); onChange?.(); }) }),
          btn('刪除', { size: 'sm', variant: 'danger', onClick: () => {
            if (!window.confirm(`刪除「${st.title || '未命名'}」？`)) return;
            state.stories = state.stories.filter((x) => x.id !== st.id);
            save(); redraw(); onChange?.();
          } })
        )
      ));
    }
  };
  redraw();

  body.append(
    el('div', { class: 'field__hint' },
      '每則素材照「情境 → 我做了什麼 → 結果 → 可以扣什麼理論」寫。面試被問到舉例時就從這裡調。'),
    list,
    btn('新增素材', { variant: 'primary', block: true, icon: 'plus',
      onClick: () => editStory(null, () => { redraw(); onChange?.(); }) })
  );

  openModal('我的素材庫', body);
}

export function editStory(story, onSave) {
  const isNew = !story;
  const draft = story ? { ...story } : { id: uid(), title: '', situation: '', action: '', result: '', theory: '' };

  const field = (label, key, hint, rows) => el('div', { class: 'field' },
    el('div', { class: 'field__lbl', text: label }),
    hint && el('div', { class: 'field__hint', text: hint }),
    rows
      ? el('textarea', { style: `min-height:${rows * 26}px`, oninput: (e) => { draft[key] = e.target.value; } }, draft[key])
      : el('input', { type: 'text', value: draft[key], oninput: (e) => { draft[key] = e.target.value; } })
  );

  const body = el('div', { style: 'display:flex;flex-direction:column;gap:13px' },
    field('標題', 'title', '一句話認得出來就好，例如「畢業專題」「暑期實習」'),
    field('情境', 'situation', '當時的問題或背景是什麼', 3),
    field('我做了什麼', 'action', '你的具體行動，不是團隊的', 3),
    field('結果', 'result', '有數字最好，沒有就講具體變化', 3),
    field('可以扣什麼理論', 'theory', '例如：顧客痛點洞察、STP 中的利基定位、MVP 與精實創業'),
    el('div', { class: 'btnrow' },
      btn('取消', { onClick: closeModal }),
      btn('儲存', { variant: 'primary', onClick: () => {
        if (!draft.title.trim()) { toast('至少給它一個標題'); return; }
        if (isNew) state.stories.push(draft);
        else Object.assign(state.stories.find((x) => x.id === draft.id), draft);
        save();
        closeModal();
        toast('已儲存');
        onSave?.();
      } })
    )
  );

  openModal(isNew ? '新增素材' : '編輯素材', body);
}

/* ─────────── 各校側重（給「我」分頁用） ─────────── */

export function openSchoolNotes() {
  const body = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
    el('div', { class: 'field__hint' },
      '同一題在不同學校要強調的重點不一樣。這裡整理幾間行銷／企管所各自的調性，面試前一天再掃一次。'),
    schools.map((s) => el('div', { class: 'card' },
      el('div', { class: 'card__head' }, icon('star'), s.name),
      el('div', { class: 'field__hint', style: 'margin-bottom:8px', text: s.program }),
      el('div', { html: md(s.focus) })
    ))
  );
  openModal('各校側重', body);
}
