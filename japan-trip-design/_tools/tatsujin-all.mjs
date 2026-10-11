// 달인 가이드(625곳) 중 플래너 4개 도시분 416곳을 전부 뽑아 플래너 spot 형식으로 변환.
// 형식: [분류, 이름, 설명, 정보, 대략 위치, 지도쿼리, 장르]  ← 7번째가 장르(하위 필터용)
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile('C:/Users/Soul/Desktop/AI/Claude/japan-food-guide/suntory-tatsujin-guide.html', 'utf8');
const a = src.indexOf('const DATA = [');
const b = src.indexOf('];', a);
const ctx = {};
vm.createContext(ctx);
const DATA = vm.runInContext(src.slice(a, b + 2) + '; DATA', ctx);

const CITIES = ['나고야', '교토', '오사카', '후쿠오카'];
const score = (d) => parseFloat(d.tabelog) || 0;
const station = (t) => (t && t.match(/([^\s／()（）「」・]+駅)/) || [])[1] || '';

// 장르를 몇 개로 묶는다. 가이드의 bucket 값이 예전 표기와 섞여 있어 정규화한다.
const GENRE = {
  '스시·해산물': '스시·해산물', '고기구이': '고기·구이', '고기': '고기·구이',
  '면류': '면류', '튀김류': '튀김', '나베·전골': '나베·전골',
  '향토·정식': '향토·정식', '이자카야·바': '이자카야·바',
  '경양식·기타': '양식·기타', '기타': '양식·기타', '피자': '양식·기타',
};

const out = {};
let dropped = 0;
for (const city of CITIES) {
  const rows = DATA.filter((d) => d.city === city)
    // 인증점을 앞에, 그 다음 평점순 — 목록 위쪽이 자연스럽게 좋은 집이 되도록
    .sort((x, y) => {
      const cx = x.tier && x.tier !== '없음' ? 1 : 0;
      const cy = y.tier && y.tier !== '없음' ? 1 : 0;
      return cy - cx || score(y) - score(x) || (y.saves || 0) - (x.saves || 0);
    });

  out[city] = rows.map((d) => {
    const menu = d.menu && d.menu[0] ? d.menu[0][1] : '';
    const g = (d.genre || '').replace(/\(食べログ百名店\d*\)/, '(백명점)');
    const tier = /超達人/.test(d.tier || '') ? '초달인' : /達人/.test(d.tier || '') ? '달인' : '';
    const mich = d.michelin ? (d.michelin.stars ? '미슐랭' + d.michelin.stars + '★' : d.michelin.bib ? '빕구르망' : '') : '';
    const badge = [tier, mich].filter(Boolean).join('·');
    const budget = (d.budget || '').replace(/円/g, '엔').replace(/未満/g, ' 미만').replace(/以上/g, ' 이상');
    const closed = d.closed && d.closed !== '확인불가' ? ' · 휴무 ' + d.closed.replace(/曜日?/g, '요일') : '';
    if (!d.gcid && !d.address) dropped++;
    return [
      'tatsu',
      d.nameKr + (badge ? ' [' + badge + ']' : ''),
      g + (menu ? ' · ' + menu : ''),
      '타베로그 ' + (d.tabelog || '-') + ' · ' + budget + closed,
      station(d.access) || d.city,
      d.gcid ? 'cid:' + d.gcid : (d.name || d.nameKr),
      GENRE[d.bucket] || '양식·기타',
    ];
  });
  console.log(city.padEnd(5), out[city].length, '곳 · 인증',
    rows.filter((d) => d.tier && d.tier !== '없음').length);
}

let js = '';
for (const c of CITIES) js += `'${c}':[\n` + out[c].map((r) => JSON.stringify(r)).join(',\n') + '\n],\n';
await writeFile('tatsujin-all.js', js, 'utf8');
console.log('\n총', CITIES.reduce((n, c) => n + out[c].length, 0), '곳 ·', (js.length / 1024).toFixed(0), 'KB · gcid/주소 없는 곳', dropped);
