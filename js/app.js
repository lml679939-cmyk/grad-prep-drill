/* app.js — 進入點：分頁路由、四個畫面的渲染、事件接線 */

import {
  state, save, flush, today, formatDay, dateKey,
  bumpDaily, exportJSON, importJSON, resetAll, TEXT_SIZES
} from './storage.js';

import {
  subjects, schools, allConcepts, allCards, allMcqs, allEssays, allOrals,
  conceptById, chapterById, subjectById, chaptersOf,
  itemsInScope, conceptsInScope, DEFAULT_SCOPE, drillCount
} from './content.js';

import { isSprint, daysToTarget, countDue, countNew, getRec } from './srs.js';
import { snapshot, taskStatus, recentDays, accuracy, countdownText } from './plan.js';

import * as flash from './flash.js';
import * as quiz from './quiz.js';
import * as essay from './essay.js';
import * as interview from './interview.js';

import {
  $, $$, el, icon, btn, md, clear, append, toast, empty, sectionTitle,
  openModal, closeModal, isModalOpen, openSheet, renderSheet, closeSheet,
  isSheetOpen, setSubjectTheme
} from './ui.js';

/* ═══════════ 狀態 ═══════════ */

let view = 'today';
let scope = { ...DEFAULT_SCOPE };
const openChapters = new Set();
let readSubject = subjects[0] ? subjects[0].id : 'all';

const ctx = () => ({
  starred: state.starred,
  wrong: state.wrong,
  scope,
  openConcept
});

/* ═══════════ 路由 ═══════════ */

const RENDERERS = {
  today: renderToday,
  read: renderRead,
  drill: renderDrill,
  me: renderMe
};

function go(next) {
  view = next;
  for (const sec of $$('.view')) sec.hidden = sec.dataset.view !== next;
  for (const tab of $$('.tab')) tab.classList.toggle('is-active', tab.dataset.go === next);
  setSubjectTheme(next === 'read' ? readSubject : null);
  refresh();
  window.scrollTo(0, 0);
}

function refresh() {
  RENDERERS[view]?.();
  renderCountdownChip();
}

function renderCountdownChip() {
  const snap = snapshot();
  $('#countdown-text').textContent = countdownText(snap);
  $('#countdown-chip').classList.toggle('is-sprint', snap.sprint);
}

/* ═══════════ 今天 ═══════════ */

function renderToday() {
  const host = clear($('#view-today'));
  const snap = snapshot();
  const st = taskStatus(snap);

  /* 倒數主視覺 */
  const hero = el('div', { class: `card hero ${snap.sprint ? 'is-sprint' : ''}` },
    el('div', { class: 'hero__label', text: snap.sprint ? '衝刺期・距離推甄面試' : '距離推甄面試' }),
    el('div', { class: 'hero__days' },
      el('span', { class: 'hero__num', text: snap.days === null ? '—' : String(Math.abs(snap.days)) }),
      el('span', { class: 'hero__unit', text: snap.days === null ? '未設定' : (snap.days < 0 ? '天前已過' : '天') })
    ),
    el('div', { class: 'hero__date', text: `目標日 ${formatDay(snap.targetDate)}` }),
    el('div', { class: 'hero__row' },
      el('div', { class: 'hero__stat' }, el('b', { text: `${Math.round(snap.progress * 100)}%` }), '整體進度'),
      el('div', { class: 'hero__stat' }, el('b', { text: String(snap.readCount) }), `／${snap.conceptTotal} 知識點`),
      el('div', { class: 'hero__stat' }, el('b', { text: String(snap.streak) }), '連續天數')
    ),
    snap.sprint && el('div', { class: 'hero__warn' },
      icon('warn'),
      el('div', { text: '已進入衝刺期：練習改為忽略排程全刷，優先出錯題、標記與必考。' })
    )
  );

  /* 今日任務 */
  const tasks = el('div', { class: 'tasklist' },
    taskCard('cards', 'cards', '名詞閃卡', st.cards, '把講不出口的名詞補起來',
      () => flash.start(scope, ctx(), refresh)),
    taskCard('list', 'mcqs', '選擇題', st.mcqs, '答錯自動進錯題本',
      () => quiz.start(scope, ctx(), refresh)),
    taskCard('pencil', 'essays', '申論自評', st.essays, '先自己寫，再對照範答逐點打勾',
      () => essay.start(scope, ctx(), refresh)),
    taskCard('mic', 'oral', '面試模擬', st.oral, '出聲講一遍，再看框架',
      () => interview.start(scope, ctx(), refresh))
  );

  /* 快速入口 */
  const quick = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('shuffle'), '快速練習'),
    el('div', { class: 'btnrow' },
      btn(`錯題重練（${snap.wrongCount}）`, {
        size: 'sm', icon: 'warn',
        onClick: () => {
          if (!snap.wrongCount) return toast('錯題本是空的，先去刷題');
          quiz.start({ ...scope, only: 'wrong' }, ctx(), refresh);
        }
      }),
      btn('只練必考', {
        size: 'sm', icon: 'star',
        onClick: () => quiz.start({ ...scope, only: 'must' }, ctx(), refresh)
      })
    )
  );

  append(host, [
    hero,
    sectionTitle('今日任務', `${doneCount(st)} / 4 完成`),
    tasks,
    quick,
    todayTip(snap)
  ]);
}

function doneCount(st) {
  return [st.cards, st.mcqs, st.essays, st.oral].filter((t) => t.ok).length;
}

function taskCard(iconName, key, name, status, sub, onClick) {
  return el('button', {
    class: `task ${status.ok ? 'is-done' : ''}`, type: 'button', onclick: onClick
  },
    el('span', { class: 'task__ic' }, icon(status.ok ? 'check' : iconName)),
    el('span', { class: 'task__main' },
      el('span', { class: 'task__name', text: name }),
      el('span', { class: 'task__sub', text: sub })
    ),
    // 達標後只留「已達標」——再顯示一個「還差 0 個」的 0 只會讓人愣一下
    status.ok
      ? el('span', { class: 'task__n' }, el('small', { text: '已達標' }))
      : el('span', { class: 'task__n' },
        String(status.goal - status.done),
        el('small', { text: ` / ${status.goal}` })
      )
  );
}

function todayTip(snap) {
  let text;
  if (snap.days === null) text = '還沒設定目標日期。點右上角的時間標籤設定，每日進度才算得出來。';
  else if (snap.days < 0) text = '目標日已過。如果還有下一場面試，去「我」改一下目標日期。';
  else if (snap.sprint) text = '剩不到兩週了。這階段別再開新章節，把錯題本清乾淨、必考題講順比較有用。';
  else if (snap.cardsNew > 0 && snap.readCount === 0) text = '從「讀」開始：先挑一章讀完面試層，回來刷閃卡才有東西可複習。';
  else text = `目前每天要碰 ${snap.cardGoal} 張卡、${snap.mcqGoal} 題選擇題，才能在目標日前把 ${snap.conceptTotal} 個知識點滾完。`;

  return el('div', { class: 'callout' },
    el('div', { class: 'callout__t', text: '現在該做什麼' }),
    el('div', { text })
  );
}

/* ═══════════ 讀 ═══════════ */

function renderRead() {
  const host = clear($('#view-read'));

  const chips = el('div', { class: 'subjrow' },
    subjects.map((s) => el('button', {
      class: `chip ${readSubject === s.id ? 'is-on' : ''}`, type: 'button',
      onclick: () => { readSubject = s.id; setSubjectTheme(s.id); renderRead(); }
    },
      el('span', { class: 'chip__dot', style: `--c:${s.accent}` }),
      s.name,
      el('small', { text: String(s.chapters.reduce((n, c) => n + c.concepts.length, 0)) })
    ))
  );

  const subject = subjectById.get(readSubject);
  const list = el('div', { class: 'card card--pad0' });

  if (!subject || !subject.chapters.length) {
    list.append(empty('book', '這一科還沒有內容', '之後會分批補上。'));
  } else {
    for (const chapter of subject.chapters) {
      list.append(chapterNode(chapter));
    }
  }

  append(host, [chips, list, readProgressCard(subject)]);
}

function chapterNode(chapter) {
  const isOpen = openChapters.has(chapter.id);
  const readN = chapter.concepts.filter((c) => state.read[c.id]).length;

  const node = el('div', { class: `chapter ${isOpen ? 'is-open' : ''}` },
    el('button', {
      class: 'chapter__head', type: 'button',
      onclick: () => {
        if (openChapters.has(chapter.id)) openChapters.delete(chapter.id);
        else openChapters.add(chapter.id);
        renderRead();
      }
    },
      el('span', { class: 'chapter__no', text: String(chapter.no) }),
      el('span', { class: 'chapter__t', text: chapter.title }),
      el('span', { class: 'chapter__meta', text: `${readN}/${chapter.concepts.length}` }),
      icon('chev-d')
    )
  );

  if (isOpen) {
    node.append(
      el('div', { class: 'chapter__body' },
        chapter.concepts.map((c) => el('button', {
          class: `conceptrow ${state.read[c.id] ? 'is-read' : ''}`, type: 'button',
          onclick: () => openConcept(c.id)
        },
          el('span', { class: 'conceptrow__dot' }),
          el('span', { class: 'conceptrow__t', text: c.title }),
          state.starred.includes(c.id) && icon('star', 'ic is-star'),
          icon('chev-r')
        )),
        el('div', { style: 'margin-top:4px' },
          btn('練這一章', {
            size: 'sm', icon: 'target', block: true,
            onClick: () => {
              scope = { subject: chapter.subjectId, chapter: chapter.id, only: 'all' };
              go('drill');
              toast(`範圍已設為「${chapter.title}」`);
            }
          })
        )
      )
    );
  }
  return node;
}

function readProgressCard(subject) {
  if (!subject) return null;
  const total = subject.chapters.reduce((n, c) => n + c.concepts.length, 0);
  const done = subject.chapters.reduce((n, c) => n + c.concepts.filter((x) => state.read[x.id]).length, 0);
  const pct = total ? done / total : 0;

  return el('div', { class: 'card' },
    el('div', { class: 'meter' },
      el('div', { class: 'meter__top' },
        `${subject.name}讀完進度`,
        el('b', { text: `${done}/${total}` }),
        el('span', { text: `${Math.round(pct * 100)}%` })
      ),
      el('div', { class: 'progressbar' }, el('div', { class: 'progressbar__fill', style: `width:${pct * 100}%` }))
    )
  );
}

/* ═══════════ 知識點詳情 ═══════════ */

function openConcept(conceptId) {
  const c = conceptById.get(conceptId);
  if (!c) return;

  const subject = subjectById.get(c.subjectId);
  const chapter = chapterById.get(c.chapterId);
  setSubjectTheme(c.subjectId);

  openSheet(subject.name, () => { setSubjectTheme(view === 'read' ? readSubject : null); refresh(); });
  drawConcept(c, subject, chapter);
}

function drawConcept(c, subject, chapter) {
  const starred = state.starred.includes(c.id);
  const isRead = Boolean(state.read[c.id]);

  const body = el('div', { class: 'concept' },
    el('div', {},
      el('div', { class: 'concept__crumb', text: `第 ${chapter.no} 章・${chapter.title}` }),
      el('h2', { class: 'concept__title', text: c.title })
    ),
    c.tags.length && el('div', { class: 'tagrow' },
      c.tags.map((t) => el('span', { class: `tag ${t === '必考' ? 'tag--must' : ''}`, text: t }))
    ),

    el('div', { class: 'layer layer--brief' },
      el('div', { class: 'layer__head' }, icon('mic'), '面試層',
        el('span', { class: 'badge', text: '30 秒能講出口的版本' })),
      el('div', { class: 'layer__body', html: md(c.brief) })
    ),

    c.advanced && el('details', { class: 'layer layer--adv' },
      el('summary', { class: 'layer__head' }, icon('book'), '進階層',
        el('span', { class: 'badge', text: '銜接研究所課程' }), icon('chev-d')),
      el('div', { class: 'layer__body', html: md(c.advanced) })
    ),

    c.example && el('div', { class: 'callout' },
      el('div', { class: 'callout__t', text: '實務案例' }),
      el('div', { html: md(c.example) })
    ),

    c.terms && c.terms.length && el('div', {},
      sectionTitle('關鍵名詞', `${c.terms.length} 張閃卡`),
      el('div', { class: 'termlist', style: 'margin-top:8px' },
        c.terms.map((t) => el('div', { class: 'termcard' },
          el('div', {},
            el('span', { class: 'termcard__t', text: t.term }),
            t.en && el('span', { class: 'termcard__en', text: t.en })
          ),
          el('div', { class: 'termcard__d', html: md(t.def) }),
          t.tip && el('div', { class: 'termcard__tip', text: `面試講法：${t.tip}` })
        ))
      )
    ),

    c.source && el('div', { class: 'source' }, icon('book'), c.source)
  );

  const foot = el('div', { style: 'display:flex;flex-direction:column;gap:9px' },
    el('div', { class: 'btnrow' },
      btn(starred ? '取消標記' : '標記重點', {
        size: 'sm', icon: 'star',
        onClick: () => {
          const i = state.starred.indexOf(c.id);
          if (i >= 0) state.starred.splice(i, 1); else state.starred.push(c.id);
          save();
          drawConcept(c, subject, chapter);
        }
      }),
      btn(isRead ? '已讀完' : '標記讀完', {
        size: 'sm', icon: 'check', variant: isRead ? 'ghost' : undefined,
        onClick: () => {
          if (state.read[c.id]) {
            delete state.read[c.id];
          } else {
            state.read[c.id] = today();
            bumpDaily('newConcepts');
          }
          save();
          drawConcept(c, subject, chapter);
        }
      })
    ),
    el('div', { class: 'btnrow' },
      (c.terms || []).length ? btn('刷這節閃卡', {
        size: 'sm', variant: 'primary', icon: 'cards',
        onClick: () => {
          closeSheet();
          setTimeout(() => flash.start({ subject: c.subjectId, chapter: c.chapterId, only: 'all' }, ctx(), refresh), 60);
        }
      }) : null,
      (c.mcqs || []).length ? btn('練這節選擇題', {
        size: 'sm', variant: 'primary', icon: 'list',
        onClick: () => {
          closeSheet();
          setTimeout(() => quiz.start({ subject: c.subjectId, chapter: c.chapterId, only: 'all' }, ctx(), refresh), 60);
        }
      }) : null
    )
  );

  // 標題列只放科目名。知識點名稱在內文已經是 h2，重複放在這裡只會在
  // 字級調大時被 ellipsis 截掉，反而看不到完整名字。
  renderSheet({ body, foot, count: '', progress: isRead ? 1 : 0, title: subject.name });
}

/* ═══════════ 練 ═══════════ */

function renderDrill() {
  const host = clear($('#view-drill'));
  const c = ctx();

  const counts = {
    card: flash.countScope(scope, c),
    mcq: quiz.countScope(scope, c),
    essay: essay.countScope(scope, c),
    oral: interview.countScope(scope, c)
  };

  append(host, [
    scopeCard(),
    sectionTitle('練習模式'),
    el('div', { class: 'modegrid' },
      modeCard('cards', '名詞閃卡', '正面名詞、背面定義，四級自評排下次複習', counts.card, 'card',
        () => flash.start(scope, ctx(), refresh)),
      modeCard('list', '選擇題', '立即對答案與詳解，答錯進錯題本', counts.mcq, 'mcq',
        () => quiz.start(scope, ctx(), refresh)),
      modeCard('pencil', '申論自評', '先自己寫，再對照大綱逐點打勾', counts.essay, 'essay',
        () => essay.start(scope, ctx(), refresh)),
      modeCard('mic', '面試模擬', '計時出聲作答，講完看框架', counts.oral, 'oral',
        () => interview.start(scope, ctx(), refresh))
    ),
    dueSummary()
  ]);
}

function scopeCard() {
  const chapters = chaptersOf(scope.subject);

  const subjSel = el('select', {
    onchange: (e) => { scope.subject = e.target.value; scope.chapter = 'all'; renderDrill(); }
  },
    el('option', { value: 'all' }, '全部科目'),
    subjects.map((s) => el('option', { value: s.id, selected: scope.subject === s.id }, s.name))
  );

  const chapSel = el('select', {
    onchange: (e) => { scope.chapter = e.target.value; renderDrill(); }
  },
    el('option', { value: 'all' }, '全部章節'),
    chapters.map((ch) => el('option', { value: ch.id, selected: scope.chapter === ch.id },
      `${subjects.length > 1 && scope.subject === 'all' ? subjectById.get(ch.subjectId).name + '・' : ''}${ch.no}. ${ch.title}`))
  );

  const onlyRow = el('div', { class: 'scope__row' },
    [
      ['all', '全部'],
      ['wrong', `只練錯題（${Object.keys(state.wrong).length}）`],
      ['star', `只練標記（${state.starred.length}）`],
      ['must', '只練必考']
    ].map(([v, label]) => el('button', {
      class: `chip ${scope.only === v ? 'is-on' : ''}`, type: 'button',
      onclick: () => { scope.only = v; renderDrill(); }
    }, label))
  );

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('target'), '練習範圍'),
    el('div', { class: 'scope' },
      el('div', { class: 'scope__row' }, subjSel),
      el('div', { class: 'scope__row' }, chapSel),
      el('div', { class: 'scope__lbl', text: '篩選' }),
      onlyRow
    )
  );
}

function modeCard(iconName, title, desc, n, kind, onClick) {
  const c = ctx();
  const ids = kind === 'card'
    ? itemsInScope(allCards, scope, c).map((x) => x.id)
    : kind === 'mcq' ? itemsInScope(allMcqs, scope, c).map((x) => x.id) : null;

  let badge = `${n} 題`;
  if (ids) {
    const due = countDue(ids);
    const fresh = countNew(ids);
    badge = isSprint() ? `${n} 題・全刷` : `到期 ${due}・新 ${fresh}`;
  }

  return el('button', { class: 'mode', type: 'button', onclick: onClick, disabled: n === 0 },
    el('span', { class: 'mode__ic' }, icon(iconName)),
    el('span', { class: 'mode__t', text: title }),
    el('span', { class: 'mode__d', text: desc }),
    el('span', { class: 'mode__n', text: n === 0 ? '此範圍無題目' : badge })
  );
}

function dueSummary() {
  const snap = snapshot();
  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('clock'), '排程總覽'),
    el('div', { class: 'statgrid' },
      miniStat(snap.cardsDue + snap.mcqsDue, '今天到期'),
      miniStat(snap.cardsNew + snap.mcqsNew, '還沒學過'),
      miniStat(snap.cardsHeld + snap.mcqsHeld, '暫時記住')
    ),
    el('div', { class: 'field__hint', style: 'margin-top:10px' },
      isSprint()
        ? '衝刺期：忽略排程，優先出錯題、標記與必考。'
        : `複習間隔上限 ${Math.min(21, Math.max(1, snap.days ?? 21))} 天，確保每題在目標日前至少再滾一輪。`)
  );
}

function miniStat(n, label) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__n', text: String(n) }),
    el('div', { class: 'stat__l', text: label })
  );
}

/* ═══════════ 我 ═══════════ */

function renderMe() {
  const host = clear($('#view-me'));
  const snap = snapshot();
  const acc = accuracy();

  const stats = el('div', { class: 'statgrid' },
    miniStat(snap.streak, '連續天數'),
    miniStat(`${acc.asked ? Math.round(acc.pct * 100) : 0}%`, '選擇題正確率'),
    miniStat(snap.wrongCount, '錯題本')
  );

  /* 近 7 天 */
  const days = recentDays(7);
  const max = Math.max(1, ...days.map((d) => d.total));
  const bars = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('today'), '近 7 天練習量'),
    el('div', { class: 'bars' },
      days.map((d) => el('div', { class: 'bars__col' },
        el('div', {
          class: `bars__bar ${d.total ? '' : 'is-empty'}`,
          style: `height:${d.total ? Math.max(6, (d.total / max) * 100) : 4}%`,
          title: `${d.label}：${d.total}`
        }),
        el('div', { class: 'bars__lbl', text: d.weekday })
      ))
    )
  );

  /* 各科進度 */
  const bySubject = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, icon('book'), '各科進度'),
    el('div', { style: 'display:flex;flex-direction:column;gap:13px' },
      subjects.map((s) => {
        const total = s.chapters.reduce((n, ch) => n + ch.concepts.length, 0);
        const done = s.chapters.reduce((n, ch) => n + ch.concepts.filter((x) => state.read[x.id]).length, 0);
        const pct = total ? done / total : 0;
        return el('div', { class: 'meter' },
          el('div', { class: 'meter__top' }, s.name, el('b', { text: `${done}/${total}` }),
            el('span', { text: `${Math.round(pct * 100)}%` })),
          el('div', { class: 'progressbar' },
            el('div', { class: 'progressbar__fill', style: `width:${pct * 100}%;background:${s.accent}` }))
        );
      })
    )
  );

  /* 工具列 */
  const tools = el('div', { class: 'card card--pad0' },
    el('div', { class: 'rows' },
      row('bulb', '我的素材庫', `${state.stories.length} 則・面試舉例時從這裡調`,
        () => interview.openStoryManager(refresh)),
      row('star', '各校側重', `${schools.length} 間行銷／企管所的調性，面試前掃一次`,
        () => interview.openSchoolNotes()),
      row('warn', '錯題本', `${snap.wrongCount} 題・連續答對 2 次才移出`,
        () => {
          if (!snap.wrongCount) return toast('錯題本是空的');
          quiz.start({ ...scope, only: 'wrong' }, ctx(), refresh);
        }),
      row('textsize', '字體大小', `目前 ${state.settings.textSize}px・也可按右上角的 Aa`, openTextSize),
      row('gear', '設定', `目標日 ${formatDay(state.settings.targetDate)}`, openSettings)
    )
  );

  /* 資料 */
  const data = el('div', { class: 'card card--pad0' },
    el('div', { class: 'rows' },
      row('down', '匯出備份', 'JSON 檔，換裝置或重灌前先存一份', doExport),
      row('up', '匯入備份', '會整包置換目前的進度', doImport),
      row('trash', '清除所有進度', '教材不會動，只清掉你的紀錄', doReset, true)
    )
  );

  append(host, [
    stats, bars, bySubject,
    sectionTitle('工具'), tools,
    sectionTitle('資料'), data,
    el('div', { class: 'field__hint', style: 'text-align:center;padding:8px 0 4px' },
      `教材共 ${allConcepts.length} 個知識點・${allCards.length} 張卡・${allMcqs.length} 題選擇・${allEssays.length} 題申論・${allOrals.length} 題口試`)
  ]);
}

function row(iconName, title, sub, onClick, danger) {
  return el('button', { class: `row ${danger ? 'row--danger' : ''}`, type: 'button', onclick: onClick },
    icon(iconName),
    el('span', { class: 'row__main' },
      el('span', { class: 'row__t', text: title }),
      el('span', { class: 'row__s', text: sub })
    ),
    icon('chev-r')
  );
}

/* ═══════════ 字級 ═══════════ */

function applyTextSize() {
  document.documentElement.style.fontSize = `${state.settings.textSize}px`;
}

/**
 * 字級調整。刻意做成「按下去立刻生效並存檔」而非填完表單再按確定——
 * 使用者是把電腦推遠了才在調，需要當場看到夠不夠大，中間隔一個確認鍵
 * 會逼他來回試好幾次。
 */
function openTextSize() {
  const body = el('div', { style: 'display:flex;flex-direction:column;gap:14px' });

  const draw = () => {
    clear(body);
    const cur = state.settings.textSize;
    body.append(
      el('div', { class: 'field__hint' },
        '整個 App 的字都會跟著變，包含教材內文與題目。按下去馬上生效，覺得不夠大就再按下一格。'),

      el('div', { class: 'fsrow' },
        TEXT_SIZES.map(({ value, label }) => el('button', {
          class: `fsbtn ${cur === value ? 'is-on' : ''}`, type: 'button',
          style: `--sample:${Math.round(value * 1.15)}px`,
          onclick: () => {
            state.settings.textSize = value;
            applyTextSize();
            flush();
            draw();
            refresh();
          }
        },
          el('span', { class: 'fsbtn__a', text: 'A' }),
          el('span', { class: 'fsbtn__l', text: label })
        ))
      ),

      el('div', { class: 'fspreview' },
        el('div', { class: 'fspreview__t', text: '預覽（實際教材長這樣）' }),
        el('div', { class: 'fspreview__body', html: md(
          '**定位**是在顧客心中的位置，不是在產品上做的事。Ries & Trout 的原句是：定位不是你對產品做什麼，而是你對潛在顧客的心智做什麼。') })
      ),

      el('div', { class: 'field__hint', text: `目前：${cur}px` })
    );
  };

  draw();
  openModal('字體大小', body);
}

/* ═══════════ 設定 ═══════════ */

function openSettings() {
  const s = state.settings;
  const draft = { ...s };

  const numField = (label, key, hint, min, max) => el('div', { class: 'field' },
    el('div', { class: 'field__lbl', text: label }),
    hint && el('div', { class: 'field__hint', text: hint }),
    el('input', {
      type: 'number', min, max, value: draft[key],
      oninput: (e) => { draft[key] = e.target.value; }
    })
  );

  const body = el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
    el('div', { class: 'field' },
      el('div', { class: 'field__lbl', text: '推甄面試目標日' }),
      el('div', { class: 'field__hint', text: '簡章公布後回來改一個數字就好，每日進度會自己重算。' }),
      el('input', { type: 'date', value: draft.targetDate, oninput: (e) => { draft.targetDate = e.target.value; } })
    ),
    numField('衝刺期天數', 'sprintDays', '考前幾天開始忽略排程全刷', 0, 90),
    numField('每天新項目的基準量', 'dailyNewTarget', '這是基準不是上限——進度落後時系統會自動要求更多', 1, 60),
    numField('每輪閃卡張數', 'cardPerSession', null, 5, 80),
    numField('每輪選擇題數', 'mcqPerSession', null, 5, 60),
    numField('口試作答秒數', 'oralSeconds', null, 20, 300),
    el('div', { class: 'btnrow' },
      btn('取消', { onClick: closeModal }),
      btn('儲存', { variant: 'primary', onClick: () => {
        Object.assign(state.settings, {
          targetDate: draft.targetDate || s.targetDate,
          sprintDays: clampNum(draft.sprintDays, 0, 90, s.sprintDays),
          dailyNewTarget: clampNum(draft.dailyNewTarget, 1, 60, s.dailyNewTarget),
          cardPerSession: clampNum(draft.cardPerSession, 5, 80, s.cardPerSession),
          mcqPerSession: clampNum(draft.mcqPerSession, 5, 60, s.mcqPerSession),
          oralSeconds: clampNum(draft.oralSeconds, 20, 300, s.oralSeconds)
        });
        flush();
        closeModal();
        toast('已儲存');
        refresh();
      } })
    )
  );

  openModal('設定', body);
}

function clampNum(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/* ═══════════ 匯出／匯入／清除 ═══════════ */

function doExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `推甄戰備室-備份-${today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已匯出');
}

function doImport() {
  const input = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importJSON(String(reader.result));
      toast(res.msg);
      if (res.ok) { openChapters.clear(); refresh(); }
    };
    reader.onerror = () => toast('讀不到這個檔案');
    reader.readAsText(file);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

function doReset() {
  if (!window.confirm('確定要清除所有練習進度嗎？\n\n閃卡排程、錯題本、標記、素材庫都會消失，教材本身不受影響。\n這個動作沒辦法復原——建議先匯出備份。')) return;
  resetAll();
  openChapters.clear();
  toast('已清除');
  refresh();
}

/* ═══════════ 接線 ═══════════ */

$('#tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) go(tab.dataset.go);
});

$('#countdown-chip').addEventListener('click', openSettings);
$('#textsize-btn').addEventListener('click', openTextSize);
$('#sheet-close').addEventListener('click', closeSheet);
$('#modal-close').addEventListener('click', closeModal);

$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (isModalOpen()) closeModal();
  else if (isSheetOpen()) closeSheet();
});

// 跨午夜：回到前景時若日期已變，重新計算倒數與到期量
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (today() !== lastDay) { lastDay = today(); refresh(); }
});

/* ═══════════ 啟動 ═══════════ */

// index.html 的同步腳本已先套過一次（避免閃爍），這裡再套一次是為了讓
// sanitize 夾過範圍後的值成為最終依據——例如 localStorage 被手改成 99px。
applyTextSize();
go('today');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 離線功能失敗不影響核心使用 */ });
  });
}
