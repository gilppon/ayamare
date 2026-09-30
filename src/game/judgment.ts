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

export function scoreFor(
  _judgment: Judgment,
  combo: number,
  base: number
): number {
  return Math.round(base * comboMultiplier(combo));
}

export function calculateAccuracy(
  counts: JudgmentCounts,
  total: number
): number {
  if (total <= 0) return 0;
  return (
    (counts.PERFECT * 1 +
      counts.GREAT * 0.8 +
      counts.GOOD * 0.6 +
      counts.BAD * 0.35) /
    total
  );
}
