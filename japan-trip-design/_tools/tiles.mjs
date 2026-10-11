// 국토지리원(GSI) 타일을 도시별 표시창만큼 받아 한 장으로 잇고, 줄여서 파일에 굽는다.
// 실행 중에는 네트워크를 쓰지 않는다. 출처 표기 필요: 「地理院タイル」
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';

const VIEW = {
  '나고야':  {lat:35.140, lng:136.885, dLat:0.160},
  '교토':    {lat:34.9835,lng:135.7325,dLat:0.140},
  '오사카':  {lat:34.687, lng:135.4775,dLat:0.190},
  '후쿠오카':{lat:33.5905,lng:130.4430,dLat:0.175},
};
const AR = 16/9, Z = Number(process.argv[2]||13), STYLE = process.argv[3]||'pale';
const rect = v => {
  const k = Math.cos(v.lat*Math.PI/180);
  const dLng = (v.dLat*AR)/k;
  return {latMin:v.lat-v.dLat/2, latMax:v.lat+v.dLat/2, lngMin:v.lng-dLng/2, lngMax:v.lng+dLng/2};
};
// 웹메르카토르 타일 좌표(소수 포함)
const tx = (lng,z) => (lng+180)/360*Math.pow(2,z);
const ty = (lat,z) => { const r=lat*Math.PI/180;
  return (1 - Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z); };

mkdirSync('tiles', {recursive:true});
const plan = {};
for (const [city,v] of Object.entries(VIEW)) {
  const R = rect(v);
  const x0=tx(R.lngMin,Z), x1=tx(R.lngMax,Z), y0=ty(R.latMax,Z), y1=ty(R.latMin,Z);
  const X0=Math.floor(x0), X1=Math.ceil(x1), Y0=Math.floor(y0), Y1=Math.ceil(y1);
  plan[city]={R,x0,x1,y0,y1,X0,X1,Y0,Y1,n:(X1-X0)*(Y1-Y0)};
  console.log(city, 'z'+Z, (X1-X0)+'x'+(Y1-Y0), '=', plan[city].n, '장');
}
const total = Object.values(plan).reduce((a,p)=>a+p.n,0);
console.log('합계', total, '장');

let done=0, skipped=0;
for (const [city,p] of Object.entries(plan)) {
  for (let X=p.X0; X<p.X1; X++) for (let Y=p.Y0; Y<p.Y1; Y++) {
    const f = `tiles/${STYLE}_${Z}_${X}_${Y}.png`;
    if (existsSync(f) && statSync(f).size>500) { skipped++; continue; }
    try {
      execFileSync('curl', ['-s','--max-time','25','-o',f,
        `https://cyberjapandata.gsi.go.jp/xyz/${STYLE}/${Z}/${X}/${Y}.png`]);
    } catch(e) {}
    done++;
    if (done%40===0) console.log('  받는 중', done, '/', total-skipped);
  }
}
console.log('완료 — 신규', done, '· 재사용', skipped);
import { writeFileSync } from 'node:fs';
writeFileSync('plan.json', JSON.stringify({Z,STYLE,plan}), 'utf8');
