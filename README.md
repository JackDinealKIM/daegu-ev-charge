# 충전은 어디서 멈추는가 — 대구 공공 전기차 충전 인프라 이용 편중·공백 진단

2026 대구광역시 기후·환경·탄소중립 공공데이터 AI 활용대회 **부문 2(공공데이터 분석·시각화)** 출품작입니다.

## 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 대시보드 문서 |
| `styles.css` | 스타일 (반응형) |
| `app.js` | 차트·지도·표 렌더링 (외부 라이브러리 없음) |
| `twin.js` | 3D 디지털 트윈 (Three.js · 행정동 블록 · 219개 충전소 기둥) |
| `three.min.js` | Three.js r149 (로컬 번들, CDN 의존 없음) |
| `data.js` | 원본 CSV에서 직접 집계한 데이터 (오프라인 내장) |
| `emblem-daegu-ev.jpg` / `favicon.png` | 히어로 엠블럼·파비콘 (생성형 AI로 제작) |
| `.nojekyll` | GitHub Pages에서 `_` 로 시작하는 파일 처리 방지 |

외부 서버·API·CDN을 쓰지 않습니다. `index.html`을 브라우저로 열면 파일 하나로 완전히 동작합니다.

## 3D 디지털 트윈 (④ 섹션)

행정동 경계를 높이가 있는 블록으로, 충전소 219곳을 발광 기둥으로 옮겨 그린 인터랙티브 뷰입니다.

- **지표 전환** : 누적 충전량(kWh) / 충전기 수 / 이용률(누적 충전량 ÷ 설비용량) — 기둥 높이·색과 지형 높이가 함께 바뀝니다.
- **카메라 프리셋** : 대구 전체 / 도심 과밀(충전량 상위 40곳 무게중심) / 외곽 사각지대(미충전 EV 상위 3개 동 무게중심).
- **인터랙션** : 드래그 회전, 휠·핀치 확대, 호버 툴팁, 기둥 클릭 시 충전소 상세 패널.
- **재배치 연동** : 재배치 시나리오의 이동 대수·목적지 구·군을 바꾸면 이동 대상 기둥이 주황으로 꺼지고,
  도착 구·군에 링·라벨·이동 경로가 실시간으로 표시됩니다. 계산은 `app.js`의 시뮬레이터와 동일한 값을 씁니다.

## GitHub Pages 배포

```bash
# 새 저장소(daegu-ev-charge)를 만든 뒤
git init
git add .
git commit -m "대구 EV 충전 인프라 편중·공백 대시보드"
git branch -M main
git remote add origin https://github.com/<계정>/daegu-ev-charge.git
git push -u origin main
# 저장소 Settings → Pages → Source: Deploy from a branch → main / (root)
```

배포 주소(라이브): https://jackdinealkim.github.io/daegu-ev-charge/

## 데이터 출처

- 대구광역시_전기자동차 충전기 이용 현황 (2026-03-31 기준, 128,263행) — https://data.daegu.go.kr/open/data/dataView.do?dataSetId=15067156&dataSetDetailId=15067156dd74674c8f2f&provdMethod=FILE
- 대구광역시_행정동별 전기차 등록대수 (2025-10-31 기준, 150개 행정동) — https://data.daegu.go.kr/open/data/dataView.do?dataSetId=15072325&dataSetDetailId=150723251d4bf23fe59b7&provdMethod=FILE
- 행정동 경계 — 통계청 SGIS 공개 행정동 경계 기반 가공본(CC BY 4.0), https://github.com/vuski/admdongkor (지도 표시·공간 결합에만 사용)

분석 기간 2024-10-18 ~ 2026-03-31 (530일 기록), 누적 충전량 8,530,866.6kWh.
