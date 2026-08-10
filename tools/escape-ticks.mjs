/* escape.mjs — 把章節片段裡「行內公式的反引號」escape 成 \`
 *
 * 內容欄位（brief/advanced/example/sample）本身是樣板字串，公式的反引號若不 escape
 * 會直接把字串截斷造成語法錯誤。手寫時很容易漏，這支腳本統一處理。
 *
 * 判斷規則（順序重要）：
 *   1. 已經是 \` 的 → 不動
 *   2. 前面是「欄位名: 」→ 樣板字串開頭，不動
 *   3. 後面接 , 或 ; 或「換行＋}」或「換行＋]」→ 樣板字串結尾，不動
 *      （sample 常是物件最後一個屬性，收尾反引號後面沒有逗號，只有換行加大括號）
 *   4. 其餘一律 escape
 *
 * 用法：node escape.mjs <片段檔>       正常 escape
 *       node escape.mjs <片段檔> --fix  只修復被誤 escape 的收尾反引號
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const fixOnly = process.argv[3] === '--fix';
let s = readFileSync(file, 'utf8');

if (fixOnly) {
  const n = (s.match(/\\`(\r?\n\s*[}\]])/g) || []).length;
  s = s.replace(/\\`(\r?\n\s*[}\]])/g, '`$1');
  writeFileSync(file, s, 'utf8');
  console.log(`還原 ${n} 個被誤 escape 的收尾反引號`);
} else {
  let n = 0;
  const out = s.replace(/`/g, (m, off) => {
    if (s[off - 1] === '\\') return m;
    if (/[a-z]+:\s$/.test(s.slice(Math.max(0, off - 12), off))) return m;
    if (/^[,;]/.test(s.slice(off + 1, off + 2))) return m;
    if (/^\r?\n\s*[}\]]/.test(s.slice(off + 1, off + 20))) return m;
    n++;
    return '\\`';
  });
  writeFileSync(file, out, 'utf8');
  console.log(`escape ${n} 個行內公式反引號`);
}
