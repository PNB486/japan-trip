# -*- coding: utf-8 -*-
# 플래너의 120개 스팟에 실제 좌표를 붙인다.
# 질의는 여러 후보를 순서대로 시도하고, 다 실패하면 좌표 없이 남겨 구역 중심으로 물러난다.
# Nominatim 이용 규칙(초당 1회, User-Agent 명시)을 지킨다. 결과는 캐시해 재실행을 싸게 만든다.
import io, json, os, re, time, urllib.parse, urllib.request

DC = r'C:\Users\Soul\Desktop\AI\Claude\japan-trip\japan-trip-design\일본 여행 플래너.dc.html'
GUIDE = r'C:\Users\Soul\Desktop\AI\Claude\japan-food-guide\suntory-tatsujin-guide.html'
CACHE = 'geo-cache.json'
UA = 'japan-trip-planner/1.0 (personal trip planning)'
CITY_JP = {'나고야': '名古屋市', '교토': '京都市', '오사카': '大阪市', '후쿠오카': '福岡市'}

src = io.open(DC, encoding='utf8').read()


def block(marker):
    a = src.index(marker)
    o = src.index('{', src.index('return', a))
    d = 0
    for i in range(o, len(src)):
        if src[i] == '{':
            d += 1
        elif src[i] == '}':
            d -= 1
            if d == 0:
                return src[o:i + 1]
    raise SystemExit('블록 파싱 실패: ' + marker)


ITEM = r"""(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""


def js_arrays(text):
    """['a','b',...] 와 ["a","b",...] 두 형식 모두에서 문자열 배열을 뽑는다."""
    out = []
    for m in re.findall(r"\[(?:" + ITEM + r"\s*,?\s*)+\]", text):
        out.append([f[1:-1] for f in re.findall(ITEM, m)])
    return out


def per_city(text):
    """도시 키 뒤의 배열을 대괄호 짝을 세어 정확히 잘라낸다.
    (정규식 lazy 매칭은 여러 줄에 걸친 배열에서 첫 ']' 에 걸려 끊긴다)"""
    out = {}
    for city in CITY_JP:
        m = re.search(r"'" + city + r"'\s*:\s*\[", text)
        if not m:
            continue
        i = m.end() - 1
        d = 0
        for j in range(i, len(text)):
            if text[j] == '[':
                d += 1
            elif text[j] == ']':
                d -= 1
                if d == 0:
                    out[city] = js_arrays(text[i + 1:j])
                    break
    return out


spots = per_city(block('spotsData() {'))
tats = per_city(block('tatsujinSpots() {'))

# 달인 가이드에서 한글명 → (일본어명, 주소) 표를 만든다. 주소가 이름보다 잘 찍힌다.
g = io.open(GUIDE, encoding='utf8').read()
jp_by_kr = {}
for m in re.finditer(r"name:'([^']*)',\s*nameKr:'([^']*)'.*?address:'([^']*)'", g):
    jp_by_kr[m.group(2)] = (m.group(1), m.group(3))

cache = json.load(io.open(CACHE, encoding='utf8')) if os.path.exists(CACHE) else {}


def lookup(q):
    if q in cache:
        return cache[q]
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': q, 'format': 'json', 'limit': 1, 'countrycodes': 'jp'})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        res = [float(d[0]['lat']), float(d[0]['lon'])] if d else None
    except Exception as e:
        print('   ! 요청 실패', repr(e)[:60])
        res = None
    cache[q] = res
    time.sleep(1.1)  # 이용 규칙: 초당 1회
    json.dump(cache, io.open(CACHE, 'w', encoding='utf8'), ensure_ascii=False)
    return res


def candidates(city, row, is_tat):
    name, mapq = row[1], row[5] if len(row) > 5 else ''
    out = []
    if is_tat:
        base = re.sub(r'\s*\[[^\]]*\]', '', name)  # "이름 [달인]" → "이름"
        jp = jp_by_kr.get(base)
        if jp:
            out.append(jp[0])                                  # 일본어 상호
            addr = re.sub(r'\s*\d+F.*$', '', jp[1])            # 층수 제거
            out.append(addr)
            out.append(re.sub(r'[-‐0-9]+$', '', addr))         # 번지 끝자리 제거
    else:
        if mapq and not mapq.startswith('cid:'):
            out.append(mapq)
            out.append(mapq + ' ' + CITY_JP[city])
    return [q for q in out if q and len(q) > 2]


result, miss = {}, []
total = sum(len(v) for v in spots.values()) + sum(len(v) for v in tats.values())
done = 0
for city in CITY_JP:
    for is_tat, rows in ((False, spots.get(city, [])), (True, tats.get(city, []))):
        for row in rows:
            done += 1
            name = row[1]
            hit = None
            for q in candidates(city, row, is_tat):
                hit = lookup(q)
                if hit:
                    break
            if hit:
                result.setdefault(city, {})[name] = hit
            else:
                miss.append(city + ' / ' + name)
            if done % 20 == 0:
                print('  진행', done, '/', total, '· 실패', len(miss))

json.dump(result, io.open('spot-geo.json', 'w', encoding='utf8'), ensure_ascii=False)
print('\n좌표 확보 %d / %d' % (total - len(miss), total))
for c in CITY_JP:
    print('  %-5s %d곳' % (c, len(result.get(c, {}))))
if miss:
    print('\n[좌표 못 찾음 — 구역 중심으로 대체]')
    for m in miss:
        print('  ', m)
