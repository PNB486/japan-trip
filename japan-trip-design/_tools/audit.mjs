// 플래너 .dc.html 정적 점검 — 템플릿 키 ↔ renderVals 반환 키 대조, 미사용 메서드 탐지
import { readFile } from 'node:fs/promises';

const P = 'C:/Users/Soul/Desktop/AI/Claude/japan-trip/japan-trip-design/일본 여행 플래너.dc.html';
const s = await readFile(P, 'utf8');
const tplEnd = s.lastIndexOf('</x-dc>');
const tpl = s.slice(s.indexOf('<x-dc'), tplEnd);
const js = s.slice(tplEnd);

// 템플릿이 참조하는 최상위 키 (sc-for 반복변수는 제외)
const loopVars = new Set([...tpl.matchAll(/as="([\w]+)"/g)].map((m) => m[1]));
const used = new Set();
for (const m of tpl.matchAll(/\{\{\s*([A-Za-z_][\w]*)/g)) {
  const k = m[1];
  if (!loopVars.has(k) && k !== 'true' && k !== 'false') used.add(k);
}

// renderVals 의 최종 return 블록만 떼어낸다
const rvStart = js.indexOf('renderVals()');
const retAt = js.indexOf('\n    return {', rvStart);
const open = js.indexOf('{', retAt);
let depth = 0;
let end = open;
for (let i = open; i < js.length; i++) {
  const c = js[i];
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
const body = js.slice(open + 1, end);

// 깊이 0(=객체 최상위)에서 구분자 앞에 붙은 식별자만 키로 인정.
// 문자열·주석 내부는 건너뛴다.
const ret = new Set();
depth = 0;
let inStr = null;
let inLine = false;
let buf = '';
for (let i = 0; i < body.length; i++) {
  const c = body[i];
  const n = body[i + 1];
  if (inLine) { if (c === '\n') inLine = false; continue; }
  if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
  if (c === '/' && n === '/') { inLine = true; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{' || c === '(' || c === '[') { depth++; buf = ''; continue; }
  if (c === '}' || c === ')' || c === ']') { depth--; buf = ''; continue; }
  if (depth !== 0) continue;
  if (/[A-Za-z_0-9$]/.test(c)) { buf += c; continue; }
  if (c === ':' || c === ',') { if (buf) ret.add(buf); buf = ''; continue; }
  if (!/\s/.test(c)) buf = '';
}
if (buf) ret.add(buf);

const unusedRet = [...ret].filter((k) => !used.has(k)).sort();
const missing = [...used].filter((k) => !ret.has(k)).sort();

console.log(`템플릿 참조 ${used.size}개 · 반환 ${ret.size}개`);
console.log('\n[반환하지만 템플릿이 안 쓰는 키]');
console.log('  ' + (unusedRet.length ? unusedRet.join(', ') : '없음'));
console.log('\n[템플릿이 쓰는데 반환에 없는 키]');
console.log('  ' + (missing.length ? missing.join(', ') : '없음'));

const methods = [...js.matchAll(/^  ([a-zA-Z_][\w]*)\(\)\s*\{/gm)].map((m) => m[1]);
console.log('\n[메서드] ' + methods.join(', '));
for (const m of methods) {
  if (m === 'renderVals') continue;
  const re = new RegExp('this\\.' + m + '\\(', 'g');
  if (!(js.match(re) || []).length) console.log('  호출 없음 → ' + m);
}
