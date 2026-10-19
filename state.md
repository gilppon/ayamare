# SUMIMASEN! — 코드 분석 & 개선 작업 상태

> 작업 진행 문서. 각 단계 완료 시 갱신.
> 마지막 갱신: **2026-10-16 (진행 중)**

---

## 0. 프로젝트 요약

| 항목 | 값 |
|---|---|
| 스택 | React 19.2 + Vite 7.3 + Tailwind 4.1 + Zustand 5 + TS 5.9 |
| 규모 | 프로덕션 6,543줄 / 테스트 426줄 (10 파일, 46 케이스) |
| 테스트 | `vitest run` — 46/46 통과 |
| 타입체크 | `tsc --noEmit` — 통과 |
| 검증 명령 | `npm run verify` (= typecheck + lint + test) · `npm run build` |

> 최종 상태: **발견 31건 중 28건 해결**, 회귀 테스트 46 → **174건**, `npm run verify` 원클릭
> PWA 설치 용량 10MB → **1.08MB** · `GameScreen.tsx` 1,633 → **약 900줄** · lint 0/0

**핵심 파일**
- `src/components/GameScreen.tsx` — 1,254줄 (게임 루프 + 렌더 + 입력 + 판정 + 연출 전부 혼재)
- `src/game/audio.ts` — 절차 그루브 + MP3 트랙 하이브리드 엔진
- `src/game/chart.ts` — 5스테이지 채보 정의 (518 셀)
- `src/game/visibility.ts` — 노트 가시성 + 입력 대상 선택 (순수함수, 잘 분리됨)

---

## 1. 진행 추적 테이블

### P0 — 크리티컬 (플레이 코어 파괴)
| ID | 항목 | 파일 | 상태 |
|---|---|---|---|
| B-01 | 홀드 노트 키 놓치면 레인 영구 잠금 + 정확도 오염 | `GameScreen.tsx:666, 950` | ✅ |
| B-02 | `speedUp` 기믹이 정반대로 동작 (판정선 직전 정지) | `GameScreen.tsx:936-944` | ✅ |
| B-03 | 절차 그루브 64마디 이후 AudioContext 노드 폭발 | `audio.ts:300-313` | ✅ |
| B-05 | `package.json`에 `vite-plugin-pwa` 누락 → `npm ci` 실패 | `package.json` | ✅ |
| B-06 | AudioContext/인터벌 언마운트 누수 | `GameScreen.tsx` | ✅ |

### P1 — 런 품질
| ID | 항목 | 파일 | 상태 |
|---|---|---|---|
| B-04 | 게임 중 언어 변경 시 런 상태 붕괴 | `GameScreen.tsx:132,184,606` | ✅ |
| B-07 | 멀티터치 `pointerId` 미추적 → 레인 상태 오염 | `GameScreen.tsx:587` | ✅ |
| B-08 | 홀드 릴리즈 판정에 페널티 0 (스팟 익스플로잇) | `GameScreen.tsx:494` | ✅ |
| B-09 | 에디터 자동채보 8분박자 손실 + 노트 유실 | `ChartEditor.tsx:110` | ✅ |
| B-10 | `stageId` 이중 소스 (재도전 시 stage1로 플레이) | `App.tsx:87` | ✅ |
| A-01 | `playHit()` 데드코드 — 트랙 모드 타격 SFX 없음 | `audio.ts:276` | ✅ |
| B-11 | 히트스톱이 `setNow`·MISS 판정까지 스킵 | `GameScreen.tsx:652` | ✅ |
| U-01 | 일시정지(Pause) 부재 — `Escape`로 즉시 런 파괴 | `GameScreen.tsx:608` | ✅ |
| U-02 | 포커스 이탈 시 진행 (visibilitychange 미처리) | — | ✅ |

### P2 — 성능 / 자산 / 비주얼
| ID | 항목 | 파일 | 상태 |
|---|---|---|---|
| P-01 | 60fps 풀 리렌더 + SVG 100+ path 매 프레임 diff | `GameScreen.tsx:658,874` | ✅ |
| P-02 | PWA 프리캐시 ≈ 10MB | `vite.config.ts` | ✅ |
| I-01 | `bg.jpg`(1376×768)를 1024×1024 아이콘으로 선언 | `vite.config.ts:38-43` | ✅ |
| I-05 | 판정선 리시버 부재 (전역 2px 라인뿐) | `GameScreen.tsx:1019` | ✅ |
| I-04 | 노트 라벨 대비 하드코딩 (`#0b0f19`) | `GameScreen.tsx:968` | ✅ |
| E-01 | ErrorBoundary 부재 — 예외 1개로 전체 흰 화면 | `App.tsx` | ✅ |
| B-12 | `detectPeaks` 샘플 위상 앨리어싱 — 일부 트랜지언트 누락 (신규 발견) | `autoChart.ts:73` | ✅ |
| U-12 | 에디터: 홀드/기믹 편집·보존 불가 | `ChartEditor.tsx` | ✅ |
| U-13 | `download()` 직후 `revokeObjectURL` | `ChartEditor.tsx:100` | ✅ |
| I-02 | 스테이지별 배경 테마 없음 (단일 이미지) | `GameScreen.tsx:797` | ✅ |
| U-03 | 기믹 예고 큐 부재 | `GameScreen.tsx:930` | ✅ |
| U-04 | 판정 결과 `aria-live` 부재 | `GameScreen.tsx:1030` | ✅ |
| U-05 | 레인 버튼 ARIA 라벨 부재 | `GameScreen.tsx:1092` | ✅ |
| U-06 | i18n 누락 (`"Live SNS"`, 고정 해시태그) | `HUD.tsx:119` | ✅ |

### P3 — 완성도
| ID | 항목 | 파일 | 상태 |
|---|---|---|---|
| U-08 | 결과 화면: 신기록 배지 / 판정 분포 시각화 | `ResultsScreen.tsx` | ✅ |
| U-03 | 기믹(`invisible`) 예고 큐 부재 | `GameScreen.tsx:930` | ✅ |
| U-04 | 판정 결과 `aria-live` 부재 | `GameScreen.tsx:1030` | ✅ |
| U-05 | 레인 버튼 ARIA 라벨·`role="application"` 부재 | `GameScreen.tsx:1092` | ✅ |
| U-06 | i18n 누락 (`"Live SNS"`, 한국어 해시태그 고정) | `HUD.tsx:119` | ✅ |
| I-02 | 스테이지별 배경 테마 없음 (단일 이미지) | `GameScreen.tsx:797` | ✅ |
| U-07 | 가상 화폐 2종 — `capital`(¥)은 어디에도 지출되지 않음 | `App.tsx:92` | ✅ |
| B-13 | 표본 없이 호평 꼬리 부착 — 매 런 첫 질문이 "기세 좋다" 로 끝남 (신규 발견) | `journalistAI.ts` | ✅ |

### P4 — 정리 / 데드 코드
| ID | 항목 | 상태 |
|---|---|---|
| Q-01 | `castNextQuestion` / `scoreFor` / `voiceBankSize` / `JOURNALISTS[*].name` / `LANES[*].name` 데드 제거 | ✅ |
| Q-02 | `GameScreen.tsx` 모듈 분할 (`useGameLoop` / `NoteField` / `GameHud`) | ✅ (완료) |
| Q-03 | `package.json` name 정리 / README 작성 | ✅ |
| Q-04 | ESLint 도입 + `react-hooks` 규칙 실제 적용 | ✅ |
| Q-05 | `GameScreen` 게임 루프/판정 → 훅 분리 | ✅ |
| Q-06 | 통합 테스트 (RTL + jsdom) 도입 | ✅ |
| I-06 | "슬로모"가 이름과 달리 시각 시간 왜곡이 없음 | ✅ |
| I-07 | 이펙트 과잉 / `reduceMotion` 시 정보 소실 | ✅ |
| I-09 | 이모지 의존 UI (AngerMeter) | ✅ |
| B-16 | 일시정지 중 Escape 가 재개가 아니라 **종료** (신규 발견) | ✅ |
| I-04b | `readableOn` 휘도 임계값 오류 (보라 노트 대비 2.6) | `constants.ts` | ✅ |

---

## 2. 발견된 버그 상세 (수정 시 참고)

### 🔴 B-01 — 홀드 노트 상태 머신 구멍
`handlePress`(`:485`)가 홀드 노트를 `"holding"`으로 바꾸지만, MISS 루프(`:666`)는
`noteStateRef.get(n.id) !== "pending"`이면 continue → **holding 노트는 영원히 미해결**.

부작용 3중:
1. `onLanePress`(`:594`)가 `holdLaneRef.has(lane)`에서 early-return → **레인 영구 잠금**
2. `finish()`의 `total = chart.notes.length` 기준 정확도 붕괴
3. `allPerfect`(SECRET ENDING) 구조적 불가능

→ **해법**: `holdDeadlineRef` 도입. `n.time + n.hold + HOLD_GRACE` 초과 시 강제 MISS +
`holdLaneRef`/`holdPressRef`에서 해당 레인 제거.

### 🔴 B-02 — speedUp 기믹 역행
```js
const ratio = Math.pow(d, 1.6);   // 0<d<1 에서 d보다 작음
y = hitLineY - ratio * speed;
```
`d^1.6 < d` → 마지막 1초에 노트가 **판정선에 거의 정지**(d=0.2 → 7.6% 지점).
"가속"이 아니라 감속. 리듬게임에서 판정선 직전 정지는 치명적.

→ **해법**: 지수 반전(`Math.pow(d, 0.55)`)로 마지막 구간을 정방향 가속 곡선으로.

### 🔴 B-03 — crash() 무한 루프
```js
while (this.nextBarTime < ahead && this.nextBarIndex < MAX_BARS) {...}
if (this.nextBarIndex >= MAX_BARS) { this.crash(...) }   // ← 25ms마다
```
118초(64마디) 이후부터 초당 40회 `crash()` → AudioNode 폭발. MP3 로드 실패 시 즉시 발화.

→ **해법**: `private crashed = false` 플래그, 1회만.

### 🔴 B-05 — 의존성 매니페스트 불일치
```
MISSING from package.json: [ 'vite-plugin-pwa' ]
```
`vite.config.ts:7`이 import → 신규 환경 `npm ci` 즉시 실패.

### 🔴 B-06 — 언마운트 cleanup 부재
`GameScreen`에 `audioRef.current?.stop()` cleanup effect 없음.
- StrictMode 더블 마운트 시 AudioContext + `setInterval(25ms)` 잔존
- `startGame()`의 `await ensureVoiceBank()` 대기 중 `quit()`하면 quit **이후**에 컨텍스트 생성
- `loadTrack()` 중 `stop()` → 닫힌 컨텍스트에 좀비 타이머

### 🟠 B-08 — 홀드 릴리즈 무페널티
`handleRelease`(`:494-526`)가 `countsRef`/`ddaRef`/분노/주가 미갱신. BAD 릴리즈가
**150P 지급 + 페널티 0**. chart 전체 40개 홀드 노트가 이 구멍 통과.

### 🟠 B-09 — 에디터 8분박자 손실
`ChartEditor.tsx:110` `Math.round(n.time / beat)` → 2.5박이 3박으로. 인접 노트와
충돌해 `Set`에서 조용히 삭제. `autoChart.ts`는 `step = beat/2`로 양자화하므로
**자동채보 2단계가 매번 망가짐**.

### 🟠 B-10 — stageId 이중 소스
`App.tsx:87` `custom:${customChart.title}` vs `startGame` 내부 `custom:${Date.now()}`.
커스텀 결과 화면 "다시 도전"(`:104`) → `setCustomChart(null)` → stage1 채보로 플레이,
기록은 `custom`으로 누적.

### 🟡 A-01 — 타격 SFX 부재
`playHit()` 호출처 0 → 펜타토닉 상승 사운드 + `sfxPluck`/`sfxThud`/`sfxNoiseBurst`
(~70줄) 전부 죽음. 트랙 모드에서 타격감이 음성(스로틀 800ms)에만 의존.

---

## 3. 작업 로그

### 세션 1 — 분석 (완료)
- 전체 43파일 정독. `tsc --noEmit` 통과, `vitest run` 46/46 통과 확인.
- 위 표의 28개 항목 도출 (B 10 / A 1 / P 2 / I 4 / U 6 / E 1 / Q 3).

### 세션 2 — P0 수정 (완료 ✅)

**B-01 홀드 강제 해제** — `GameScreen.tsx`
- `holdDeadlineRef: Map<noteId, deadline>` 도입 (lane 맵과 분리해 lane 역추적 없이 정리)
- `sweepForcedReleases(t)` 를 RAF 루프의 MISS 스캔 직후에 호출
- 기한 = `note.time + note.hold + grace`, `grace = max(0.35, bad*2/1000 + 0.05)`
  → `judgeRelease` 이 GOOD 을 허용하는 최대 오차보다 항상 커야 판정 모순이 없다
- 강제 해제 시 `holdLaneRef`/`holdPressRef`/`holdDeadlineRef` 3종을 함께 정리해 **레인 잠금 해소**
- 상태는 `"hit"` (탭 판정은 이미 끝났으므로 MISS 아님) + `applyRelease(note, "BAD", true)`

**B-08 릴리즈 페널티** — `applyRelease(note, judgment, forced?)` 단일 진입점 신설
- 기존 `handleRelease` 과 강제 해제 경로가 **둘 다** 여기를 통과
- 스코어에 **콤보 배율** 적용 (기존 0.5 고정 배율 버그 해소)
- DDA·분노·주가·햅틱·버즈 + 실패 시 `game.holdEarly` 멘트 실제 부착
- `releaseCountsRef` 로 탭 판정과 **분리 집계** → `total = notes.length` 불변식 보존
- `GameResult` 에 `releaseCounts` / `forcedReleases` 추가 (`types.ts`)

**B-02 speedUp 곡선 반전** — `visibility.ts` 로 순수함수 이관
- `SPEEDUP_EXPONENT = 0.55` (기존 `1.6` → 정반대 의미였음)
- `noteFallY(noteTime, now, hitLineY, speed)` / `speedUpRemainingRatio(d)` 추출
- `GameScreen` 은 이 순수함수를 호출하도록 변경 (중복 수식 제거)
- **회귀 테스트 4 케이스 추가** (46 → 50)

**B-03 crash() 1회 제한** — `AudioEngine.crashed` 플래그 + `start()` 에서 초기화

**B-05 매니페스트** — `package.json` 에 `vite-plugin-pwa: ^1.3.0` 추가 (lock과 동기화)
  + `name: "sumimasen"`, `version: 0.1.0`

**B-06 언마운트 정리** — `GameScreen`
- `unmountedRef` 도입, `startGame` 의 `await ensureVoiceBank()` / `await audio.start()`
  양쪽에서 취소 검사 (`quit` 대기 중 컨텍스트 생성 방지)
- cleanup effect: `stopVoice()` + `audioRef.current?.stop()` + `audioRef.current = null`
- `quit()` 도 `audioRef.current = null` 로 정리

> 검증: `tsc --noEmit` 통과 · `vitest run` **50/50 통과**

### 세션 3 — P1 수정 (1차 완료 / 2차 진행)

**B-07 멀티터치** — `GameScreen.tsx`
- `activePressLanesRef`: `Set<lane>` → **`Map<pointerId, lane>`**
- `uniqueLanes()` 헬퍼로 중복 제거 후 `setPressedLanes`
- 키보드 입력은 `pointerId = undefined` → 내부적으로 `-1` 키 사용
- 버튼 핸들러: `e.currentTarget.setPointerCapture()` (기존 `e.target` 은 내부 `kbd` 일 수 있음)
- `onPointerLeave` 추가 — 캡처 미지원 환경에서 버튼 밖 이탈 시 놓침 처리
- `onLanePress`/`onLaneRelease` 시그니처에 `pointerId?: number` 추가

**B-04 낡은 클로저 차단** (2중 방어)
- ① `laneHandlersRef` — 키 리스너가 항상 최신 핸들러를 호출 (`deps:[keyMap]` 유지)
- ② `onRunActiveChange` prop — 실제 플레이 중이면 `App` 이 설정 버튼을 **숨김**
- `runActive` 상태에서 `SettingsPanel` 렌더 자체를 차단 + 언마운트 시 자동 닫기

**B-10 stageId 단일 소스** — `App.tsx` 전면 정리
- `GameScreen` 에 `stageId={stageId}` (state 그대로) 전달 → `recordRun` 과 동일 값
- 결과 화면 "다시 도전"이 `customChart` 를 유지하도록 변경
  (이전엔 `setCustomChart(null)` → **stage1 채보로 플레이 + 기록만 custom** 이 되는 불일치)
- `startGame`/`closeGame` 을 `useCallback` 으로 (불필요한 리렌더 제거)

**U-01 일시정지** — `audio.ts` + `GameScreen.tsx`
- `AudioEngine.pause()/resume()` = `ctx.suspend()/resume()`
  → `ctx.currentTime` 이 멈춰 **타임라인을 그대로 보존** (소스 재생성 없이)
- `paused` state + `pausedRef` (RAF hot path 직독)
- `Escape`: ready/done → quit, playing → **일시정지 토글**
- 오버레이(`z-60`): 재개 / 포기하고 나가기 + `role="status" aria-live`
- 좌상단 quit 버튼을 pause + quit 2버튼으로 확장
- i18n 6개 키 × 3언어 추가 (ko/en/ja — i18n 테스트가 동등 검증)

**U-02 포커스 이탈 자동 일시정지** — `visibilitychange` + `blur` 리스너
- 백그라운드 탭에서 `setInterval` 스로틀 + `currentTime` 점프로 복귀 시 대량 MISS 방지

**B-11 히트스톱 분리**
- `setNow(t)` 은 **항상** 갱신 (노트 위치·MISS 판정·질문 진행·finish 검사 전부 곡 타임과 동기)
- 히트스톱 동안에는 `zoomPunch` 감쇠만 멈춰 **피크 고정** → 타격 임팩트 hold 로 체감 유지
- 판정 지연 40~70ms 제거

**A-01 타격 SFX 부활**
- `applyJudgment` / `applyRelease` 에서 `audioRef.playHit(judgment, combo)` 호출
  (기존 중복 `duck()` 호출 제거 — `playHit` 가 judgment 별 타격음+덕킹을 함께 처리)
- `duck()` 개선: 로우패스만 남기면 킥/베이스가 살아 "먹먹"해져 게인도 함께 감소
- **리미터 추가**: `DynamicsCompressor` (threshold -6dB, ratio 12) — 음성 gain 1.25 +
  타격 SFX 동시 발화 시 클리핑 방지

> 검증: `tsc --noEmit` 통과 · `vitest run` **50/50 통과**

### 세션 4 — P1 2차 (완료 ✅)

**B-09 에디터 8분박자 좌표계** — 새 순수 모듈 `src/game/editorChart.ts`
- `SLOTS_PER_BAR = 8` — 마디당 8슬롯(8분박자 단위)이 **정본 좌표**
- `cellKey` / `slotToTime` / `timeToSlot` / `cellsToNotes` / `notesToCells` / `migrateLegacyKeys`
- 왕복 무손실: `셀 → 노트 → 셀` 동일성 보장 (홀드 8분박자 단위 + 기믹 보존)
- `ChartEditor` 는 UI 만 담당하도록 얇아짐 (계산 로직 전부 모듈 이동)
- **레거시 마이그레이션**: 구버전 `"bar:beat:lane"` 4분박자 키 → `beat*2` 슬롯 변환

**U-12 에디터 기능 확장** — 피아노롤 UI
- 마디 블록 × **4레인 행 × 8슬롯 열** 레이아웃 (기존 4×4 그리드)
- 편집 모드 3종: `노트` / `홀드`(1박→2박→3박→해제) / `기믹`(invisible→speedUp→fake→해제)
- 셀 아이콘: `●` 탭 · `H` 홀드 · `◌` 투명 · `»` 가속 · `?` 페이크
- 홀드/기믹 카운트 요약, 제목/질문까지 localStorage 영구 저장
- 홀드 노트에 기믹까지 지정된 셀이 있음을 표기

**U-13 다운로드 취소 방지** — `revokeObjectURL` 을 10초 뒤로 지연

**B-12 `detectPeaks` 위상 앨리어싱 (신규 발견)** — 테스트 작성 중 발견
```js
// 이전: hopSize 512 는 4의 배수 → 모든 창이 j ≡ 0 (mod 4) 인덱스만 샘플링
for (let j = i; j < i + windowSize; j += 4)
```
→ 4로 나누어떨어지지 **않는** 위치의 트랜지언트가 통째로 누락.
창마다 `phase = (i/hopSize|0) % 4` 로 시작 위상을 회전시켜 해결 (비용 ≈ 0).

**회귀 테스트 +9건** (50 → 59)
- `editorChart.test.ts` 신규: 슬롯 커버리지 / 8분박자 뭉개짐 방지 / 왕복 무손실 /
  정렬 불변식 / 마디 경계 / 레거시 마이그레이션 / autoChart 왕복 무손실
- `detectPeaks`: 위상 앨리어싱 회귀 + 다중 트랜지언트

> 검증: `tsc --noEmit` 통과 · `vitest run` **59/59 통과** (11 파일)

---

## 4. 검증 체크리스트

| 시점 | typecheck | vitest | build |
|---|---|---|---|
| 세션1 분석 | ✅ | ✅ 46/46 | — |
| 세션2 P0 | ✅ | ✅ 50/50 | — |
| 세션3 P1-1 | ✅ | ✅ 50/50 | — |
| 세션4 P1-2 | ✅ | ✅ 59/59 | — |
| 세션5 P2 | ✅ | ✅ 63/63 | ✅ precache 1.06MB |
| **세션6 P3+정리 (최종)** | ✅ | ✅ **63/63** | ✅ |

### 세션 5 — P2 (완료 ✅)

**P-01 포즈 회전 React 리렌더 제거**
- `ManagerKimHandle.setPose(angle, dogeza)` — `useImperativeHandle` 로 회전 `<g>` 의
  `transform` 을 **DOM 직접 쓰기**. `EditorialHead/Torso/Legs` 는 한 번만 렌더된다.
- `PlayerCharacter` 는 `angle` prop 을 받던 것 → `kimRef` 핸들만 받음 (memo 유지)
- `dogezaRef` (렌더 중 ref 읽기) → `dogezaPose` **실제 state**. 드물게 바뀔 때만 setState
- `ManagerKim` 은 `ref` 를 일반 prop 으로 받음 (React 19 규약, forwardRef 불필요)

**P-01 visibleNoteWindow 이진 탐색** — `visibility.ts`
- 매 프레임 O(N) `chart.notes.filter()` → `[now-DESPAWN, now+SPAWN]` 구간만 탐색
- 정렬 불변식을 **테스트로 강제** (stage1~5 + daily 전수 검사)

**P-02 PWA 설치 용량 10MB → 1.06MB**
- `globPatterns` 에서 `mp3`/`wav` 제거 → 오디오는 `CacheFirst` 런타임 캐시로 이동
- `AUDIO_FILES` 화이트리스트로 스테이지 트랙/사죄 음성만 캐시 (사용자 업로드 파일 제외)
- `navigateFallbackDenylist` 로 오디오 경로의 SPA 폴백 오탐 차단
- **빌드 실측**: `precache 8 entries (1093.02 KiB)` (이전 ≈ 10,000 KiB)

**I-01 PWA 아이콘 정정** — `public/icon-512.svg` 신규 제작
- `bg.jpg`(1376×768)를 `1024×1024` 로 선언하던 오류 제거
- 정사각 512 SVG 아이콘 (사과 인물 + 마이크 + 헤드라인 바), maskable 변형 지정

**I-05 레인별 리시버 바** — 판정선 전역 2px 라인 → 레인마다 리시버 바
- 눌리면 해당 레인 색으로 점등 + 내부 글로우, 홀드 진행 표시 추가

**I-04 노트 라벨 자동 대비** — `readableOn(hex)` (WCAG 상대 휘도)
- 하드코딩 `#0b0f19` 제거 → 분홍/보라 노트의 가독성 저하 해소

**I-02 스테이지별 테마** — `STAGE_THEMES` / `themeForStage()`
- 6종 테마 (stage1 다크블루 ~ stage5 레드), 배경 그라디언트 + 액센트 조명 + 콤보 비네트

**E-01 ErrorBoundary** — `src/components/ErrorBoundary.tsx` 신규
- `GameScreen` / `ResultsScreen` 경계 분리, 스택 표시 + 다시 시도/새로고침

### 세션 6 — P3 + 정리 (완료 ✅)

**U-08 결과 화면 강화**
- **신기록 배지** — `bestByStage` 비교
- **판정 분포 바** — 탭 판정 합계 기준 100% 스택 막대
- **홀드 릴리즈 통계** — `releaseCounts` 별도 섹션 + **놓친 손똉이 경고**
- `STAGE` 표기를 `stageLabel()` 로 정규화 — `custom:<타임스탬프>` 내부 ID 노출 방지

**U-03 기믹 예고 큐** — `telegraphedLanes`
- `invisible` 은 페이드 직전, 나머지는 스폰 직전에 레인 상단 경고 (라벨 + urgency 불투명도)

**U-04 접근성** — `role="status" aria-live` 별도 live region + 레인 버튼 `aria-label`/`aria-pressed`

**U-06 i18n** — `hud.live` / `res.shareTag` 3언어 추가, 중복 표현 정리

**U-07 가상 화폐 2종 정리** — `capital`(¥) 제거 (지출처 없는 잔재 화폐)

**Q-01 데드 코드 제거** — `scoreFor` / `castNextQuestion` / `voiceBankSize` /
`JOURNALISTS[*].name` / `LANES[*].name`

**B-13 근거 없는 호평 꼬리 (신규 발견, 테스트가 잡음)**
`PressContext.accuracy` 는 미플레이 시 `1` 이므로 `accuracy >= 0.9` 가 **항상 참** →
매 런 첫 질문부터 "…기세가 좋으시네요" 가 붙었다.
→ `PressContext.judged`(표본 수) + `PRAISE_MIN_SAMPLE = 8` 게이트.

**Q-03 README 작성** — 구조 / 실행 / 설계 불변식 문서화

---

## 7. 세션 7 — Q-02 모듈 분할 + Q-04 ESLint (완료 ✅)

### Phase A — 순수 로직 추출: `game/noteLayout.ts` (신규)
JSX 안에 인라인돼 있던 **Y좌표·테일·투명도·색상·폰트** 산출을 순수함수로 이관.
`layoutNote` / `layoutReceiver` / `hitLinePulse` / `telegraphsFor` + 상수(`MISS_BG` 등).

→ **B-02 정합성 보장**: 렌더가 `noteFallY`(속도 모듈)를 쓰는지 테스트가 직접 검증.
→ 리드타임 중복 정의 제거 (`NoteField` 가 `visibility.LEAD_TIME` 을 단일 소스로 사용).

### Phase B/C — 프레젠테이션 분리 (Q-02)
| 신규 파일 | 담당 | GameScreen 감축 |
|---|---|---|
| `components/game/NoteField.tsx` (280줄) | 레인 / 노트 / 리시버 / 예고 / 판정선 / 팝업 / 스파크 / 쇼크웨이브 | 254줄 → 22줄 |
| `components/game/GameHud.tsx` | `TopHud` · `SidePanels` · `LaneKeys` · `ReporterSlot` · `ReactionLine` · `CameraFlashes` | ~130줄 |
| `components/game/Overlays.tsx` | `CountdownOverlay` · `ReadyOverlay` · `DoneOverlay` · `PauseOverlay` · `LiveJudgment` | ~90줄 |
| `game/keyLabel.ts` | `keyLabelFor` (react-refresh 규칙 때문에 컴포넌트 파일에서 분리) | — |

**GameScreen.tsx: 1,633줄 → 1,114줄** (프레젠테이션 제거, 게임 루프·판정만 남음)
`memo` 를 유지하기 위해 `stateOf` 는 `useCallback(…, [])` 안정 콜백으로 전달.

### Phase E/F — Q-04 ESLint 도입
`eslint@9` flat config + `typescript-eslint` + `react-hooks` + `react-refresh`.
`lint` / `verify` 스크립트 추가 (`typecheck && lint && test`).

**설정 함정 발견**: `reactHooks.configs.recommended.rules` 가 이 설정 형태에서는
**빈 객체**로 spread 되어 `exhaustive-deps` 가 조용히 비활성화되어 있었다.
규칙 이름을 **명시**해야 실제로 켜진다. 임시 프로브 파일로 동작을 확인한 뒤
프로덕션 코드에 경고가 4건 surfaced → 전부 실제 버그였다:

| 경고 | 실제 문제 |
|---|---|
| `dda.windowBoost` 불필요 의존성 | deps 가 state 를, 본문이 `ddaRef.current` 를 읽는 혼합 상태 → 정리 |
| 키 리스너에 `quit`/`togglePause` 누락 | Escape 가 **1차 렌더의 클로저**를 호출 |
| 루프에 `timingWindows` 등 11개 누락 | **B-14 — 실버그** (아래) |
| `BOW_LOOP.length` | 렌더마다 배열 재생성 → 모듈 상수로 이동 |

### B-14 — DDA 어시스트가 MISS 판정에 반영되지 않던 버그 (신규 발견)
```js
useEffect(() => { /* RAF loop */ }, []);   // 1회만 설치
// 루프가 닫는 timingWindows = 게임 시작 시점 값
// → 탭 판정(handlePress)만 DDA 부스트를 보고,
//    MISS 판정(missWindowSec)과 강제 해제(sweepForcedReleases)는 초기값 고정
```
→ 어시스트 모드가 **반쪽짜리**였다 (누르면 관대하게, 놓치면 엄격하게).
설정 잠금(B-04)으로 언어가 안 바뀌므로 드러나지 않았던 잠재 버그.

**해법**: `loopCtxRef` 에 값 **과 콜백을 모두** 담아 루프가 오직 ref 만 읽게 한다.
`deps: []` 는 유지되면서 값은 항상 최신이며 **eslint-disable 없이** 린트가 깨끗하다.

동일 계열로 키 리스너도 `laneHandlersRef` 에 `togglePause`/`quit` 을 담아
Escape 경로의 stale closure 도 제거 (B-15).

### I-04b — `readableOn` 휘도 임계값 오류 (테스트가 잡음)
임계값을 `0.42` 로 잡아 **보라 계열(#c084fc, #b388ff)에 흰 글자**를 씌우고 있었다.
실제 WCAG 교차점은 `(L+0.05)² > 1.05×0.05` → **L > 0.179** 이다.
→ 보라 노트 라벨 대비가 **2.6 : 1 → 8.0 : 1** 로 개선 (WCAG AA 4.5 충족).
`contrastRatio()` 헬퍼를 내보내 전 레인 팔레트 AA达标를 테스트로 고정.

---

## 8. 최종 검증

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **91/91** (12 파일) |
| `npm run build` | ✅ precache 1.07MB |
| `npm run verify` | ✅ 위 3종 일괄 |

> 테스트: 46 → **91건** (+45). 프로덕션 LOC 6,543 → 8,023 (테스트 가능 로직 분리분 포함).

---

## 11. 세션 8 — Q-05 훅 분리 + Q-06 통합 테스트 (완료 ✅)

### Phase A — `useStageEffects` (연출 상태)
팝업 / 플래시 / 스파크 / 쇼크웨이브 / 슬로모 / 리액션 / SNS / 줌펀치 / 히트스톱의
상태와 헬퍼를 게임 상태와 분리. 상한(`CAP_*`)과 수명(`TTL_*`) 튜닝 값이 한곳에 모인다.

**부수 수정 — 플래시 상한 버그**: 기존 `setFlashes(f => [...f.slice(-12), item])` 은
잘라낸 뒤 개수를 더해 상한이 잠시 **18** 까지 찼다. `batch` 를 먼저 만들어 한 번에 자른다.

### Phase B — `useLaneInput` (입력 계층)
포인터 ID 추적(B-07) · 키맵/IME 폴백 · Escape 처리(B-15) · 0.5초 입력 유예를 소유.
`LaneKeys` 컴포넌트와 `GameScreen` 사이의 유일한 경계가 이 훅의 반환값.

### Phase C — `useGameLoop` (프레임 드리빙)
RAF 루프 전체. `deps: []` 인 루프가 stale closure 를 갖지 않도록
**값과 콜백을 `ctxRef` 로만 읽는다** (B-14). 포즈 스프링 상수도 여기로 이동.

`GameScreen.tsx`: 1,114 → **928줄** (원본 1,633줄 대비 **-43%**)

### Phase D — `GameScreen` 정리에 드러난 부수 정리
- `ACTION_RANK` / `ANGLE_MAP` / `deeper` 중복 정의 제거 (루프 훅으로 단일화)
- `setQuestion` 을 루프 컨텍스트에 직접 넣으면 `exhaustive-deps` 가
  "무한 업데이트 경고"를 낸다. 상태 세터가 아닌 **안정적 콜백**
  (`applyQuestionFromLoop`) 으로 경계를 명시해 거짓양성을 제거했다.

---

## 12. Q-06 — 통합 테스트 도입

`vitest.config.ts` + `src/test/setup.ts` (jsdom + AudioContext/matchMedia/RAF 스텁).

**기존 91건 전부 jsdom 환경에서 그대로 통과** — 순수 로직 테스트가 깨지지 않음을 확인.

| 신규 테스트 | 건수 | 커버 |
|---|---|---|
| `useLaneInput.test.ts` | 16 | 입력 유예 · B-07 멀티터치 · 키맵/IME · Escape · B-15 최신 핸들러 |
| `useGameLoop.test.ts` | 17 | **B-14 회귀 3건** · 워프 가드 · fake 제외 · B-01 스윕 · B-11 히트스톱 · 포즈 스프링 |
| `useStageEffects.test.ts` | 14 | 상한/수명 · **플래시 상한 버그 회귀** · 모션 감소 게이트 |

### B-14 회귀 테스트 (가장 중요)
```
1. 좁은 윈도우 → 기준 시각 지나면 MISS 발생
2. 같은 프레임에 윈도우 부스트 → MISS 가 늦어진다 (관대해짐)   ← 이전 구현에선 실패
3. 부스트된 윈도우가 지나면 그때서야 MISS
```
2번이 **루프가 ctxRef 최신값을 읽어야만 성립**하므로, 회귀가 정확히 고정된다.

> 작성 중 테스트 하네스에서 또 하나의 함정을 발견했다:
> `{ ...sink }` 스레드로 싱크를 넘기면 `songTime` 이 **렌더 시점에 복사**되어
> 루프가 초기값을 계속 본다. 실제 코드에서는 `songTime` 이 컴포넌트 내부 함수라
> 문제가 없었지만, "싱크는 스프레드하지 않는다" 는 원칙을 테스트가 가르쳐 준 셈이다.

---

## 13. 최종 검증 (세션 8)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **138/138** (15 파일) |
| `npm run build` | ✅ precache 1.07MB |

> 테스트: 46(초기) → 91(세션7) → **138(세션8)**
> `GameScreen.tsx`: 1,633 → **928줄**

---

## 15. 세션 9 — 비주얼/연출 + 스모크 테스트 (완료 ✅)

### I-07 — 이펙트 과잉 & 모션 감소 시 정보 소실
기존엔 판정별 분기가 `GameScreen` 안에서 하드코딩돼 있었고, `reduceMotion` 한 줄로
**스파크/쇼크웨이브/히트스톱/줌이 전부 사라져** 팝업만 남았다. 과잉과 접근성이
한 줄의 `if` 로 묶여 있던 상태.

**신규 `src/game/feedback.ts` (순수함수)** — `planFeedback(judgment, isDogeza, reduceMotion)`
- **강도 등급** `none → light → medium → heavy → climax` (도게자 PERFECT = climax)
- **채널 분리**: 모션(플래시/스파크/셰이크/줌/히트스톱) vs 비모션(팝업/정지링/햅틱)
- 모션 감소 모드 → 모션 채널 전부 0 + **`solidRing` 대체 피드백** (색·투명도만 변함)
- 파티클 상한 10개로 시각 노이즈 억제

**`useStageEffects.applyPlan()`** — 계획 실행만 하는 단일 진입점.
`applyJudgment`/`applyRelease` 은 이제 (1) 판정 상태 (2) 소셜 반응 (3) `applyPlan` 만 한다.
릴리즈는 탭의 **절반 강도**로 깎아 "보조 판정"임을 표현한다.

**`solidRing`** — 위치가 변하지 않고 색·투명도만 바뀌는 링. `solid-ring-fade` 키프레임 추가.
모션 감소 모드에서 **정보는 유지하면서 움직임만 제거**한다.

### I-06 — 슬로모가 실제로 시간을 늦춘다
기존 `triggerSlowmo` 는 **텍스트 오버레이만** 띄우고 시간은 전혀 왜곡하지 않았다.

**`advanceSlowmo(visual, audio, active, dt)` (순수함수)** — 표시 시각만 지연
- **판정에는 절대 쓰지 않는다.** MISS 판정·입력 타이밍은 계속 오디오 시간(`t`)을 쓴다
- `SLOWMO_MAX_LAG_SEC = 0.12` — 지연이 상한에서 **포화**된다
  (≈200ms 느리다 정속으로 따라잡는다)

> 1차 설계는 `MAX_CATCHUP_SEC` 상수로 따라잡게 했는데, 테스트가 그 상한이
> 슬로모를 **무력화**한다(0.1초 만에 0.6초 따라잡아버림)를 잡아냈습니다. 지연 상한 방식으로 재설계.

### I-09 — AngerMeter 이모지 → 디스크리트 pip
`"🔥".repeat(n)` 을 `ANGER_STEPS = 5` 고정 pip 으로 교체 (`angerPips`/`angerColor` 순수함수).
게이지에 `role="meter"` + `aria-valuenow` 추가.

### 미션 `singlePerfect` 채우기
`singlePerfectBest` 는 추적만 되던 채 미션이 없어 항상 0. **`runAllPerfect`** 미션 신설
(단일 런 PERFECT 30개, 3언어 텍스트).

### GameScreen 스모크 테스트 + B-16 발견
대기 → 시작 → 일시정지 → 재개 → 종료 → 언마운트 전체 배선을 RTL 로 검증 (10건).

> 테스트가 실제 버그를 잡았다 — **일시정지 중 Escape 를 누르면 "재개" 가 아니라
> "포기하고 나가기" 가 실행**됐다. `useLaneInput` 이 Escape 경로를 `isPlaying` 으로
> 판정하는데, 일시정지 중에는 그 값이 false 기 때문이다. 즉 U-01 일시정지 도입 당시부터
> 있던 버그였고 단위 테스트로는 잡히지 않았다.
> → `canTogglePause` 별도 판별자 도입 (phase === "playing").

---

## 16. 최종 검증 (세션 9)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **174/174** (18 파일) |
| `npm run build` | ✅ precache 1.08MB |

> 테스트: 46(초기) → 91 → 138 → **174**
> `GameScreen.tsx`: 1,633 → **약 900줄**

---

## 17. 남은 작업 (세션 9 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| P-03 | 노트 필드 Canvas 렌더 전환 — 남은 프레임 비용 대부분. 규모 크고 회귀 위험 | 중 |
| — | `NoteField`/`GameHud`/`Overlays` 렌더 스냅샷 테스트 (회귀 안전망) | 중 |
| — | `ResultsScreen` RTL 테스트 (신기록 배지 · 판정 분포 바) | 하 |
| — | `TitleScreen` RTL 테스트 (탭 전환 · 스킬 구매) | 하 |
| — | 오디오 스텁 고도화 — 실제 버퍼 길이/루프 경계 시뮬레이션 | 하 |

---

## 10. 회귀 테스트 목록 (신규 45건)

| 파일 | 케이스 |
|---|---|
| `visibility.test.ts` | speedUp 곡선 4건(B-02) · visibleNoteWindow 4건(전수 필터 동치 / 폭 / **정렬 불변식** / 경계) |
| `editorChart.test.ts` | 슬롯 커버리지 · 8분박자 뭉개짐 방지(B-09) · 왕복 무손실 · 정렬 · 마디 경계 · 레거시 마이그레이션 · autoChart 왕복(B-09) · detectPeaks 2건(B-12) |
| `noteLayout.test.ts` | layoutNote 13건(속도/투명/가짜/미스/holding/테일/폰트) · readableOn 5건(**I-04b 회귀**) · layoutReceiver · hitLinePulse · telegraphsFor 6건 |
| `journalistAI.test.ts` | 표본 게이트(B-13) 1건 |
| `dda.test.ts` | 윈도우 부스트 전파 4건(**B-14 회귀**) + 기존 4건 유지 |

> **주의**: B-12 / B-13 / B-14 / I-04b / B-16 은 테스트 작성·lint 도입 과정에서 발견된 버그다.
> 기존 테스트는 이 경로들을 아예 덮고 있지 않았다. 특히 **B-16 은 U-01 일시정지 도입
> 시점에 이미 존재했으나**, 컴포넌트 통합 테스트가 없으면 드러나지 않는다.

---

## 18. 세션 10 — 프레젠테이션 계층 RTL 테스트 (신규 127건)

전 화면 DOM 을 jsdom 으로 렌더해 인터랙션을 검증한다. 로직 테스트와 달리
*i18n 배선·클릭 반영·상태 구독* 이 깨지는 지점을 잡는다.

| 파일 | 건수 | 커버 |
|---|---|---|
| `components/game/NoteField.test.tsx` | 23 | 리시버·기믹 예고·판정 팝업·홀드·가짜 노트 |
| `components/game/GameHud.test.tsx` | 22 | 사이드 패널·레인 키 라벨·반응 게이지·일시정지 버튼 |
| `components/game/Overlays.test.tsx` | 17 | 카운트다운·대기·일시정지·종료 오버레이 |
| `components/ResultsScreen.test.tsx` | 21 | 신기록 배지·판정 분포 바·Web Share(U-08)·미션 수령 |
| `components/TitleScreen.test.tsx` | 22 | 탭 4종·상점 구매/장착/해제·미션 진행도·기록 탭·김부장 이스터에그·en/ja |
| `components/EditorAndArt.test.tsx` | 22 | `StockPanel`·`AngerMeter`(I-09)·`SnsFeed`(U-06)·`ManagerKim`(P-01)·`PlayerCharacter`·`ChartEditor`(B-09 왕복) |

### 테스트에서 발견한 실제 결함

| ID | 내용 | 조치 |
|---|---|---|
| T-01 | `progressStore` 가 IndexedDB persist 를 쓰므로 **마운트 뒤 비동기 재하이드레이션이 테스트의 `setState` 를 덮어씀** → 스트릭 배지·기록 탭이 빈 값으로 렌더 | `src/test/setup.ts` 에서 persist storage 를 no-op 으로 교체 + 스토어 전량 리셋 `beforeEach` |
| T-02 | `tab.click()` 은 `act()` 밖이라 React 19 업데이트가 반영되지 않음. 탭 전환·구매·장착 전부 무반응 | 전량 `fireEvent.click` 로 교체 |
| T-03 | 스트릭 배지 텍스트는 `🔥7` 이므로 `getByText("7")` 이 매칭 안 됨 | 정규식 매처 + 라벨 키 검증으로 교체 |

### 테스트 작성 원칙 (한글 리터럴 금지)

한글 문자열을 테스트에 직접 타이핑하면 **코드포인트가 어긋나**(예: `기록`(U+AE30 U+B85D)이
`각록`(U+AE10 U+B85D)으로) 사전을 수정하지도 않은 앱이 깨진 것처럼 보이는 오탐이 발생했다.
`tr("ko", key)` 로 기대값을 가져오도록 바꿔 이 문제군을 구조적으로 제거했다. 부수적으로
**사전 키가 실제 화면에 배선돼 있는가** 까지 검증된다.

## 19. 최종 검증 (세션 10)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **301/301** (24 파일) |
| `npm run build` | ✅ precache **1,102.36 KiB** |

> 테스트: 46(초기) → 91 → 138 → 174 → **301**
> `GameScreen.tsx`: 1,633 → **약 900줄**

## 20. 남은 작업 (세션 10 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| P-03 | ~~노트 필드 Canvas 렌더 전환~~ → **폐기**. P-05 로 목적 달성 (아래 21절) | — |
| — | ~~오디오 스텁 고도화~~ → 완료 (23절) | — |
| — | ~~`App.tsx` 라우팅·부팅 통합 테스트~~ → 완료 (22절) | — |
| — | E2E(Playwright) — 실제 브라우저 WebAudio/WebGL 검증 | 하 |
| — | `GameScreen` 훅(`useGameLoop`/`useLaneInput`/`useStageEffects`) 단위 테스트 | 중 |

---

## 21. 세션 11 — P-04 / P-05 렌더 파이프라인 개편

### 21.1 측정 (`game/notePerf.test.tsx`)

`visibleNoteWindow` 안 노트 수를 20/40/80/160으로 늘리며 **프레임당 React 조정 비용**을 잰다.
워밍업 1회 후 5회 반복 중앙값(jsdom 타이머 노이즈가 커서 최소값보다 중앙값이 안정적).

| 노트 | DOM 요소 | 조정 비용 (기준 `top`) | 조정 비용 (P-05) |
|---|---|---|---|
| 20 | 58 | 0.74 ms | 0.79 ms |
| 40 | 102 | 1.49 ms | 0.64 ms |
| 80 | 187 | 2.34 ms | 1.42 ms |
| 160 | 357 | **9.03 ms** | **2.92 ms** |

> **측정 오류 교정**: 최초 단일 실행 측정으로는 "조정 비용이 비선형이라 P-03 불필요"라는
> 반론을 냈으나, 반복 측정 결과 160노트에서 **9ms — 프레임 예산(16.7ms)의 54%** 로
> 확인됐다. 단일 실행 측정은 이 프로젝트 jsdom 환경에서 노이즈가 커서 신뢰 불가.

### 21.2 P-04 — `top` → `translate3d` + 레이어 승격

`top` 은 레이아웃 속성이라 프레임마다 재계산을 유발한다. 노트 헤드·테일의 세로 이동을
`transform` 으로 옮기고 `will-change: transform` 을 붙였다. jsdom 은 레이아웃을 하지 않아
JS 비용 차이는 측정 범위 내(±노이즈)이지만, 브라우저에서 레이아웃 무효화는 사라진다.
좌표 문자열은 소수점 1자리로 반올림해 매 프레임 새로 만드는 문자열 길이를 줄였다.

### 21.3 P-05 — 노트 렌더를 React 조정 대상에서 제거

프레임마다 바뀌는 값은 `y`/`tailTop` 뿐인데, 이를 style prop 으로 넘기면 전 노트의 style
객체를 새로 만들어 React 가 160개를 다시 조정한다.

- `NoteRow` 를 `memo` 로 분리하고 **프레임 불변값만** prop 으로 받는다(색·라벨·크기·테일 유무).
- `y`/`tailTop` 은 부모의 `useLayoutEffect` 가 ref 를 통해 `transform` 에 직접 쓴다.
- 노트가 화면에서 벗어나면 핸들 Map 에서 제거(누수 가드 테스트 포함).

→ **160노트 조정 비용 9.03ms → 2.92ms (3.1배, −68%)**

### 21.4 P-03 폐기 근거

Canvas 전면 재작성은 규모 대비 효과가 없다. 조정 비용의 대부분을 제거한 뒤 남는 것은
브라우저 페인트 비용뿐이며, 이는 그림자(`boxShadow`/`textShadow`)를 줄이는 것으로
더 싸게 다룰 수 있다. **P-03 은 폐기한다.**

### 21.5 회귀 안전망 (`NoteField.test.tsx` +3)

| 테스트 | 계약 |
|---|---|
| 세로 위치는 `top` 이 아니라 `transform` | P-04 되돌림 방지 |
| 시간이 흘러도 노트 DOM 은 재사용되고 `transform` 만 갱신 | P-05 되돌림 방지 |
| 노트가 사라지면 핸들이 정리된다 | 메모리 누수 |

---

## 22. 세션 11 — App 라우팅·부팅 통합 테스트 (`src/App.test.tsx`, 11건)

`GameScreen`/`ChartEditor` 는 WebAudio·Canvas 를 타므로 mock 하고, App 자신의 책임만 검증한다.

| 커버 | 내용 |
|---|---|
| 부팅 | 타이틀 진입 · `document.title`/`html[lang]` 언어 동기화 |
| 라우팅 | stageId 전달(**B-10**) · 에디터 왕복 · 커스텀 차트 `custom:*` · 종료→결과 · 포기 |
| 정산 | 종료 시 포인트 지급 + `recordRun` 기록 |
| **B-10 회귀** | 재도전이 **같은 stageId** 를 쓴다 (이전엔 stage1 로 채보) |
| **B-04** | 플레이 중 설정 버튼 사라짐 / 종료 후 복귀 |

> 발견: `act()` 없이 mock 콜백(`onFinish`/`onPlay`)을 부르면 App 의 `setState` 가
> 반영되지 않는다. 게임이 콜백을 호출하는 지점은 테스트에서 `act` 로 감싸야 한다.

---

## 23. 세션 11 — 오디오 스텁 고도화 + `src/game/audio.test.ts` (신규 11건)

`AudioEngine` 은 테스트 커버리지가 **0**이었다. 스텁을 실제 WebAudio 규약에 맞게 고도화했다.

### 23.1 스텁 변경 (`src/test/setup.ts`)

| 항목 | 이전 | 이후 |
|---|---|---|
| `createBuffer` | `duration` 없음 | `length/sampleRate` 로 `duration` 산출 |
| `decodeAudioData` | 항상 길이 1 | **실제 ArrayBuffer 바이트 크기**로 생성 → 테스트가 "트랙 길이"를 지정 |
| `createBufferSource` | 빈 객체 | 루프 구간·시작 오프셋·정지 시각을 기록 |
| `AudioParam` | 빈 함수 | `setValueAtTime` 등 호출 기록 (덕킹/리미터 검증 가능) |

### 23.2 발견한 실제 버그

| ID | 내용 | 조치 |
|---|---|---|
| **B-15** | `trackOffset >= 트랙 길이` 이면 `loopStart >= loopEnd` 가 되어 **브라우저가 루프를 재생하지 않고 트랙이 통째로 무음**이 된다. 기존 스텁은 `duration` 이 `undefined` 라 이 조건을 표현하지 못해 가려져 있었다 | 범위를 벗어난 offset 은 "사용 가능한 트랙 없음"으로 보고 `hasTrack=false` 후 절차 그루브로 폴백 |

### 23.3 커버

신호 체인 · `songStart` 예약(+0.12) · 컨텍스트 재사용(B-05) · 루프 구간 `[offset, duration]` ·
**offset 음수 금지** · 로드 실패 폴백 · 디코드 실패 무크래시 · **B-03 트랙 모드에서 절차 마디 미예약** ·
U-01 `now()`/종료 후 0.

> 스케줄러는 `nextBarTime < ctx.currentTime + 0.12` 인 동안만 마디를 예약한다. 스텁 컨텍스트
> 시각은 가짜 타이머와 독립이므로 **둘 다** 전진시켜야 하며, 킥은 카운트인(2마디)을 지난 뒤에나
> 나오므로 5초 이상 전진해야 오실레이터가 관측된다.

---

## 24. 최종 검증 (세션 11)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **324/324** (26 파일) |
| `npm run build` | ✅ precache **1,103.59 KiB** |

> 테스트: 46 → 91 → 138 → 174 → 301 → **324**
> 프레임 조정 비용(160노트): 9.03ms → **2.92ms**

---

## 25. 세션 12 — GameScreen 훅 단위 테스트 (신규 62건)

Q-05 로 `GameScreen.tsx` 에서 분리한 훅 3종은 그 자체로 검증되지 않았다.
프레젠테이션 통합 테스트는 이 경로들을 우회해 버린다.

### 25.1 `useGameLoop.test.tsx` (26건)

| 그룹 | 커버 |
|---|---|
| `advanceSlowmo` | 비활성 → 오디오 그대로 / 결과가 항상 `[audio-0.12, audio]` 창 안 / 지연 포화 / 오디오 역주행 금지 |
| `deeper` | 차수 비교 (bow15 < bow45 < bow90 < dogeza) |
| 루프 | `ready` 무동작 · `setNow` 전달 · **U-01 일시정지 중 멈춤** · 곡 종료 `finish()` 1회 · `done` 에서 재판정 금지 |
| **B-01** | BAD 윈도우 경과 시 MISS · **워프 가드 밖은 데미지 없이 통과**(탭 복귀 폭사 방지) · `sweepForcedReleases` 매 프레임 |
| 판정 제외 | 가짜 노트 · 이미 판정된 노트 |
| 질문 | 시각 지난 질문을 `intensifyQuestion` 거쳐 표시 |
| **B-14 회귀** | **렌더마다 교체된 컨텍스트가 루프에 반영된다** (이게 깨지면 DDA 가 MISS 에만 적용되는 반쪽짜리) |
| 연출 | 히트스톱 중 줌 감쇠 정지 · **P-01 도게자 상태는 변화 시점에만 React 를 건드린다** · 탭 후 `TAP_POSE_HOLD_SEC` 포즈 유지 |
| I-06 | 슬로모 활성 시 **표시 시각만 지연**, 판정은 오디오 시각 |
| 정리 | 언마운트 시 RAF 해제 |

### 25.2 `useStageEffects.test.tsx` (17건)

상한(CAP_POPUPS / CAP_SHOCKWAVES / CAP_SOLID_RINGS) · 수명(TTL) · **id 가드(오래된 제거
콜백이 새 아이템을 지우지 않음)** · U-04 라이브 판정 · `reduceMotion` 전 채널 무음 처리와
**정지 링·팝업은 예외(정보 보존)** · `applyPlan` 단일 진입점 · 줌 상한 1.5 / 감쇠 수렴 ·
히트스톱 시간 창 · `clearTransient` · SNS 최근 5개.

### 25.3 `useLaneInput.test.tsx` (19건)

입력 유예 500ms · 대기 상태 시작 트리거(판정 미발화) · **B-07 포인터 multitouch**
(같은 레인 2손가락 중 하나를 떼도 유지 / 마지막에 해제, 서로 다른 레인 동시, 키보드 슬롯 −1) ·
홀드 중복 입력 차단 · `clearPressed` · **B-16 Escape 재개/종료 구분 3케이스** ·
**B-04 최신 핸들러 디스패치** · 미매핑 키 무시 · `e.repeat` 무시 · IME 조합 시 `e.code` 폴백 ·
대기 상태 키업 무시 · 언마운트 시 리스너 제거.

> 테스트 작성 중 발견한 사항:
> - `planFeedback(judgment, isDogeza, reduceMotion)` — 객체 인자가 아니라 위치 인자.
> - `isHitstopped` 는 `performance.now()` 기준이므로 가짜 타이머는 `vi.advanceTimersByTime`
>   으로 전진해야 한다 (`setSystemTime` 은 통하지 않는다).
> - 기본 키맵은 `a/s/d/space` 이며 `DEFAULT_KEY_MAP` 은 미export (`DEFAULT_KEYS` 가 공개 심볼).
> - **한글 리터럴은 이 환경에서 코드포인트가 깨진다.** IME 조합 테스트는
>   `String.fromCharCode(0xac00)` 로 생성한다.

### 25.4 부수 수정

`useStageEffects.ts:181` 의 `useCallback((...) => {    const id = ...` 한 줄 붕괴(포맷 손상) 복구.

---

## 26. 최종 검증 (세션 12)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **386/386** (29 파일) |
| `npm run build` | ✅ precache **1,103.59 KiB** |

> 테스트: 46 → 91 → 138 → 174 → 301 → 324 → **386**

## 27. 남은 작업 (세션 12 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| E-01 | E2E(Playwright) — 실제 브라우저에서 WebAudio/PWA/포인터 검증. jsdom 이 대체 불가한 영역 | 중 |
| — | `GameScreen.tsx` 본체 통합 테스트 (훅 조합 + 판정 파이프라인) | 중 |
| — | `dda`/`journalistAI` 을 루프 위에서 연동 검증 (B-14 완전 회귀) | 하 |
| — | 성능 프로브를 CI 에서 주간 실행하도록 분리 (`notePerf` 는 별도 스킷 가능) | 하 |
---

## 28. 세션 13 — Playwright E2E 도입 (신규 20건)

jsdom 스텁이 **구조적으로 검증 불가능한 영역**을 실제 브라우저(Chromium)에서 검증한다.

### 28.1 인프라

| 파일 | 내용 |
|---|---|
| `playwright.config.ts` | `vite preview`(빌드 결과)로 구동 — SW·리소스 경로가 프로덕션과 동일. `locale: "ko-KR"` 고정 |
| `tsconfig.e2e.json` | E2E 전용 타입체크. 기존 `tsconfig.json` 은 `src` 만 포함해 **E2E 전체가 검증 밖에 있었다** |
| `package.json` | `test:e2e` 스크립트 · `typecheck` 에 e2e tsconfig 추가 |
| `eslint.config.js` | `test-results` / `playwright-report` 무시 |
| `.gitignore` | E2E 산출물 제외 |

> Windows 에서 `vite preview` 는 `localhost`(=::1) 에만 바인딩돼 `127.0.0.1` 연결이
> 거부된다. `--host 127.0.0.1` 로 명시해야 한다.

### 28.2 커버

| 스펙 | 검증 내용 |
|---|---|
| `smoke.spec.ts` 10건 | 부팅 · 타이틀/설정/에디터 · **런타임 콘솔 오류 0** · 탭 전환 · PWA manifest · **부팅 언어 자동 감지**(en-US / ja-JP 컨텍스트로 실제 `navigator.language` 검증) · 언어 선택 영속화 |
| `gameplay.spec.ts` 10건 | 실제 AudioContext 생성/상태/시각 전진 · **WAV 실제 디코드** · RAF 프레임 그리기 · **B-07 멀티터치**(2레인 동시 / 같은 레인 2손가락) · 키보드 이벤트 · 모션 감소 영속화 · IndexedDB · SW 등록 확인 |

### 28.3 E2E 에서만 드러난 것들

| 사항 | 내용 |
|---|---|
| 앱 언어 자동 감지 | `detectLang()` 가 `navigator.language` 를 따른다. 헤드리스 Chromium 은 `en-US` 라 영어로 부팅된다 — **테스트 가정 오류가 아니라 앱의 올바른 동작**. 로케일을 고정해 결정론적으로 만들고, 감지 동작 자체를 테스트로 고정했다 |
| 준비 오버레이 | 레인 입력은 준비 화면에서 `start()` 만 부른다. 판정 검증을 하려면 시작 버튼을 누르고 **입력 유예(500ms)** 를 넘겨야 한다 |
| 합성 PointerEvent | 활성 포인터가 아니므로 `setPointerCapture` 가 `NotFoundError` 를 던져 React 핸들러가 죽는다 → 테스트에서 캡처 API만 무효화 (포즈 추적 로직은 그대로 통과) |
| `decodeAudioData` | PCM 바이트가 아니라 **인코딩된** 오디오를 받는다. 테스트에서 최소 WAV(1초)를 직접 생성 |
| 리샘플링 | 디코딩된 버퍼는 컨텍스트 레이트로 리샘플링된다(헤드리스 = 48kHz). 44100 을 가정하면 오탐 |

### 28.4 접근성 DOM 계약 (이미 테스트 가능한 형태)

레인 키는 `role=group` 컨테이너 + `button[aria-pressed]`(U-05), 설정 토글은 `aria-pressed`
버튼이다. 덕분에 E2E 가 내부 상태 없이 실제 접근성 트리로 동작을 검증할 수 있다.

---

## 29. 최종 검증 (세션 13)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 (앱 + E2E 2개 tsconfig) |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` (vitest) | ✅ **386/386** (29 파일) |
| `npm run test:e2e` (Playwright) | ✅ **20/20** (Chromium, 2회 연속 안정) |
| `npm run build` | ✅ precache **1,103.61 KiB** |

> 테스트: 46 → 91 → 138 → 174 → 301 → 324 → 386 (unit) · **20** (E2E)

### 29.1 추가 발견 — 날짜 의존 flake 제거

`TitleScreen` 스트릭 배지 테스트가 `getByText(/7/)` 로 숫자를 찾았는데, 데일리
챌린지 날짜 문자열(`2026-10-17` 등)이 같은 정규식에 걸린다. **월요일이 되자
실패하기 시작한** 시간 의존 테스트였다.

배지 텍스트는 `🔥7` 처럼 이모지와 숫자가 한 요소에 붙어 있으므로, 라벨의
**형제 요소**를 확인하는 방식으로 바꿔 날짜와 무관하게 고정한다.

> 원칙: 숫자/날짜를 정규식으로 찾지 말 것. 같은 화면의 라벨로 **관계**를 표현하면
> 값이 바뀌어도 안전하다.

### 29.2 인코딩 점검

프로젝트 전체(`.ts`/`.tsx`/`.md`/`.json`/`.js`)를 훑어 U+FFFD(깨진 문자)를
검사하고 1건을 복구했다(`state.md` 세션 5 기록). 현재 **0건**.

## 30. 남은 작업 (세션 13 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| — | `GameScreen.tsx` 본체 통합 테스트 (훅 조합 + 판정 파이프라인 전체) | 중 |
| — | E2E 를 CI 워크플로에 연결 (브라우저 캐시 + trace 아티팩트 업로드) | 중 |
| — | `dda`/`journalistAI` 를 루프 위에서 연동 검증 (B-14 완전 회귀) | 하 |
| — | 성능 프로브(`notePerf`) 를 주간 실행용 별도 스크립트로 분리 | 하 |
---

## 31. 세션 14 — GameScreen 판정 파이프라인 통합 테스트 (신규 12건)

훅과 순수함수는 각각 검증되었지만 **"키 입력 → 판정 → 점수/연속 → 결과 객체"** 로
이어지는 전체 경로는 아무도 보지 않았다. 짧은 합성 채보로 처음부터 끝까지 통과시킨다
(`GameScreen.integration.test.tsx`).

| 그룹 | 커버 |
|---|---|
| 판정 | 정확한 타이밍 → PERFECT · 엉뚱한 레인 → MISS · 무입력 전부 MISS · **전부 PERFECT → allPerfect** · 가짜 노트 판정 제외(funcake) · 기믹(invisible/speedUp) 판정 |
| 홀드(B-01) | 유지하면 정상 판정 + `releaseCounts` 기록 · **놓치면 곡 종료 시 강제 해제**(`forcedReleases > 0`) |
| 연속/게이지 | 연속 파손 시 `maxCombo` 에 반영 안 됨 · 분노 0~100 유지 · 주가 유한·양수 |
| 일시정지 | 정지 중 입력해도 판정되지 않음 · 포기 시 `onFinish` 없이 `onQuit` 만 |

### 31.1 발견 — `0.12` 선행 오프셋이 테스트에서 비공개 상수였다

첫 실행에서 정확한 타이밍 입력이 **PERFECT 가 아니라 GOOD** 으로 나왔다.

- `songTime = ctx.currentTime - songStart`, `songStart = ctx.currentTime + 0.12`
- 즉 오디오 시각을 그대로 세면 **항상 0.12초씩 밀려** PERFECT(±40ms)가 GOOD(±140ms)이 된다
- `0.12` 는 `audio.ts` 안에 매직넘버로 박혀 있어 테스트가 같은 값을 알 수 없었다

조치: `SONG_PREROLL_SEC` 를 export 해 **生产和 테스트가 같은 값을 쓴다.**
차트 에디터 시작 오프셋(`offsetForStage`)과 혼동되지 않게 "곡 시작 전 선행 시간"
이라는 주석을 명시했다.

> 교훈: 프레임을 다루는 통합 테스트는 **시각 기준 변환**을 먼저 검증해야 한다.
> 첫 실패는 판정 로직이 아니라 시간축 정의 문제였다.

### 31.2 CRITICAL — `src/game/audio.ts` 는 CRLF

`edit` 도구의 LF 기반 매칭이 실패해 여러 수정이 막혔다. `state.md`(LF)와 섞여
있어 같은 세션에서 "같은 도구가 된다 통한다 안 된다" 가 반복됐다.
`.ts`/tsx 는 CRLF, `.md` 는 LF 인 상태. 앞으로 파일 수정 전 개행을 확인할 것.

---

## 32. 세션 14 — CI 워크플로

`.github/workflows/ci.yml`

| 잡 | 내용 |
|---|---|
| `verify` | `npm ci` → `npm run verify` (typecheck·lint·unit) |
| `e2e` | `npx playwright install --with-deps chromium` → `npm run test:e2e` · 실패 시 `test-results/`(trace) 아티팩트, 항상 `playwright-report/` 업로드 |
| `build` | `npm run build` → `dist/` 아티팩트 (`verify` 의존) |

- `concurrency` 로 같은 브랜치 재실행 시 이전 것 취소
- `node-version: 22`, `cache: npm`
- `tsconfig.e2e.json` 을 통해 **E2E 도 typecheck 에 포함**된다. CI 에서 E2E 전용
  타입 오류가 `verify` 잡에서 먼저 걸린다

---

## 33. 최종 검증 (세션 14)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 (앱 + E2E 2개 tsconfig) |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` (vitest) | ✅ **398/398** (30 파일) |
| `npm run test:e2e` (Playwright) | ✅ **20/20** (Chromium) |
| `npm run build` | ✅ precache **1,103.62 KiB** |

> 테스트: 46 → 91 → 138 → 174 → 301 → 324 → 386 → **398** (unit) · 20 (E2E)

## 34. 남은 작업 (세션 14 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| — | `dda`/`journalistAI` 를 루프 위에서 연동 검증 (B-14 완전 회귀) | 중 |
| — | 성능 프로브(`notePerf`) 를 주간 실행용 별도 스크립트로 분리 | 하 |
| — | `ensureVoiceBank`/`autoChart`/`editorChart` 잔여 커버리지 확대 | 하 |
| — | 줄 개행 통일 (CRLF/LF 혼재) — 도구 매칭 실패의 근본 원인 | 하 |
---

## 35. 세션 15 — 남은 항목 일괄 처리

### 35.1 줄 개행 통일 (도구 실패의 근본 원인 제거)

| 상태 | 파일 수 |
|---|---|
| CRLF | 39 |
| LF | 53 |
| **한 파일 안에 혼재** | **2** (`src/game/visibility.ts` 111/1, `src/i18n/ui.ts` 430/10) |

`.ts`/tsx 는 CRLF, `.md` 는 LF 인 상태여서 같은 세션에서 편집 도구의 문자열 매칭이
"된다 / 안 된다" 를 오갔다. 91개 텍스트 파일을 전부 **LF 로 정규화**하고
`.gitattributes` (`* text=auto eol=lf`) 로 Windows 작업에서도 LF 가 기록되도록 고정했다.
빌드 바이너리(`*.mp3` `*.wav` `*.png` 등)는 `binary` 로 명시했다.

> 정규화 전후 모두 398/398 통과 — 동작 변경 없음.

### 35.2 `dda` / `journalistAI` 루프 연동 (신규 7건, B-14 완전 회귀)

`GameScreen.dda.test.tsx`. 순수 함수는 이미 테스트돼 있었으나 **루프 위에서
`ctxRef` 를 통해 최신값이 보이는지**는 검증이 없었다. B-14 가 깨지면 렌더 값이
초기값에 고정되어 DDA 가 MISS 판정에만 적용되는 반쪽짜리가 된다.

- DDA — 연속 MISS → 부스트 상승 · 전부 PERFECT → `allPerfect` · 정확히 치면 여전히 PERFECT
- 기자 AI — **B-13 표본 게이트**(<`PRAISE_MIN_SAMPLE` 이면 원문 그대로) · 표본 충분 시
  꼬리 부착(원문 보존) · `qIndex` 전진(최신 질문으로 교체)

> 발견: 질문은 `Journalist` 컴포넌트가 `“text”` 로 감싼다. B-13 은 괄호 안 원문만
> 비교해야 접두/접미 문구가 붙어도 구분된다. 또 질문은 **동시에 하나만** 표시된다
> (`{question && <Journalist/>}`) — 둘 다 보이는 게 아니라 **교체**된다.

### 35.3 `voiceBank` / `detectPeaks` 커버리지 (신규 20건)

`voiceBank` 은 모듈 전역 상태(`bankPromise`, `syncCache`)를 들고 있어 `vi.resetModules()`
로 격리했다. 검증: 모듈 수준 캐시(1회만 로드) · 개별 파일 실패 격리 · 전체 실패 무음 ·
`res.ok === false` 스킵 · **동기/비동기 캐시 객체 동일성** · AudioContext 생성 실패 폴백 ·
**디코더 실패 시 컨텍스트 닫힘**(리소스 누수).

`detectPeaks` 를 검증하며 **계약이 문서와 다르다** 는 걸 확인했다:

| 항목 | 사실 |
|---|---|
| 반환값 정규화 | **0~1 이 아니라 초 단위** (`(i * hopSize) / sampleRate`) |
| 시간 해상도 | hop(512샘플 ≈ 11.6ms @44.1kHz) 단위 양자화 — 1ms 정밀도를 주장하지 않는다 |
| 입력 크기 | 기본 `windowSize` 1024 — 그보다 짧은 배열은 창이 0개 |

따라서 **버스트**(연속 샘플)로 만들어야 검출된다. 단일 샘플 임펄스는 창 평균 에너지에
묻혀 0건이 나온다. 테스트는 hop 격자 정합 + 실제 시각과의 오차 한계로 고정했다.

### 35.4 성능 프로브 분리 (`npm run test:perf`)

`notePerf.test.tsx` → `notePerf.bench.tsx` + `vitest.perf.config.ts`.

| 항목 | 내용 |
|---|---|
| 기본 `npm test` | `*.bench.tsx` **제외** (31 파일 423건) |
| `npm run test:perf` | 프로브만 실행 (1 파일 2건), timeout 60s |
| `PERF_OUT=perf.json` | 결과를 JSON 으로 (CI 수집용) |

> `mergeConfig` 로 기본 설정과 합치면 **배열형 키(`include`/`exclude`)가 합쳐져**
> 전체 파일이 다시 돈다. perf 설정은 독립 파일로 작성했다.

#### 측정 자체가 신뢰 불가함 — 단정 없음으로 전환

동일 코드에서 ratio(`cost ÷ notes`)가 **0.46 → 1.80** 으로 뒤집혔다. 원인은
머신 부하(한 번의 실행에서 `import 90%` 로 12초 소요). 즉 **비율조차 단정 대상이 아니다.**

그래서 프로브는 **구조 불변식만** 검증한다:
- DOM 요소 수가 노트 수에 대해 증가
- 모든 행이 유한한 측정값을 냄

수치는 `console` 보고 + 기준값 병기(`160노트 2.92ms · ratio 0.46`)만 하고,
회귀 판단은 사람이 `state.md` 와 비교한다.

> 교훈: 측정값을 테스트로 만들려면 **먼저 그 측정이 재현 가능한지**를 확인해야 한다.
> 이 프로젝트의 jsdom 타이머는 그렇지 않다.

### 35.5 CI 보강 (`.github/workflows/ci.yml`)

- `schedules` 로 **매주 월요일 04:17 UTC** `perf` 잡 실행 (절대 비용 drift 추적, PR 을 막지 않음)
- `PERF_OUT=perf-baseline.json` + `actions/upload-artifact` 로 결과 보관
- `schedule` 트리거는 secrets 없이 돌아가도록 구성

---

## 36. 최종 검증 (세션 15)

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 0 (앱 + E2E 2개 tsconfig) |
| `npm run lint` | ✅ **오류 0 · 경고 0** |
| `npm run test` | ✅ **423/423** (31 파일) |
| `npm run test:perf` | ✅ **2/2** (프로브 단독) |
| `npm run test:e2e` | ✅ **20/20** (Chromium) |
| `npm run build` | ✅ precache **1,103.59 KiB** |

> 테스트: 46 → 91 → 138 → 174 → 301 → 324 → 386 → 398 → **423** (unit) · 20 (E2E) · 2 (perf)

## 37. 남은 작업 (세션 15 종료 시점)

| ID | 항목 | 우선 |
|---|---|---|
| — | 잔여 커버리지: `judgment` 경계값 `daily`(날짜 로직) `skills` `missions` 는 점수 산식 수준까지 | 하 |
| — | `chart.ts`(1,104줄)의 데이터 생성 검증 — 라벨/박자 매핑 | 하 |
| — | 시각 회귀 E2E (`expect(page).toHaveScreenshot`) — 레이아웃 변경 감지 | 하 |
| — | `perf-baseline.json` 누적 비교 자동화 (드리프트 알림) | 하 |

---

## 38. 세션 16 — 전체 코드 리뷰 후속 (발견 22건 → 전부 해결)

15개 세션 동안 B-01~B-16 을 추적했지만, **테스트/문서 강화에 치우쳐 2차 기능
(에디터 · 데일리 · 설정 · 결과)에 실제 결함이 남아 있었다.** 전체 리뷰로 22건을
찾아 모두 수정했다.

### 38.1 🔴 기능이 실제로 동작하지 않던 것 (4건)

| ID | 내용 | 조치 |
|---|---|---|
| **C-01** | **자동채보 결과가 100% 버려졌다.** `onFile` 이 같은 틱에 `importJson` 과 `setTitle` 을 연달아 불렀는데, `persist` 가 함수형 업데이트가 아닌 plain object 를 `setState` 에 넘겼다. `setTitle` 이 클로저로 잡은 `state` 는 **임포트 이전 값** → 배칭 후 뒤의 것이 앞의 셀을 전부 덮었다. 제목만 바뀌고 노드는 0개, 사용자에게는 성공 메시지 | `persist` → 함수형 `update(fn)`. 저장도 300ms 디바운스 + 언마운트 flush 로 변경 (한 글자마다 전체 셀 맵 직렬화하던 문제도 함께 해소) |
| **C-02** | **격자 고정 8마디가 자동채보를 잘랐다.** `notesToCells(notes, BPM, 8)` 이 `bar >= bars` 를 조용히 `continue`. `autoChart` 는 카운트인 2마디를 붙이므로 대략적 곡에서도 마지막 노트가 8마디를 크게 넘는다 → 결과 대부분 소실 | 격자 길이를 **내용에서 유도** (`barsForNotes` / `barsForCells`, 8~64마디). 잘리는 경우 `ed.truncated` 로 알림. `+4마디` 버튼 추가 |
| **C-03** | **기자 말풍선 좌우에 쉼표 2개가 렌더**됐다. 포맷 손상 잔재로 `,` 가 JSX 자식 텍스트로 들어가 있었음 | 제거. 컨테이너 기준으로 회귀 테스트 고정 |
| **C-04** | **동점이어도 "신기록" 배지가 떴다.** `ResultsScreen` 이 `bestByStage[key].score === result.score` 로 비교했는데 `recordRun` 이 이미 값을 갱신한 **뒤** 에 렌더된다. 동점이면 갱신이 없어 옛 값이 남고 그 값이 같아진다 | 갱신 **전** 값으로 판정한 `lastRunNewRecord` 를 `recordRun` 시점에 계산해 저장. 3케이스 회귀 테스트(초과/동점/부족) |

### 38.2 🟠 품질 결함 (8건)

| ID | 내용 | 조치 |
|---|---|---|
| **C-05** | **크래시 화면이 한국어 고정.** `ErrorBoundary` 는 `tr` 를 import조차 하지 않았다. en/ja 사용자에게 한국어 오류 화면이 뜬다 | `err.*` 4키 × 3언어 추가 + `role="alert"` |
| **C-06** | **키 리바인딩이 고아 레인을 만든다.** 이 레인의 기존 키만 지우고, 다른 레인에 묶인 키를 빼앗은 뒤 재배정하지 않았다 → 그 레인은 키를 잃어 게임 내내 dead | `rebindKey()` 순수함수 신설 — 빼앗긴 레인을 기본 키로 복원. 5케이스 테스트 |
| **C-07** | **"60초 속죄" 표방 vs 실제 38초.** `totalBars=18` @120bpm = 36초. 주석의 "≈60초 @130bpm" 도 둘 다 틀림 | `DAILY_TOTAL_BARS = 30` (≈60초). 광고와 구현 일치 |
| **C-08** | **도게자 밸런스 규칙이 주석에만 존재.** 주석은 "마디당 1개 이하" 라는데 그 아래 코드는 `hold` 를 뽑고, `lane` 은 균등 4선택 → 도게자가 매 마디 25% | `pickFreeLane` 으로 실제 구현. 도게자 마디당 1개 제한 테스트 |
| **C-09** | **동일 (레인, 시각) 노트가 중복 생성.** 마디당 보장 홀드(beat 2)가 밀도 루프 노트와 겹칠 수 있었음 → 어떤 노트를 쳐야 하는지 모호 | `occupied` Set 으로 (박자, 레인) 점유 관리 |
| **C-10** | **데일리기록이 날짜 키로 무한 누적 + 내부 ID 노출.** 기록 탭에 `daily:2026-10-19` 이 그대로 표시 | `baseStageOf()` 로 정규화. `stageLabelFor()` 를 `constants` 로 옮겨 결과 화면·기록 탭이 공유 |
| **C-11** | **데드 API 재생성.** `applyPlan` 도입 후 `addPopup` 은 로직까지 중복이며 프로덕션 미사용, `clearTransient` 도 미사용 | `applyPlan` 이 `addPopup` 을 재사용 (중복 제거). `clearTransient` 를 quit·채보 교체에 실제 배선 |
| **C-12** | **i18n 우회 하드코딩.** `autoChart` title 만 `lang` 무시, `ResultsScreen` 영어 라벨 6개 + `toLocaleString("en-US")` 고정, `ManagerKim`/`daily` 인라인 3중 분기, `GameHud` "COMBO" | 3언어 키로 이관. `ed.*` / `err.*` / `stage.*` / `res.*` / `kim.*` / `daily.*` / `hud.combo` 추가 |

### 38.3 🟡 위생 · 도구 (10건)

- **인코딩 손상 5줄 복구** — `audio.ts` `SONG_PREROLL_SEC` 주석 등. 이전 세션의 U+FFFD 스캔은
  **유효한 한글로 재인코딩된** 경우를 잡지 못한다 (이번 건이 그 사례).
- **미사용 모듈 삭제** — `src/utils/cn.ts` (import 0건) → 의존성 `clsx`·`tailwind-merge` 도 제거.
- **테스트 파일 3쌍 중복 해소** — `useGameLoop`/`useLaneInput`/`useStageEffects` 의 `.ts`·`.tsx` 이각
  병존. 고유 케이스 16개를 `.tsx` 로 이전하고 `.ts` 3개 삭제.
- **잠복 타입 오류 6건 수정** — `useGameLoop.test.tsx` 는 **커밋되지 않은 파일**이었고,
  의존성 재설치로 드러났다 (`gimmick: null` 캐스팅, 존재하지 않는 `TimingWindows.ok` 등).
- **ESLint `--max-warnings 0`** — `exhaustive-deps`·`no-console` 이 warn 인데 CI 에서 무효화돼 있었다.
  도입 즉시 실제 문제 2건을 잡아 수정.
- **vitest 설정 파일 타입체크 편입** — `vitest.config.ts` / `vitest.perf.config.ts` 가 어떤
  tsconfig 에도 없어 검증 밖이었다.
- **커버리지 게이트 신설** — `@vitest/coverage-v8` + thresholds (lines 70 / branches 70 /
  functions 80). CI `verify` 잡에서 실행.
- **번들 사이즈 예산** — 단일 HTML 인라인 빌드라 무한 증가 가능. CI 가 600KiB 초과 시 실패.
- **CI 최소 권한 + 잡 타임아웃.**
- **성능 프로브 자동 비교는 넣지 않음** — jsdom 환경에서 실측값이 재현되지 않는다는
  기존 결론(35.4)을 존중해, 의도를 코드에 명시하는 것으로 마감.

### 38.4 P-01 여전 — MISS 스캔 O(N)

렌더 쪽 `visibleNoteWindow` 은 이진 탐색으로 최적화돼 있었지만 **판정 쪽은 여전히
매 프레임 `chart.notes` 전량 순회**였다. 정렬 불변식과 단조 증가하는 곡 시각을 이용해
`missCursorRef`(notes 배열 identity + 인덱스)로 앞으로만 스캔하도록 변경.
채보 교체 시 identity 비교로 커서를 0 으로 되돌린다.
4건 테스트로 커서 전진/재순회 부재/가짜 노트 스킵/채보 전환을 고정.

### 38.5 접근성 보강

- `SettingsPanel` — `role="dialog"` `aria-modal` `aria-labelledby` + Escape 닫기 + 포커스 이동
- 키 리바인딩 입력 — `aria-label` 부여, `isBindableKey()` 로 **수정자 키 배정 차단**
  (Shift/Control 을 레인에 묶으면 그 레인이 죽는다)
- 에디터 텍스트 입력 2개 — `aria-label`, 모드 버튼 — `aria-pressed`
- 장식 이미지 `alt="" aria-hidden` — `TitleScreen` 배경, 김부장 easter egg `aria-label` 로컬라이즈
- `ErrorBoundary` — `role="alert"`
- `reduceMotion` — OS 설정을 **초기값으로만** 따르고, 사용자가 직접 조작하면
  `reduceMotionUserSet` 로 OS 추적을 끊는다 + `matchMedia` change 리스너 추가

### 38.6 최종 검증

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 0 (앱 + E2E + vitest 설정) |
| `npm run lint` | ✅ 오류 0 · **경고 0** (`--max-warnings 0`) |
| `npm run test` | ✅ **413/413** (31 파일) |
| `npm run test:coverage` | ✅ statements 87.8% · branches 78.1% · functions 88.5% · lines 90.8% |
| `npm run test:e2e` | ✅ 20/20 (Chromium) |
| `npm audit` | ✅ 0 vulnerabilities |

> 발견 22건 → **22건 전부 해결**. 테스트 425 → 413 (중복 41건 제거 + 회귀 29건 추가).

### 38.7 회귀 테스트 목록 (신규 29건)

| 파일 | 커버 |
|---|---|
| `editorChart.bars.test.ts` (신규 7) | C-02 격자 유도 · 8마디 회귀 대조 · 자동채보 전량 보존 · MAX_BARS 절단 · `clampCellsToBars`(L-17) |
| `daily.contract.test.ts` (신규 9) | C-07 길이↔광고 일치 · 결정성 · 정렬/유일 id · **C-09 중복 없음** · **C-08 도게자 마디당 1개** · 카운트인 무효화 |
| `settingsStore.keys.test.ts` (신규 5) | **C-06 고아 레인 방지** (실제 실패 순서를 그대로 재현) · 불변성 |
| `useGameLoop.test.tsx` (+4) | **MISS 스캔 커서** 4건 (전진·재순회 부재·가짜 스킵·채보 전환) |
| `EditorAndArt.test.tsx` (+3) | **C-01 자동채보 제목+노트 동시 반영** · **C-02 절단 알림** · 언마운트 저장 |
| `GameScreen.test.tsx` (+1) | **C-03 쉼표 비렌더** (반대 상태에서 실패 확인함) |
| `ResultsScreen.test.tsx` (±2) | **C-04 신기록** 3케이스를 실제 `recordRun` 으로 end-to-end 검증 |
| `TitleScreen.test.tsx` (+1) | **C-10 내부 ID 비노출** |

---

## 39. 세션 17 — A: 오디오 지연 보정 (타이밍 히스토그램 + 오프셋)

리듬게임의 전제 조건이 빠져 있었다. `PERFECT_MS = 55` 인데 **플레이어가 자기
환경의 오디오 지연을 맞출 방법이 아예 없었다.**

| 환경 | 지연 | 보정 전 |
|---|---|---|
| 유선 헤드폰 | 10~30ms | 대체로 가능 |
| 블루투스 | **120~250ms** | PERFECT 불가 |
| 블루투스 + TV | 300ms+ | 플레이 불가 |

즉 블루투스 사용자 대부분이 "이 게임 왜 안맞지?" 하고 떠나는 구조였다.

### 39.1 핵심 설계 결정 — **판정에만** 적용

오프셋을 어디에 적용하느냐가 전부다.

| 적용 위치 | 결과 |
|---|---|
| 렌더(노트 위치) + 판정 | ❌ 눈으로 노트를 따라치는 플레이가 통째로 어긋난다. 게임이 성립하지 않는다 |
| **판정(입력 시각)만** | ✅ "소리로 듣고, 눈으로 보고, 보정된 손맛으로 치는" — 리듬게임 표준 |

노트의 시각적 위치는 실제 오디오를 그대로 따르고, **입력 시각에서만**
오프셋을 빼서 판정한다.

### 39.2 `src/game/timing.ts` (신규, 순수함수)

- `bucketIndexOf` / `timingStats` / `isReliable` / `withReliability` / `bucketHeights`
- ±200ms 를 25ms 버킷 16칸으로 (블루투스 지연 상단까지)
- **중앙값으로 추천** — 실수 1~2회로 평균이 끌려가는 것을 막는다
- **버킷 폭 절반 이내는 0 으로 스냅** — 히스토그램 해상도(25ms) 때문에 ±12.5ms가
  +13 으로 새어나와 사용자에게 의미 없는 13ms 밀기를 제안하게 된다
- **신뢰성 게이트** — 표본 20타 미만 또는 표준편차 60ms 초과면 추천하지 않는다.
  3타를 보고 확신하거나 흔들리는 손에 값을 밀어붙이면 판정이 더 어긋난다

### 39.3 부호 규약 (가장 위험한 부분)

```
error = 입력시각 - 노트시각     (양수 = 늦게침)
판정  = 입력시각 - 오프셋
⇒ 늦게 치는 사용자(+median)에게 양수 오프셋을 권한다
```

이 규약이 히스토그램 x축 방향과 설정 슬라이더 방향을 모두 결정한다.
**작성 중 부호를 반대로 구현했다가 통합 테스트가 잡아냈다**
(`best.time - time` 은 실제로는 "일찍 친 양수"). 반대로 두면 보정을 켤수록
판정이 더 어긋난다 — 가장 위험한 종류의 버그다.

### 39.4 배선

- `settingsStore` — `audioOffsetMs` (±200ms, 5ms 격자) + 영속 + `clampOffset`.
  NaN/Infinity 는 0 (극단 보정은 사용자를 unplayable 상태로 만든다)
- `GameScreen.handlePress` — 입력 시각에 보정 적용 + **보정 후** 오차 기록.
  (보정 전 오차를 기록하면 설정값이 자기 자신을 되먹음한다)
- `GameResult.timing` — 종료 시 통계 산출
- `ResultsScreen` — 히스토그램 + 평균 오차 + 원클릭 적용
- `SettingsPanel` — 수동 슬라이더 (진단 수단이 있어도 직접 조절은 필요)
- i18n 13키 × 3언어

### 39.5 테스트 (신규 36건)

- `timing.test.ts` (25) — 버킷 매핑 · 통계 · **추천 방향/크기** · 신뢰성 게이트 · 클램프
- `GameScreen.offset.test.tsx` (11) — 통합: 보정 상쇄(±150) · **자기참조 방지** ·
  빈 표본 · 진단이 판정과 같은 클럭을 보는지

부호 반전 버그는 실제로 코드를 뒤집어 테스트가 실패하는 것을 확인했다.

### 39.6 검증

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 0 |
| `npm run lint` | ✅ 오류 0 · 경고 0 |
| `npm run test` | ✅ **449/449** (33 파일) |
| `npm run test:e2e` | ✅ 20/20 |
| `npm run build` | ✅ precache 1,115 KiB |

> 테스트 413 → **449** (+36)

---

## 40. 세션 18 — B: "더치면 이득" 구조 제거

리듬게임의 보상 규칙이 뒤집혀 있었다.

```
정확도 가중치   PERFECT 1.0 · GREAT 0.8 · GOOD 0.6 · BAD 0.35 · MISS 0
주가 손실      BAD -2.5%  vs  MISS -14%
분노 증가      BAD +4      vs  MISS +9
```

**노트를 완전히 놓치면 아무것도 안 잃지만, 엉뚱한 타이밍에 치면 35% 를 잃는다.**
즉 "아무것도 안 치기" 보다 "아무 레인이나 치기" 가 유리했다.

100노트 시뮬레이션으로 실제 손해를 측정했다:

| 전략 | 정확도 | 주가 잔존 |
|---|---|---|
| 전부 GREAT | 0.80 | 5.95 |
| 전부 GOOD | 0.60 | 2.22 |
| **전부 BAD (마구치기)** | **0.35** | **0.0795** ← MISS 의 1/6 |
| 전부 MISS | 0 | 0.0000003 |

주가가 8% 나 남는다. 감을 잃은 플레이어에게 "일단 아무 레인이나 치자" 가
**합리적 선택**으로 성립했고, 이 게임의 핵심 시스템(주가/분노)이 우회되었다.

### 40.1 수정 — 세 채널 동시 정렬

| 채널 | 이전 | 이후 | 근거 |
|---|---|---|---|
| 정확도 (BAD) | 0.35 | **0** | MISS 와 동일 |
| 주가 (BAD) | -2.5% | **-9%** | MISS(-14%) 와 비 1.6배 |
| 분노 (BAD) | +4 | **+7** | MISS(+9) 와 격차 2 |

**정확도를 "조금이라도 깎은" 0.1 이 아닌 정확히 0 으로** 내렸다.
- 총기에 의미가 없다 ("조금이라도 맞췄다" 는 거짓말)
- MISS 와 같은 값이라 "못 친 것" 과 "엉뚱하게 친 것" 이同为 최하 가 되어
  플레이어가 "더치면 이득" 이 없다는 것을 한눈에 알 수 있다

이후 등급이 잘 분화된다:

| 플레이 | 정확도 | 등급 |
|---|---|---|
| 올손 | 1.00 | SSS |
| GREAT 위주 | 0.80 | A |
| GOOD 위주 | 0.60 | C |
| BAD 30% | 0.70 | B |
| **마구치기(전부 BAD)** | **0.00** | **F** |
| 아무것도 안 침 | 0.00 | F |

GOOD 위주가 C 라 "더치면 이득" 인舊 구조와 정반대다. **GOOD 과 BAD 사이에
0.6 격차를 남긴 이유**는 "조금이라도 노려치자" 는 동기가 사라지지 않아야 하기 때문.
숫자를 0 으로 깎으면서도 방향은 남겼다.

### 40.2 결과 화면 안내

플레이어 입장에서는 "MISS 와 같은데 왜 등급이 다른지" 버그처럼 보인다.
BAD 가 있을 때 이유를 i18n 3언어로 안내한다.

### 40.3 테스트 (신규 21건)

- `judgment.test.ts` (+14) — BAD 0 / 채널 간 정렬 일관 / 단조성 / "더치면 이득
  구간 부재"(모든 판정 쌍을 순회) / 최악 선택 3중 확인
- `GameScreen.balance.test.tsx` (신규 9) — 통합: 정확도 단조성 / 손대지 않으면 0 /
  마구치기로 주가·분노 방어 불가 / 파이프라인이 순수함수와 일치

**회귀 확인**: `BAD: 0.35` 로 되돌리면 테스트 4건이 실패한다.

### 40.4 테스트 하네스에서 배운 것 (2건)

1. **`audioContexts` 가 테스트 간 누출**됐다. 컨텍스트가 남으면 `advanceAudio` 가
   옛 컨텍스트까지 전진해 곡 시각이 어긋난다. 전역 `beforeEach/afterEach` 로 초기화.

2. **jsdom 타이밍으로 "정확히 N타가 BAD" 같은 단언은 불가능**하다. 곡 시각이
   프레임 스텝(16ms)만큼 밀리고 입력 유예(500ms)와 누적돼 판정이 매번 흔들린다.
   프로브를 3회 작성해 원인을 추적했으나(소요 시간 과다), 정답은
   **"어떤 타이밍에서도 성립하는 성질"**(단조성·정렬) 로 단언하는 것이었다.
   프레임 잡음에 의존하는 단언은 "나중에 깨지는 테스트" 가 되므로 쓰지 않았다.

### 40.5 검증

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 0 |
| `npm run lint` | ✅ 오류 0 · 경고 0 |
| `npm run test` | ✅ **471/471** (34 파일) |
| `npm run test:e2e` | ✅ 20/20 |
| `npm run build` | ✅ precache 1,116 KiB |

> 테스트 449 → **471** (+22)
