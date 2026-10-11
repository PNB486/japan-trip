import { readFileSync, writeFileSync } from 'node:fs';
const s = readFileSync('C:/Users/Soul/Desktop/AI/Claude/japan-trip/japan-trip-design/일본 여행 플래너.dc.html','utf8');
const box = {'나고야':[34.2,36.5,135.8,138.0],'교토':[33.8,35.9,134.2,136.5],'오사카':[33.8,35.9,134.2,136.5],'후쿠오카':[31,34.6,128.5,132.6]};
const F = "(?:'((?:[^'\\\\]|\\\\.)*)'|\"((?:[^\"\\\\]|\\\\.)*)\")";
const rowRe = new RegExp("\\[" + [F,F,F,F,F,F].join(',') , 'g');
const geoRe = new RegExp(F + ":\\[([0-9.]+),([0-9.]+)\\]", 'g');
const un = t => (t==null?'':t).replace(/\\'/g, "'").replace(/\\"/g, '"');
const pick = (m,i) => m[i] != null ? m[i] : m[i+1];
const rowsByCity = {};
const sd = s.indexOf('spotsData()'), gd = s.indexOf('terrain()'), td = s.indexOf('tatsujinSpots()'), cd = s.indexOf('calData()');
for (const [a,b] of [[sd,gd],[td,cd]]) {
  const seg = s.slice(a,b);
  for (const c of Object.keys(box)) {
    const x = seg.indexOf("'"+c+"':["); if (x<0) continue;
    let end = seg.length; for (const d of Object.keys(box)) { if(d===c) continue; const k=seg.indexOf("'"+d+"':[",x+5); if(k>0&&k<end) end=k; }
    const blk = seg.slice(x,end);
    for (const m of blk.matchAll(rowRe)) (rowsByCity[c] ||= new Map()).set(un(pick(m,3)), {type:un(pick(m,1)), area:un(pick(m,9)), jp:un(pick(m,11)), desc:un(pick(m,5))});
  }
}
const gs = s.indexOf('spotGeo()'); const ge = s.indexOf('geoData()');
const geoSeg = s.slice(gs,ge);
const report = {};
for (const c of Object.keys(box)) {
  const a = geoSeg.search(new RegExp("'"+c+"':\{")); const b = geoSeg.indexOf('}',a); const blk = geoSeg.slice(a,b);
  const [la1,la2,ln1,ln2] = box[c]; const rows = rowsByCity[c]||new Map();
  const bad=[], orphan=[]; let n=0;
  for (const m of blk.matchAll(geoRe)) {
    n++; const name=un(pick(m,1)); const la=+m[3], ln=+m[4];
    if (la<la1||la>la2||ln<ln1||ln>ln2) { const r=rows.get(name); if (r) bad.push({name, la, ln, ...r}); else orphan.push(name); }
  }
  report[c] = {total:n, rows:rows.size, bad, orphanBad:orphan.length};
  console.log('\n=== '+c, 'geo', n, 'rows', rows.size, 'bad-real', bad.length, 'bad-orphan', orphan.length);
  for (const x of bad) console.log(' ', x.type, '|', x.name, '|', x.la+','+x.ln, '|', x.area, '|', x.jp);
}
writeFileSync(new URL('./geo-bad.json', import.meta.url), JSON.stringify(report, null, 1));
