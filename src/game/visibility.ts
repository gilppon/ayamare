import type { Note } from "./types";

/** 노트가 낙하를 시작하기 전 리드타임(초). 낙하 속도(speed = laneH / LEAD_TIME)의 기준. */
export const LEAD_TIME = 2.05;
/** 스폰: 이만큼 앞서면 화면 상단에 등장 */
export const SPAWN_AHEAD = LEAD_TIME + 0.4;
/** 소멸: 판정선을 이만큼 지나면 화면 하단으로 퇴장 */
export const DESPAWN_BEHIND = 0.6;

export type NoteVisualState = "pending" | "hit" | "miss" | "holding";

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
    if (n.gimmick === "fake") continue;
    if (stateOf(n.id) !== "pending") continue;
    const abs = Math.abs(n.time - time);
    if (abs > badWindowSec) continue;
    if (!best || n.time < best.time) best = n;
  }
  return best;
}
