# -*- coding: utf-8 -*-
# 근교(trip) 항목 중 좌표를 못 얻은 곳만 다시 조회한다.
# 앞선 실행이 429(요청 과다)를 맞고 그 결과를 '없음'으로 캐시해 버려, 그대로 두면 영영 재시도되지 않는다.
# 여기서는 (1) 해당 캐시를 지우고 (2) 간격을 넉넉히 두고 (3) 통신 오류는 캐시하지 않는다.
import io, json, os, re, time, urllib.parse, urllib.request

DC = r'C:\Users\Soul\Desktop\AI\Claude\japan-trip\japan-trip-design\일본 여행 플래너.dc.html'
CACHE = 'geo-cache.json'
OUT = 'spot-geo.json'
UA = 'japan-trip-planner/1.0 (personal trip planning)'
CITIES = ['나고야', '교토', '오사카', '후쿠오카']

src = io.open(DC, encoding='utf8').read()
geo = json.load(io.open(OUT, encoding='utf8'))
cache = json.load(io.open(CACHE, encoding='utf8'))

base = src.index('spotsData() {')
todo = []
for city in CITIES:
    m = re.search(r"'" + city + r"':\[", src[base:])
    i = base + m.end() - 1
    d = 0
    for j in range(i, len(src)):
        if src[j] == '[':
            d += 1
        elif src[j] == ']':
            d -= 1
            if d == 0:
                break
    body = src[i + 1:j]
    # [trip, 이름, 설명, 정보, 위치, 지도쿼리, 장르]
    for name, mapq in re.findall(r"\['trip','([^']*)','[^']*','[^']*','[^']*','([^']*)'", body):
        if name not in geo.get(city, {}):
            todo.append((city, name, mapq))

print('재시도 대상', len(todo), '곳')
# 실패로 캐시된 항목 제거 — 다시 물어볼 수 있게
purged = 0
for _, _, q in todo:
    for key in (q, q + ' 日本'):
        if key in cache and not cache[key]:
            del cache[key]
            purged += 1
print('실패 캐시 제거', purged, '건')


def lookup(q, tries=3):
    for t in range(tries):
        url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
            {'q': q, 'format': 'json', 'limit': 1, 'countrycodes': 'jp'})
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            return [float(d[0]['lat']), float(d[0]['lon'])] if d else None
        except Exception as e:
            code = getattr(e, 'code', None)
            if code == 429:
                time.sleep(8 * (t + 1))   # 과다 요청이면 물러났다 다시
                continue
            print('   ! ', repr(e)[:60])
            return None
    return None


ok = 0
for n, (city, name, mapq) in enumerate(todo, 1):
    q = mapq if mapq and not mapq.startswith('cid:') else name
    hit = cache.get(q)
    if not hit:
        hit = lookup(q)
        if hit:
            cache[q] = hit          # 성공만 캐시 (실패는 다음에 다시 시도되게)
        time.sleep(2.0)             # 넉넉한 간격
    if hit:
        geo.setdefault(city, {})[name] = hit
        ok += 1
    if n % 10 == 0:
        print('  진행', n, '/', len(todo), '· 성공', ok)
        json.dump(cache, io.open(CACHE, 'w', encoding='utf8'), ensure_ascii=False)
        json.dump(geo, io.open(OUT, 'w', encoding='utf8'), ensure_ascii=False)

json.dump(cache, io.open(CACHE, 'w', encoding='utf8'), ensure_ascii=False)
json.dump(geo, io.open(OUT, 'w', encoding='utf8'), ensure_ascii=False)
print('\n근교 좌표 확보 %d / %d' % (ok, len(todo)))
print('전체 좌표', {c: len(geo.get(c, {})) for c in CITIES}, '합계', sum(len(v) for v in geo.values()))
