/* append-concept.mjs — 把一個知識點物件附加到既有章節 concepts 陣列的「尾端」
 *
 * ★ 必須是尾端。練習項目的 id 由「知識點 id + 陣列位置」推導，
 *   插在中間會讓使用者已累積的 SRS 進度整批錯位對到別題。
 *
 * 用法：node append-concept.mjs <目標檔> <片段檔> <章節const名稱>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [target, fragment, chapter] = process.argv.slice(2);
const src = readFileSync(target, 'utf8');
const frag = readFileSync(fragment, 'utf8').trim().replace(/,$/, '');

const start = src.indexOf(`const ${chapter} = {`);
if (start < 0) throw new Error(`找不到 ${chapter}`);

// 章節結尾：往後找第一個「換行＋空白＋]」再接「換行 };」
const rest = src.slice(start);
const m = /\n\s*\]\n\};/.exec(rest);
if (!m) throw new Error(`找不到 ${chapter} 的 concepts 陣列結尾`);

const at = start + m.index;
const out = src.slice(0, at) + `,\n\n${frag}\n` + src.slice(at);
writeFileSync(target, out, 'utf8');
console.log(`已附加知識點到 ${chapter} 的尾端`);
