# 2026 일본 여행 플래너

나고야·교토·오사카·후쿠오카 중 한 곳으로 가는 2026년 가을 여행을 8단계로 좁히는 인터랙티브 플래너.

- 웹: https://pnb486.github.io/japan-trip/
- 단일 파일(오프라인·카톡 공유용): `japan-trip-planner.html` — 히어로 영상까지 내장(17.8MB)

## 빌드

원본은 `japan-trip-design/일본 여행 플래너.dc.html` 하나만 고친다.

```bash
node build-planner.mjs            # japan-trip-planner.html (단일 파일, 영상 내장)
node build-planner.mjs --hosted   # index.html (호스팅용, 영상은 assets/ 스트리밍)
```

빌드가 환율 스냅샷(ECB · frankfurter.dev)을 같이 굽는다. 열면 온라인에서 최신 환율로 갱신된다.

## 구조

- `japan-trip-design/` — Design Composer 원본, 런타임(`support.js`), 테마(`_ds/`), 지도·영상 에셋
- `japan-trip-design/_tools/` — 지오코딩·좌표 검사(`geo-scan.mjs` → `geo-fix.mjs --apply`)·정적 점검(`audit.mjs`)
- 항공 시간표는 2026-10-11 SlickTrip 조회 스냅샷(인천⇄후쿠오카 11/18·19 출발, 11/20·21 귀국)

선택은 브라우저 localStorage 에 저장된다(`japan-trip-planner-v1`).
