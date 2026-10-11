// OSM(Overpass)에서 도시별 해안선·주요 하천을 받아, 플래너 지도와 같은 좌표계로 눕혀
// 0~100 공간의 SVG path 로 바꾼다. 결과는 파일에 구워 넣으므로 실행 시 네트워크가 필요 없다.
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// 각 도시의 표시 창(center + 위도폭). 가로:세로 = 16:9 로 맞춰 왜곡이 없도록 경도폭을 역산.
const VIEW = {
  '나고야':  {lat:35.140, lng:136.885, dLat:0.160},
  '교토':    {lat:34.9835,lng:135.7325,dLat:0.140},
  '오사카':  {lat:34.687, lng:135.4775,dLat:0.190},
  '후쿠오카':{lat:33.5905,lng:130.4430,dLat:0.175},
};
const AR = 16/9;
const rect = v => {
  const k = Math.cos(v.lat*Math.PI/180);
  const dLng = (v.dLat*AR)/k;
  return {latMin:v.lat-v.dLat/2, latMax:v.lat+v.dLat/2, lngMin:v.lng-dLng/2, lngMax:v.lng+dLng/2, k};
};

const EP = 'https://overpass-api.de/api/interpreter';
const fetchOverpass = async (q) => {
  // node 의 fetch 는 이 환경에서 막혀 있어 curl 로 호출한다.
  for (let i=0;i<5;i++) {
    let t='';
    try {
      t = execFileSync('curl', ['-s','--max-time','120','--data-urlencode','data@-', EP],
        {input:q, encoding:'utf8', maxBuffer:1<<28});
    } catch(e) { t = ''; }
    if (t.startsWith('{')) return JSON.parse(t);
    console.log('  재시도', i+1, (t||'(빈 응답)').slice(0,70).replace(/\s+/g,' '));
    await new Promise(s=>setTimeout(s, 5000*(i+1)));
  }
  throw new Error('Overpass 실패');
};

// Douglas-Peucker (좌표는 이미 0~100 공간)
const dp = (pts, tol) => {
  if (pts.length < 3) return pts;
  let idx=0, max=0;
  const [ax,ay]=pts[0], [bx,by]=pts[pts.length-1];
  const dx=bx-ax, dy=by-ay, den=Math.hypot(dx,dy)||1e-9;
  for (let i=1;i<pts.length-1;i++){
    const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/den;
    if (d>max){max=d;idx=i;}
  }
  if (max<=tol) return [pts[0], pts[pts.length-1]];
  return dp(pts.slice(0,idx+1),tol).slice(0,-1).concat(dp(pts.slice(idx),tol));
};

const out = {};
for (const [city,v] of Object.entries(VIEW)) {
  const R = rect(v);
  const bbox = [R.latMin,R.lngMin,R.latMax,R.lngMax].map(n=>n.toFixed(4)).join(',');
  console.log(city, 'bbox', bbox);
  const q = `[out:json][timeout:90];
(
  way["natural"="coastline"](${bbox});
  way["waterway"="river"]["name"](${bbox});
);
out geom;`;
  const j = await fetchOverpass(q);
  // 위경도 → 표시창 기준 0~100
  const px = ([lng,lat]) => [
    (lng-R.lngMin)/(R.lngMax-R.lngMin)*100,
    (R.latMax-lat)/(R.latMax-R.latMin)*100,
  ];
  const coast=[], river=[];
  for (const el of j.elements) {
    if (!el.geometry) continue;
    const pts = el.geometry.map(g=>px([g.lon,g.lat]));
    // 표시창을 스치지도 않는 선은 버림
    if (!pts.some(p=>p[0]>-20&&p[0]<120&&p[1]>-20&&p[1]<120)) continue;
    const s = dp(pts, 0.3);
    if (s.length<2) continue;
    const isCoast = el.tags && el.tags.natural==='coastline';
    if (!isCoast) {
      // 실개천까지 다 그리면 지저분해진다. 화면상 길이가 짧은 지류는 버린다.
      let len=0; for (let i=1;i<s.length;i++) len+=Math.hypot(s[i][0]-s[i-1][0], s[i][1]-s[i-1][1]);
      if (len < 4) continue;
    }
    (isCoast ? coast : river).push(s);
  }
  // 화면 밖으로 멀리 나간 구간은 잘라 용량을 줄인다
  const clip = lines => lines.map(l=>l.map(([x,y])=>[Math.max(-6,Math.min(106,x)), Math.max(-6,Math.min(106,y))]));
  coast.splice(0, coast.length, ...clip(coast));
  river.splice(0, river.length, ...clip(river));
  const toPath = lines => lines.map(l=>'M'+l.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')).join('');
  out[city] = {coast:toPath(coast), river:toPath(river), n:{coast:coast.length,river:river.length}};
  console.log('  해안선', coast.length, '선 /', out[city].coast.length, 'B ·  하천', river.length, '선 /', out[city].river.length, 'B');
  await new Promise(s=>setTimeout(s,2500));
}
await writeFile('terrain.json', JSON.stringify(out), 'utf8');
console.log('\n합계', JSON.stringify(out).length, 'B');
