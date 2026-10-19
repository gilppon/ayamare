import {
  BAD_MS,
  GOOD_MS,
  GREAT_MS,
  PERFECT_MS,
} from "./constants";
import type { Judgment, JudgmentCounts, SkillType } from "./types";

export interface TimingWindows {
  perfect: number;
  great: number;
  good: number;
  bad: number;
}

/** ms 단위 기본 윈도우. scale >1 이면 관대해짐 (접근성 옵션용). */
export function getTimingWindows(scale = 1): TimingWindows {
  return {
    perfect: PERFECT_MS * scale,
    great: GREAT_MS * scale,
    good: GOOD_MS * scale,
    bad: BAD_MS * scale,
  };
}

export function judgeTap(
  absSec: number,
  skill: SkillType = "none",
  windows: TimingWindows = getTimingWindows()
): Judgment {
  const ms = absSec * 1000;
  let j: Judgment;
  if (ms <= windows.perfect) j = "PERFECT";
  else if (ms <= windows.great) j = "GREAT";
  else if (ms <= windows.good) j = "GOOD";
  else j = "BAD";
  if (skill === "teardrops" && j === "GREAT") return "PERFECT";
  return j;
}

/** 홀드 릴리즈 판정. GameScreen handleRelease와 동일 규칙. */
export function judgeRelease(
  diffSec: number,
  skill: SkillType = "none",
  windows: TimingWindows = getTimingWindows()
): Judgment {
  const ms = Math.abs(diffSec * 1000);
  let r: Judgment;
  if (ms <= windows.great) r = "PERFECT";
  else if (ms <= windows.good * 2) r = "GREAT";
  else if (ms <= windows.bad * 2) r = "GOOD";
  else r = "BAD";
  if (skill === "teardrops" && r === "GREAT") return "PERFECT";
  return r;
}

export function comboMultiplier(combo: number): number {
  return 1 + (Math.min(combo, 50) / 50) * 0.5;
}

/**
 * 판정별 정확도 가중치.
 *
 * B: BAD 를 0.35 → **0** 로 내린다.
 *
 * 왜 0 인가: BAD 는 "노트를 엉뚱한 타이밍에 친 것"이다. 플레이어는 자기
 * 타이밍을 전혀 제어하지 못한 것이고, 그런 입력을 정확도의 35% 를 돌려주는
 * 것은 **"아무것도 안 누르기"(MISS) 보다 유리한 선택**을 만든다.
 *
 * 숫자를 0 으로 깎은 이상한 값(예: 0.1) 을 쓰는 대신 정확히 0 을 쓴다:
 *   - 총기는 의미가 없다 ("조금이라도 맞췄다" 는 거짓말이다)
 *   - MISS 와 같은 값이라 **"못 친 것" 과 "엉뚱하게 친 것" 이同为 최하** 가 되어
 *     플레이어가 "더치면 이득" 이 없다는 것을 한눈에 알 수 있다
 *
 * 점수(JUDGMENTS[].score)·콤보·분노·주가는 각자 다른 채널이므로 여기서는
 * 정확도만 다룬다. 나머지는 constants.ts 의 STOCK_DELTA / ANGER_DELTA 가 담당한다.
 */
export const ACCURACY_WEIGHT: Record<Judgment, number> = {
  PERFECT: 1,
  GREAT: 0.8,
  GOOD: 0.6,
  BAD: 0,
  MISS: 0,
};

export function calculateAccuracy(
  counts: JudgmentCounts,
  total: number
): number {
  if (total <= 0) return 0;
  let sum = 0;
  for (const key of Object.keys(ACCURACY_WEIGHT) as Judgment[]) {
    sum += counts[key] * ACCURACY_WEIGHT[key];
  }
  return sum / total;
}
