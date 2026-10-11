# -*- coding: utf-8 -*-
# 영상 설명란의 구글맵 단축링크를 따라가 좌표와 실제 상호를 뽑는다.
import json, io, re, time, urllib.request, urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
PLACES = [
 ('스시사카바','https://maps.app.goo.gl/QMcx7skSF9fcKpvK7'),
 ('이몬네 하카타','https://maps.app.goo.gl/3Psh24LuQDNumvyq8'),
 ('죠스이안 하카타','https://maps.app.goo.gl/QyTZ63moMbmL7fUJ9'),
 ("BOUL'ANGE",'https://maps.app.goo.gl/h6A8Pphe37aZKysTA'),
 ('더 게이트 호텔 후쿠오카','https://maps.app.goo.gl/W7AtoCswhAhQMd9o9'),
 ('야키토리 마코','https://maps.app.goo.gl/Bn48tNHsMsfdaeHK8'),
 ('쿠시아게 하야시','https://maps.app.goo.gl/HA5DqRw7JgmWTfrK7'),
 ('이치란라멘 본점','https://maps.app.goo.gl/1AE859nq5Mkz7Ky79'),
 ('사바타로','https://maps.app.goo.gl/9MXf1ctDwoMpZSEX6'),
 ('스시사카이','https://maps.app.goo.gl/xVzbJcp16iQqpbDg6'),
 ('빵 스톡 텐진점','https://maps.app.goo.gl/gSLkzMgH5hS7p6ND6'),
 ('미츠이모 타임 야쿠인점','https://maps.app.goo.gl/HXVbmkUqG69ng53X8'),
 ('나가라쿠','https://maps.app.goo.gl/vEt545koTipr16ps5'),
 ('효고토리','https://maps.app.goo.gl/3zcy1k4f9TQi8poP7'),
 ('후르츠 가든 신선','https://maps.app.goo.gl/YqiuvNHdURL9L5wd6'),
 ('다코멧카','https://maps.app.goo.gl/g1Wtx2UuXJKhXQ1X6'),
 ('이쿠라 텐진이마이즈미점','https://maps.app.goo.gl/TSR89sFrk7p3Y6iM8'),
 ('멘야카네토라','https://maps.app.goo.gl/enEYeaXUNfgg4yv5A'),
 ('이모야 킨지로','https://maps.app.goo.gl/LvVB5LQabR3ecRiK9'),
]

def resolve(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        final = r.geturl()
        body = r.read().decode('utf8', 'ignore')
    # 좌표는 /@lat,lng 또는 !3dlat!4dlng 형태로 들어온다
    m = re.search(r'/@(-?\d+\.\d+),(-?\d+\.\d+)', final) or re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', final)
    if not m:
        m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', body) or re.search(r'/@(-?\d+\.\d+),(-?\d+\.\d+)', body)
    name = ''
    nm = re.search(r'<meta content="([^"]+)" itemprop="name"', body) or re.search(r'<title>([^<]+)</title>', body)
    if nm:
        name = nm.group(1).replace(' - Google 지도', '').replace(' - Google Maps', '').strip()
    return (float(m.group(1)), float(m.group(2))) if m else None, name, final

out = {}
for kr, url in PLACES:
    try:
        coord, name, final = resolve(url)
    except Exception as e:
        coord, name, final = None, '', repr(e)[:60]
    out[kr] = {'coord': coord, 'name': name, 'final': final[:120]}
    print('%-22s %s  %s' % (kr, coord, name[:40]))
    time.sleep(0.6)

json.dump(out, io.open('yt-places.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('\n좌표 확보', sum(1 for v in out.values() if v['coord']), '/', len(PLACES))
