/* splice.mjs — 把章節片段插進 content/<科目>.js
 * 用法：node splice.mjs <目標檔> <片段檔> <章節const名稱...>
 * 片段插在 /* ═══ *\/ 分隔線之前，並把 const 名稱加進 export default 的 chapters 陣列（排序）。
 * 可一次傳多個名稱，片段檔內含多個章節時使用。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [target, fragment, ...names] = process.argv.slice(2);
let src = readFileSync(target, 'utf8');
const frag = readFileSync(fragment, 'utf8').trim();

const DIV = /\/\* ═+ \*\//;
if (!DIV.test(src)) throw new Error('找不到分隔線');
for (const n of names) {
  if (new RegExp(`^const ${n} = `, 'm').test(src)) throw new Error(`${n} 已存在`);
}

src = src.replace(DIV, (m) => `${frag}\n\n${m}`);

const arrRe = /chapters:\s*\[([^\]]*)\]/;
const m = arrRe.exec(src);
if (!m) throw new Error('找不到 chapters 陣列');
const all = [...new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean).concat(names))].sort();
src = src.replace(arrRe, `chapters: [${all.join(', ')}]`);

writeFileSync(target, src, 'utf8');
console.log(`已插入 ${names.join('、')}，chapters = [${all.join(', ')}]`);
