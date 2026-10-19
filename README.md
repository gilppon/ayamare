# SUMIMASEN! — 사죄 재산

기자들의 질문을 받으면서 **정확한 타이밍에, 정확한 각도로** 고개를 숙이는 4K 코미디 리듬게임.
5스테이지 + 데일리 챌린지 + 채보 에디터(UGC), ko/en/ja 3언어.

```
A / S / D / SPACE   ->   15deg / 45deg / 90deg / DOGEZA
```

## 실행

```powershell
npm install
npm run dev          # 개발 서버
npm run build        # 타입체크 + 프로덕션 빌드 (PWA)
npm run preview      # 빌드 미리보기
npm run typecheck    # tsc --noEmit (앱 + E2E + vitest 설정)
npm run lint         # eslint (경고 0 tolerated — --max-warnings 0)
npm run test         # vitest (622 케이스, jsdom)
npm run test:coverage# 커버리지 게이트 포함 실행
npm run verify       # typecheck + lint + test
npm run test:e2e     # Playwright (Chromium)
npm run test:perf    # 성능 프로브 (측정값 단정 없음 — 구조 불변식만)
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/game/` | 순수 로직 (판정 / 가시성 / 레이아웃 / DDA / 스킬 / 채보 / 오디오) |
| `src/game/visibility.ts` | 노트 가시성, 입력 대상 선택, 낙하 곡선 |
| `src/game/noteLayout.ts` | 노트 프레임 레이아웃 (Y/테일/투명도/색상), 기믹 예고 |
| `src/game/editorChart.ts` | 에디터 <-> Chart 8분박자 좌표계 변환 |
| `src/game/charts/*.json` | 스테이지 채보 데이터 (5개 자산, 스키마 검증 대상) |
| `src/game/chartData.ts` | 채보 데이터 스키마 검증 + 데이터 → Chart 변환 |
| `src/game/effects.ts` | 부수효과(햅틱/TTS) 실패 기록 — 삼키되 조용히 사라지지 않게 |
| `src/components/GameScreen.tsx` | 게임 루프, 판정, 상태 오케스트레이션 |
| `src/components/game/NoteField.tsx` | 레인 / 노트 / 리시버 / 판정 연출 (프레젠테이션) |
| `src/components/game/GameHud.tsx` | HUD · 사이드 패널 · 레인 키 |
| `src/components/game/Overlays.tsx` | 카운트다운 / 대기 / 일시정지 / 종료 |
| `src/components/ManagerKim.tsx` | 주인공 SVG (회전은 `setPose` 핸들로 DOM 직접 쓰기) |
| `src/stores/` | Zustand — 메타(재화/스킬), 진행(기록/미션), 설정 |

### 설계 메모

- **판정 불변식**: 탭 판정 수 = `chart.notes.length`. 홀드 릴리즈는 `releaseCounts` 로
  분리 집계해 정확도 분모를 흔들지 않는다.
- **홀드 노트 기한**: `holdDeadlineRef` 로 강제 해제 기한을 추적한다. 놓치면 레인이
  잠기고 정확도가 오염되던 버그를 막는다.
- **MISS 스캔 커서**: 노트가 시간 오름차순이라는 불변식 위에서 앞으로만 훑는다.
  매 프레임 `chart.notes` 전량을 순회하지 않는다. 채보 교체 시 커서를 되돌린다.
- **DDA**: 연속 미스 / 정확도로 판정 윈도우와 피해량을 자동 조절한다 (`game.helper` 배지).
- **일시정지**: `AudioContext.suspend()` 로 곡 타임라인을 보존한 채 멈춘다.
- **신기록 판정**: 결과 화면은 갱신 **후** 최고점이 아니라 갱신 **전** 값으로 비교한다
  (`progressStore.lastRunNewRecord`). 최고점과 동점이면 신기록이 아니다.
- **오디오 지연 보정**: 블루투스 헤드폰은 120~250ms 늦게 소리를 들려준다.
  보정값은 **판정에만** 적용한다 (노트 위치는 실제 오디오를 따른다).
  결과 화면의 타이밍 히스토그램이 평균 오차를 보여주고, 표본이 충분하면
  추천 오프셋을 원클릭으로 적용한다.

## 진행 문서

코드 분석 결과와 개선 작업 진행 상황은 [`state.md`](./state.md) 에 기록되어 있습니다.

## 자산

`public/` — 스테이지 트랙 6종(MP3), 사죄 음성 6종(WAV), 배경 이미지, PWA 아이콘.
오디오는 서비스워커 `CacheFirst` 런타임 캐시(설치 시 precache 하지 않음).
