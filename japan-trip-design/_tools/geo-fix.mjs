// 오염 좌표 교정 — geo-bad.json 의 실제 행만 대상으로, 달인 가이드 주소를 국토지리원 주소검색으로 지오코딩해 바꾼다.
// 사용: node geo-fix.mjs            (조회 + 결과 출력, 파일 미수정)
//       node geo-fix.mjs --apply    (.dc.html 에 반영)
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const APPLY = process.argv.includes('--apply');
const P = 'C:/Users/Soul/Desktop/AI/Claude/japan-trip/japan-trip-design/일본 여행 플래너.dc.html';
const bad = JSON.parse(readFileSync(new URL('./geo-bad.json', import.meta.url), 'utf8'));
const src = readFileSync('C:/Users/Soul/Desktop/AI/Claude/japan-food-guide/suntory-tatsujin-guide.html', 'utf8');
const a = src.indexOf('const DATA = ['), b = src.indexOf('];', a);
const ctx = {}; vm.createContext(ctx);
const DATA = vm.runInContext(src.slice(a, b + 2) + '; DATA', ctx);
const byCid = new Map(DATA.map(d => [String(d.gcid), d]));

const box = {'나고야':[34.2,36.5,135.8,138.0],'교토':[33.8,35.9,134.2,136.5],'오사카':[33.8,35.9,134.2,136.5],'후쿠오카':[31,34.6,128.5,132.6]};
const inBox = (c, la, ln) => { const [a1,a2,b1,b2] = box[c]; return la>=a1&&la<=a2&&ln>=b1&&ln<=b2; };

// 관광·근교 행은 손으로 — 유명지라 좌표가 확실하다.
const MANUAL = {
  '기온 시라카와': [35.00560,135.77570],
  '시센도': [35.04320,135.79360],
  '리틀월드': [35.35460,136.98020],
  '미나미치타 우츠미 해변': [34.74650,136.86860],
  '구마노 나치 대사·나치 폭포': [33.67190,135.89050],
  // 시라하마는 와카야마라 상자 밖일 뿐 값은 맞다 → 건너뜀
  // 국토지리원이 구(区) 중심으로 뭉개거나 못 찾은 교토 6곳 — 역·골목 기준 손 좌표
  '솔로노': [35.01070,135.75950],
  '돈카츠 야마모토': [35.01130,135.76800],
  '곤타로 본점': [35.00530,135.76600],
  '스시 코마츠': [35.00400,135.77000],
  '키치키치': [35.00830,135.77090],
  '텐푸라 마츠': [35.00050,135.68750],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const gsi = async (q) => {
  const u = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q);
  const r = await fetch(u, { headers: { 'User-Agent': 'japan-trip-planner geo-fix (personal)' } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) return null;
  const [lng, lat] = j[0].geometry.coordinates;
  return { lat: +lat.toFixed(5), lng: +lng.toFixed(5), title: j[0].properties.title };
};

// 주소를 점점 짧게 — 번지 → 丁目 → 町名 순으로 물러선다.
const variants = (addr) => {
  const v = [addr];
  const m1 = addr.match(/^(.+?\d+丁目)/); if (m1) v.push(m1[1]);
  const m2 = addr.match(/^(.+?[区市郡][^\d]+)/); if (m2) v.push(m2[1]);
  return [...new Set(v)];
};

const fixes = []; const fails = [];
for (const city of Object.keys(bad)) {
  for (const row of bad[city].bad) {
    if (MANUAL[row.name]) { fixes.push({ city, name: row.name, old: [row.la, row.ln], nu: MANUAL[row.name], how: 'manual' }); continue; }
    const cid = (row.jp.match(/^cid:(\d+)$/) || [])[1];
    const d = cid && byCid.get(cid);
    if (!d || !d.address) { fails.push({ city, name: row.name, why: 'no address (cid ' + cid + ')' }); continue; }
    let got = null, used = null;
    for (const q of variants(d.address)) {
      got = await gsi(q); await sleep(350);
      if (got && inBox(city, got.lat, got.lng)) { used = q; break; }
      got = null;
    }
    if (!got) { fails.push({ city, name: row.name, why: 'gsi miss: ' + d.address }); continue; }
    fixes.push({ city, name: row.name, old: [row.la, row.ln], nu: [got.lat, got.lng], how: used === d.address ? 'addr' : 'addr-short(' + used + ')', addr: d.address });
  }
}
for (const f of fixes) console.log(f.city, '|', f.name, '|', f.old.join(','), '→', f.nu.join(','), '|', f.how);
for (const f of fails) console.log('FAIL', f.city, '|', f.name, '|', f.why);
console.log('\nfixes', fixes.length, 'fails', fails.length);

if (APPLY) {
  let s = readFileSync(P, 'utf8');
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let n = 0;
  for (const f of fixes) {
    const key = `(['"])${esc(f.name.replace(/"/g, '\\"'))}\\1`;
    const re = new RegExp(key + `:\\[${esc(String(f.old[0]))}0?,${esc(String(f.old[1]))}0?\\]`, 'g');
    const hits = s.match(re);
    if (!hits || hits.length !== 1) { console.log('SKIP (hits=' + (hits ? hits.length : 0) + ')', f.name); continue; }
    s = s.replace(re, (m, q) => `${q}${f.name.replace(/"/g, '\\"')}${q}:[${f.nu[0]},${f.nu[1]}]`);
    n++;
  }
  writeFileSync(P, s, 'utf8');
  console.log('applied', n);
}
