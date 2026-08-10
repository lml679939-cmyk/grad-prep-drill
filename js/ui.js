/* ui.js — DOM 工具、輕量 Markdown、Sheet／Modal／Toast
 *
 * 教材內文用一套刻意做小的 Markdown：只支援 **粗體**、清單、段落、表格、
 * 以及 [[知識點 id]] 跨章連結。不用完整 Markdown 函式庫是因為那會變成一個
 * 外部依賴，而教材裡用得到的語法就這幾種。渲染前一律先跳脫 HTML，
 * 內容檔即使打錯也不會弄壞版面。
 */

import { conceptById } from './content.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ─────────── 建構 ─────────── */

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  append(n, kids);
  return n;
}

export function append(parent, kids) {
  for (const kid of kids.flat(4)) {
    if (kid == null || kid === false || kid === '') continue;
    parent.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return parent;
}

export function icon(name, cls = 'ic') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

/* ─────────── 輕量 Markdown ─────────── */

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* [[mgt-08-02]] → 可點擊的知識點標題。
   教材裡大量使用跨章連結（申論拉分最有效的手法），但一開始只訂了寫法沒做渲染，
   使用者看到的是原文 [[mgt-08-02]]。跟表格那次是同一類錯誤：語法先訂、渲染沒跟上。
   找不到對應知識點時保留原文，這樣內容打錯 id 會在畫面上直接看得出來。 */
function xref(id) {
  const c = conceptById.get(id);
  return c ? `<button type="button" class="xref" data-xref="${id}">${esc(c.title)}</button>` : `[[${id}]]`;
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([a-z]+-\d+-\d+)\]\]/g, (m, id) => xref(id));
}

/* 表格辨識：標題列 → 分隔列 → 內容列。
   分隔列只允許 | : - 空白，且必須含有 -，才不會把普通內容誤判成表格。 */
const isRow = (s) => /^\|.*\|$/.test(s);
const isSep = (s) => /^\|[\s:|-]+\|$/.test(s) && s.includes('-');
const cellsOf = (s) => s.slice(1, -1).split('|').map((c) => c.trim());

/**
 * 支援：**粗體**、`- ` 項目清單、`1. ` 編號清單、空行分段、Markdown 表格。
 *
 * 表格是後來補的：教材裡有大量「A 與 B 的比較」（行銷 1.0–5.0、PLC 各期策略、
 * 推廣五工具、Aaker vs Keller），這類內容拆成清單會失去對照的結構。
 * 表格外面一定要包 .tablewrap（可橫向捲動），否則窄螢幕會把整頁撐寬。
 */
export function md(src) {
  const lines = String(src ?? '').split('\n');
  let html = '';
  let list = null;
  const flush = () => { if (list) { html += `</${list}>`; list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flush(); continue; }

    // 表格：目前這行是列，且下一行是分隔列
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1].trim())) {
      flush();
      const head = cellsOf(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && isRow(lines[j].trim())) {
        rows.push(cellsOf(lines[j].trim()));
        j++;
      }
      html += '<div class="tablewrap"><table>'
        + '<thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead>'
        + (rows.length
          ? '<tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>'
          : '')
        + '</table></div>';
      i = j - 1;
      continue;
    }

    const ul = /^[-•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.、)]\s+(.*)$/.exec(line);

    if (ul) {
      if (list !== 'ul') { flush(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(ul[1])}</li>`;
    } else if (ol) {
      if (list !== 'ol') { flush(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(ol[1])}</li>`;
    } else {
      flush();
      html += `<p>${inline(line)}</p>`;
    }
  }
  flush();
  return html;
}

/** 回傳一個已填好 Markdown 的元素 */
export function mdEl(tag, cls, src) {
  return el(tag, { class: cls, html: md(src) });
}

/* ─────────── 主題色 ─────────── */

export function setSubjectTheme(subjectId) {
  if (subjectId && subjectId !== 'all') document.body.dataset.subject = subjectId;
  else delete document.body.dataset.subject;
}

/* ─────────── Toast ─────────── */

let toastTimer = null;

export function toast(msg, ms = 1900) {
  const n = $('#toast');
  n.textContent = msg;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, ms);
}

/* ─────────── Modal ─────────── */

const modal = {
  root: null,
  onClose: null
};

export function openModal(title, body, onClose) {
  modal.root ||= $('#modal');
  modal.onClose = onClose || null;
  $('#modal-title').textContent = title;
  const host = clear($('#modal-body'));
  append(host, [body]);
  modal.root.hidden = false;
  modal.root.scrollTop = 0;
}

export function closeModal() {
  modal.root ||= $('#modal');
  if (modal.root.hidden) return;
  modal.root.hidden = true;
  clear($('#modal-body'));
  const cb = modal.onClose;
  modal.onClose = null;
  if (cb) cb();
}

export function isModalOpen() {
  return !($('#modal').hidden);
}

/* ─────────── Sheet（全螢幕作答層） ─────────── */

const sheet = { onClose: null, open: false };

export function openSheet(title, onClose) {
  sheet.onClose = onClose || null;
  sheet.open = true;
  $('#sheet-title').textContent = title;
  $('#sheet-count').textContent = '';
  $('#sheet-progress').style.width = '0%';
  clear($('#sheet-body'));
  clear($('#sheet-foot'));
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}

/** 更新作答層內容。body / foot 傳 null 表示不動 */
export function renderSheet({ body, foot, count, progress, title }) {
  if (title != null) $('#sheet-title').textContent = title;
  if (count != null) $('#sheet-count').textContent = count;
  if (progress != null) $('#sheet-progress').style.width = `${Math.round(progress * 100)}%`;
  if (body !== undefined) { const h = clear($('#sheet-body')); append(h, [body]); h.scrollTop = 0; }
  if (foot !== undefined) { const h = clear($('#sheet-foot')); append(h, [foot]); }
}

export function closeSheet() {
  if (!sheet.open) return;
  sheet.open = false;
  $('#sheet').hidden = true;
  clear($('#sheet-body'));
  clear($('#sheet-foot'));
  document.body.style.overflow = '';
  const cb = sheet.onClose;
  sheet.onClose = null;
  if (cb) cb();
}

export function isSheetOpen() {
  return sheet.open;
}

/* ─────────── 常用片段 ─────────── */

export function empty(iconName, title, desc, action) {
  return el('div', { class: 'empty' },
    icon(iconName),
    el('div', { class: 'empty__t', text: title }),
    desc && el('div', { class: 'empty__d', text: desc }),
    action
  );
}

export function btn(label, opts = {}) {
  const cls = ['btn', opts.variant && `btn--${opts.variant}`, opts.size && `btn--${opts.size}`,
    opts.block && 'btn--block'].filter(Boolean).join(' ');
  return el('button', { class: cls, type: 'button', onclick: opts.onClick },
    opts.icon && icon(opts.icon), label);
}

export function sectionTitle(text, rest) {
  return el('div', { class: 'sec-title' }, text, rest && el('span', { class: 'sec-title__rest' }, rest));
}

export function confirmDanger(msg) {
  return window.confirm(msg);
}
