import type { Note } from "./types";

/** 노트가 낙하를 시작하기 전 리드타임(초). 낙하 속도(speed = laneH / LEAD_TIME)의 기준. */
export const LEAD_TIME = 2.05;
/** 스폰: 이만큼 앞서면 화면 상단에 등장 */
export const SPAWN_AHEAD = LEAD_TIME + 0.4;
/** 소멸: 판정선을 이만큼 지나면 화면 하단으로 퇴장 */
export const DESPAWN_BEHIND = 0.6;

export type NoteVisualState = "pending" | "hit" | "miss" | "holding";

/**
 * 현재 화면에 보일 가능성이 있는 노트의 **인덱스 윈도우**를 이진 탐색으로 찾는다.
 *
 * P-01: 매 프레임 `chart.notes.filter()` 전체 순회는 O(N)이었다.
 * 노트가 time 오름차순으로 정렬되어 있다는 불변식을 이용하면
 * [now - DESPAWN_BEHIND, now + SPAWN_AHEAD] 구간만 훑어도 된다.
 * 150BPM stage5(≈200노트) 기준 프레임당 연산량이 크게 준다.
 */
export function visibleNoteWindow(
  notes: Note[],
  now: number
): { start: number; end: number } {
  const lo = now - DESPAWN_BEHIND;
  const hi = now + SPAWN_AHEAD;
  // upperBound(time <= x)
  let s = 0;
  let e = notes.length;
  while (s < e) {
    const m = (s + e) >> 1;
    if (notes[m].time <= lo) s = m + 1;
    else e = m;
  }
  const start = s;
  s = start;
  e = notes.length;
  while (s < e) {
    const m = (s + e) >> 1;
    if (notes[m].time < hi) s = m + 1;
    else e = m;
  }
  return { start, end: s };
}

/**
 * 노트가 레인에 그려져야 하는지 판정 (순수함수).
 * - hit(타격 성공)만 즉시 소멸. miss는 바닥으로 흘러가게 유지.
 * - 스폰~소멸 사이에는 상태와 무관하게 항상 true → 중간 소멸 없음.
 */
export function isNoteVisible(
  noteTime: number,
  now: number,
  state: NoteVisualState | undefined
): boolean {
  if (state === "hit") return false;
  const d = noteTime - now;
  return d < SPAWN_AHEAD && d > -DESPAWN_BEHIND;
}

/**
 * 키 입력 시 소비할 노트 선택 (순수함수).
 * 구규칙(가장 가까운 노트)은 8분박자(230ms 간격) 구간에서
 * 뒷노트를 먼저 먹는 버그가 있어, 윈도우 내 가장 빠른 노트 우선으로 변경.
 */
export function selectPressTarget(
  notes: Note[],
  stateOf: (id: number) => NoteVisualState | undefined,
  lane: number,
  time: number,
  badWindowSec: number
): Note | null {
  let best: Note | null = null;
  for (const n of notes) {
    if (n.lane !== lane) continue;
    if (!isJudgeable(n)) continue;
    if (stateOf(n.id) !== "pending") continue;
    const abs = Math.abs(n.time - time);
    if (abs > badWindowSec) continue;
    if (!best || n.time < best.time) best = n;
  }
  return best;
}

/**
 * 이 노트가 **플레이어의 평가 대상**인가.
 *
 * `fake` 기믹은 "누르면 안 되는 노트"다 — 누를 수도 없고(`selectPressTarget` 에서
 * 제외) 놓쳐도 MISS 가 되지 않는다(`useGameLoop` MISS 스캔에서 제외).
 * 즉 어떤 판정도 한 번도 발생하지 않는 노트다.
 *
 * ⚠️ 밸런스 실측에서 드러난 결함: 정확도 **분모**가 `chart.notes.length` 였던
 * 관계에, 판정되지 않는 fake 노트도 들어갔다. 그 결과 완벽한 플레이조차
 * stage5 에서 96.6% 에 멈췄다 (146노트 중 5개가 어차피 못 얻는 점수).
 *
 * 규칙의 출처를 **한 곳**(이 함수)으로 모은다. 판정 대상 판단이 여기저기에서
 * 각각 복제되면 (지금은 visibility / useGameLoop 두 곳이다) 언젠가 어긋난다.
 */
export function isJudgeable(note: Note): boolean {
  return note.gimmick !== "fake";
}

/** 판정 대상 노트만 모은다 (정확도 분모·시뮬레이션에서 함께 쓴다) */
export function judgeableNotes(notes: readonly Note[]): Note[] {
  return notes.filter(isJudgeable);
}

/**
 * 정확도 분모 — 판정이 한 번이라도 발생할 수 있는 노트 수.
 *
 * `chart.notes.length` 를 쓰면 fake 노트가 분모만 잡는다 (위 결함).
 */
export function judgeableCount(notes: readonly Note[]): number {
  let n = 0;
  for (const note of notes) if (isJudgeable(note)) n++;
  return n;
}

/**
 * `speedUp` 기믹의 낙하 곡선 지수.
 *
 * B-02: 기존 값 `1.6` 은 0<d<1 에서 `d`보다 **작아서** 판정선 직전 오히려
 * 감속(거의 정지)했다 — "가속"이라는 이름과 정반대 UX.
 * `0.55` 로 뒤집어 마지막 1초가 정방향으로 빨라지는 오목 곡선이 되게 한다.
 */
export const SPEEDUP_EXPONENT = 0.55;

/** 노트의 화면 Y 좌표 (레인 상단 기준 px). 순수함수 — 렌더와 동일 규칙을 공유한다. */
export function noteFallY(
  noteTime: number,
  now: number,
  hitLineY: number,
  speed: number
): number {
  const d = noteTime - now;
  if (d >= 1) return hitLineY - d * speed;
  return hitLineY - Math.pow(Math.max(0, d), SPEEDUP_EXPONENT) * speed;
}

/**
 * `speedUp` 노트가 마지막 1초에 **등속 이상으로 접근하는지** 검증용.
 * (d=1 에서 남은 거리가 speed, d→0 에서 0 으로 수렴해야 정상)
 */
export function speedUpRemainingRatio(d: number): number {
  return Math.pow(Math.max(0, d), SPEEDUP_EXPONENT);
}

