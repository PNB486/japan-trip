// 일본 여행 플래너 — 단독 HTML 빌드
//
// japan-trip-design/일본 여행 플래너.dc.html 은 Design Composer 런타임
// (support.js + _ds/<theme>/{styles.css,_ds_bundle.js}) 위에서만 동작한다.
// 이 스크립트는 그 세 파일을 HTML 안으로 인라인해서, 어디서 열어도 뜨는
// 단일 파일 japan-trip-planner.html 을 만든다.
//
// 실행:  node build-planner.mjs
//
// 플래너를 고친 뒤에는 .dc.html 만 수정하고 이 스크립트를 다시 돌린다.
// 산출물을 직접 손대면 다음 빌드에서 덮어써진다.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, 'japan-trip-design');
const SRC = join(SRC_DIR, '일본 여행 플래너.dc.html');
// --hosted : GitHub Pages 용. 영상을 base64 로 박지 않고 japan-trip-design/assets/ 를 URL 로 참조해
//            첫 로딩이 가볍다(단일 파일 1.4MB + 영상은 스트리밍). 산출물은 index.html.
const HOSTED = process.argv.includes('--hosted');
const OUT = join(ROOT, HOSTED ? 'index.html' : 'japan-trip-planner.html');
const TITLE = '일본 여행 플래너 · 2026';

const read = (p) => readFile(p, 'utf8');

// 인라인할 텍스트에 </script> 가 들어 있으면 스크립트 블록이 조기 종료된다.
const safeForScript = (js, label) => {
  if (/<\/script/i.test(js)) {
    throw new Error(`${label} 안에 </script> 가 있어 인라인할 수 없음 — 이스케이프 처리 필요`);
  }
  return js;
};

// 원본에 정확히 한 번만 나타나야 하는 패턴을 치환한다.
// 0회면 DC가 구조를 바꾼 것이고, 2회 이상이면 엉뚱한 곳을 건드릴 수 있으므로 둘 다 중단.
const replaceOnce = (html, pattern, replacement, label) => {
  const hits = html.match(pattern);
  if (!hits) throw new Error(`${label} 를 찾지 못함 — .dc.html 구조가 바뀐 듯`);
  if (hits.length > 1) throw new Error(`${label} 가 ${hits.length}번 나타남 — 예상은 1번`);
  return html.replace(pattern, () => replacement);
};

let html = await read(SRC);

// ── 1. 테마 스타일시트 (_ds/<theme>/styles.css)
const cssRef = html.match(/<link rel="stylesheet" href="(_ds\/[^"]+\.css)">/);
if (!cssRef) throw new Error('_ds 스타일시트 link 를 찾지 못함');
const css = await read(resolve(SRC_DIR, cssRef[1]));
html = replaceOnce(html, cssRef[0], `<style>\n${css}\n</style>`, '_ds styles.css link');

// ── 2. 디자인 시스템 번들 (_ds/<theme>/_ds_bundle.js)
const dsRef = html.match(/<script src="(_ds\/[^"]+\.js)"><\/script>/);
if (!dsRef) throw new Error('_ds 번들 script 를 찾지 못함');
const dsJs = await read(resolve(SRC_DIR, dsRef[1]));
html = replaceOnce(html, dsRef[0], `<script>\n${safeForScript(dsJs, '_ds_bundle.js')}\n</script>`, '_ds 번들 script');

// ── 3. React UMD + DC 런타임 (support.js)
//
// support.js 는 window.React / window.ReactDOM 이 없으면 unpkg 에서 받아온다.
// 그래서 vendor 사본을 support.js 보다 먼저 인라인해두면 CDN 호출 자체가 사라진다.
// vendor 파일이 진짜인지는 support.js 가 들고 있는 SRI 해시로 대조한다 —
// 둘이 어긋나면 파일이 바뀐 것이므로 빌드를 멈춘다.
const support = await read(join(SRC_DIR, 'support.js'));

const sri = (buf) => 'sha384-' + createHash('sha384').update(buf).digest('base64');

const vendorReact = async (file, sriVarName) => {
  const path = join(SRC_DIR, 'vendor', file);
  const js = await read(path);
  const expected = support.match(new RegExp(`${sriVarName} = "([^"]+)"`))?.[1];
  if (!expected) throw new Error(`support.js 에서 ${sriVarName} 를 찾지 못함`);
  const actual = sri(Buffer.from(js, 'utf8'));
  if (actual !== expected) {
    throw new Error(`vendor/${file} 해시 불일치\n  support.js: ${expected}\n  실제 파일:  ${actual}`);
  }
  return safeForScript(js, file);
};

const reactJs = await vendorReact('react.production.min.js', 'REACT_SRI');
const reactDomJs = await vendorReact('react-dom.production.min.js', 'REACT_DOM_SRI');

// ── Leaflet (라이브 다크 타일용)
//
// 타일은 실행 시 Esri(다크 그레이)에서 받아오지만, 라이브러리 자체는 인라인해 둔다.
// 해시는 Leaflet 1.9.4 가 공식 배포하는 SRI 값으로 고정 — 파일이 바뀌면 빌드를 멈춘다.
const LEAFLET_SRI = {
  'leaflet.css': 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
  'leaflet.js':  'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};
const vendorPinned = async (file) => {
  const buf = await readFile(join(SRC_DIR, 'vendor', file));
  const actual = 'sha256-' + createHash('sha256').update(buf).digest('base64');
  if (actual !== LEAFLET_SRI[file]) {
    throw new Error(`vendor/${file} 해시 불일치\n  기대: ${LEAFLET_SRI[file]}\n  실제: ${actual}`);
  }
  return safeForScript(buf.toString('utf8'), file);
};
const leafletCss = await vendorPinned('leaflet.css');
const leafletJs = await vendorPinned('leaflet.js');

// ── 도시 지도 이미지 (maps/*.webp)
//
// 템플릿은 산출물에 두 번 들어간다(<x-dc> 원본 + 아래 주입 스크립트). 이미지를 템플릿 안에
// 두면 그대로 두 배가 되므로, 전역 window.__CITY_MAPS 로 한 번만 심는다.
// 컴포넌트는 이 전역이 없으면 벡터 지형(terrain)으로 물러난다 — DC 편집기에서도 깨지지 않게.
const MAP_FILES = { '나고야':'nagoya.webp', '교토':'kyoto.webp', '오사카':'osaka.webp', '후쿠오카':'fukuoka.webp' };
const cityMaps = {};
let mapBytes = 0;
for (const [city, file] of Object.entries(MAP_FILES)) {
  const buf = await readFile(join(SRC_DIR, 'maps', file));
  mapBytes += buf.length;
  cityMaps[city] = 'data:image/webp;base64,' + buf.toString('base64');
}
const mapsScript = 'window.__CITY_MAPS=' + JSON.stringify(cityMaps) + ';';

// ── 히어로 영상·포스터 (assets/hero.mp4, hero-poster.jpg) — 메인 페이지. 지도와 같은 이유로 전역에 한 번만.
const heroBuf = await readFile(join(SRC_DIR, 'assets', 'hero.mp4'));
const posterBuf = await readFile(join(SRC_DIR, 'assets', 'hero-poster.jpg'));
const heroScript = 'window.__HERO=' + JSON.stringify(HOSTED
  ? { video: 'japan-trip-design/assets/hero.mp4', poster: 'japan-trip-design/assets/hero-poster.jpg' }
  : { video: 'data:video/mp4;base64,' + heroBuf.toString('base64'), poster: 'data:image/jpeg;base64,' + posterBuf.toString('base64') }
) + ';';

// ── 환율 스냅샷 — 빌드 시점의 ECB 참조환율(frankfurter.dev) 36일치. 오프라인·file:// 에서 보여줄 마지막 값.
// 실패해도 빌드는 계속한다(컴포넌트가 온라인에서 직접 받아옴).
let fxScript = '';
try {
  const from = new Date(Date.now() - 36 * 86400000).toISOString().slice(0, 10);
  const r = await fetch('https://api.frankfurter.dev/v1/' + from + '..?base=JPY&symbols=KRW,USD');
  const j = await r.json();
  const hist = Object.keys(j.rates).sort().map((d) => [d, j.rates[d].KRW]).filter((h) => h[1] > 0);
  const lastD = hist[hist.length - 1][0];
  fxScript = 'window.__FX_SNAPSHOT=' + JSON.stringify({ date: lastD, usd: j.rates[lastD].USD || null, hist }) + ';';
  console.log(`  환율 스냅샷: ${hist.length}영업일 · ${lastD} 100엔 = ${(hist[hist.length - 1][1] * 100).toFixed(1)}원`);
} catch (e) {
  console.warn('  환율 스냅샷 실패 — 온라인에서만 표시됨: ' + e.message);
}

// DC 런타임이 템플릿을 얻는 경로는 두 가지이고, 단독 파일에서는 둘 다 문제가 있다.
//
//  1) parseDcDocument(document) — <x-dc> 의 innerHTML 을 읽는다. 그런데 브라우저는 <table>
//     안의 <sc-for> 같은 미지 태그를 테이블 밖으로 밀어낸다(foster parenting). 그래서 이
//     경로로 얻은 템플릿은 표의 tbody 가 비어 버린다 — 주차 날씨표·도시 비교표가 헤더만
//     남고 사라지는 증상이 이것이다.
//  2) boot() 의 fetch(location.href) 재파싱 — 원문 텍스트를 parseDcText 로 다시 자르므로
//     encodeCase 가 <tbody> 를 <sc-raw-tbody> 로 바꿔 주고 표가 정상 렌더된다. 하지만
//     file:// 에서는 fetch 가 막혀 아예 실행되지 않는다. 게다가 support.js 를 인라인하면
//     parseDcText 가 쓰는 구분자("<x-dc", "</x-dc>")가 support.js 소스 안에도 존재하게 되어,
//     잘라낸 템플릿에 support.js 조각이 섞여 들어간다.
//
// 그래서 fetch 경로를 아예 막고(=__resources 선언), 빌드 시점에 잘라 둔 정확한 템플릿 원문을
// 부팅 후 런타임에 직접 넣어 준다. 네트워크에 의존하지 않으므로 오프라인에서도 동일하게 뜬다.
const bootGuard = 'window.__resources = window.__resources || {};';

html = replaceOnce(
  html,
  /<script src="\.\/support\.js"><\/script>/g,
  `<script>${bootGuard}</script>\n<script>${mapsScript}${heroScript}${fxScript}</script>\n<style>\n${leafletCss}\n</style>\n<script>\n${leafletJs}\n</script>\n<script>\n${reactJs}\n</script>\n<script>\n${reactDomJs}\n</script>\n<script>\n${safeForScript(support, 'support.js')}\n</script>`,
  'support.js script',
);

// ── 4. 제목 (원본 .dc.html 에는 <title> 이 없다)
html = replaceOnce(html, /<meta charset="utf-8">/, `<meta charset="utf-8">\n<title>${TITLE}</title>`, '<meta charset>');

// ── 5. 템플릿 원문 주입
//
// 경계는 원본 .dc.html 에서 잡는다. 인라인된 support.js 소스에도 같은 문자열이 들어 있으므로
// 산출물에서 다시 찾으면 엉뚱한 곳을 자르게 된다.
const srcHtml = await read(SRC);
const openTag = /<x-dc(?:\s[^>]*)?>/.exec(srcHtml);
const closeAt = srcHtml.lastIndexOf('</x-dc>');
if (!openTag || closeAt === -1 || closeAt < openTag.index) {
  throw new Error('원본에서 <x-dc> 블록을 찾지 못함');
}
let template = srcHtml.slice(openTag.index + openTag[0].length, closeAt);
if (!/<sc-for/.test(template)) throw new Error('잘라낸 템플릿에 <sc-for> 가 없음 — 경계가 틀림');

// 템플릿 안의 <helmet> 도 _ds 파일을 참조한다. 런타임이 이걸 그대로 head 에 붙이므로
// 여기서도 인라인해 두지 않으면 오프라인에서 테마 CSS 가 깨진다.
template = replaceOnce(template, cssRef[0], `<style>\n${css}\n</style>`, '템플릿의 _ds styles.css link');
template = replaceOnce(template, dsRef[0], `<script>\n${dsJs}\n</script>`, '템플릿의 _ds 번들 script');

// JS 문자열 안의 "</script" 는 스크립트 블록을 조기 종료시킨다. "<\/script" 로 쓰면
// 값은 그대로면서 파서만 피해 간다.
const templateLiteral = JSON.stringify(template).replace(/<\/script/gi, '<\\/script');

const injector = `
(function(){
  var TPL = ${templateLiteral};
  var tries = 0;
  (function apply(){
    if (++tries > 600) { console.error('[planner] dc-runtime 부팅을 기다리다 시간 초과'); return; }
    var name = window.__dcRootName && window.__dcRootName();
    var entry = name && window.__dcRegistry && window.__dcRegistry[name];
    // entry.html 이 채워졌다 = boot() 이 끝났다. 그 다음에 원문 템플릿으로 덮어쓴다.
    if (!entry || !entry.html || !window.__dcUpdate) return void requestAnimationFrame(apply);
    if (entry.html !== TPL) window.__dcUpdate(name, 'html', TPL, false);
  })();
})();`;
if (/<\/script/i.test(injector)) throw new Error('주입 스크립트에 이스케이프되지 않은 </script> 가 남음');

html = replaceOnce(html, /<\/body>/i, `<script>${injector}</script>\n</body>`, '</body>');

// 회귀 방지 — 가드가 support.js 보다 먼저 와야 하고, 주입 스크립트는 그 뒤에 있어야 한다.
const guardAt = html.indexOf(bootGuard);
const supportAt = html.indexOf('function parseDcText');
const injectAt = html.indexOf('[planner] dc-runtime');
if (guardAt === -1 || supportAt === -1 || injectAt === -1 || !(guardAt < supportAt && supportAt < injectAt)) {
  throw new Error('스크립트 순서가 어긋남 (가드 → support.js → 템플릿 주입)');
}

await writeFile(OUT, html, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
const B = (s) => kb(Buffer.byteLength(s));
console.log(`빌드 완료: ${OUT}`);
console.log(`  React ${B(reactJs + reactDomJs)} + 런타임 ${B(support)} + CSS ${B(css)} + 지도 ${kb(mapBytes)} + 템플릿 → ${B(html)}`);
console.log('  외부 요청: 지도 타일(Esri) + 구글 폰트 — 둘 다 없으면 구워 둔 고정 지도·대체 폰트로 동작');
