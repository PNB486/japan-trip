# -*- coding: utf-8 -*-
# 받아둔 타일을 이어 붙이고, 표시창에 정확히 맞춰 자른 뒤 줄여서 JPEG 로 저장한다.
import json, io, os, math
from PIL import Image

cfg = json.load(open('plan.json', encoding='utf8'))
Z, STYLE, plan = cfg['Z'], cfg['STYLE'], cfg['plan']
OUTW = int(os.environ.get('OUTW', '1120'))
Q = int(os.environ.get('Q', '72'))

for city, p in plan.items():
    X0, X1, Y0, Y1 = p['X0'], p['X1'], p['Y0'], p['Y1']
    W, H = (X1-X0)*256, (Y1-Y0)*256
    canvas = Image.new('RGB', (W, H), (240, 238, 232))
    miss = 0
    for X in range(X0, X1):
        for Y in range(Y0, Y1):
            f = 'tiles/%s_%d_%d_%d.png' % (STYLE, Z, X, Y)
            try:
                canvas.paste(Image.open(f).convert('RGB'), ((X-X0)*256, (Y-Y0)*256))
            except Exception:
                miss += 1
    # 표시창 경계를 픽셀로 환산해 자른다
    left  = (p['x0']-X0)*256
    right = (p['x1']-X0)*256
    top   = (p['y0']-Y0)*256
    bot   = (p['y1']-Y0)*256
    crop = canvas.crop((int(round(left)), int(round(top)), int(round(right)), int(round(bot))))
    outh = int(round(OUTW*crop.height/crop.width))
    small = crop.resize((OUTW, outh), Image.LANCZOS)
    fn = 'map_%s.jpg' % city
    small.save(fn, 'JPEG', quality=Q, optimize=True, progressive=True)
    print('%-6s 원본 %dx%d → %dx%d · %5.1fKB · 빠진타일 %d'
          % (city, crop.width, crop.height, small.width, small.height,
             os.path.getsize(fn)/1024, miss))
