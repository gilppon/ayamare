import type { Judgment } from "./types";

export interface DdaState {
  history: Judgment[];
  windowBoost: number;
  damageScale: number;
}

export const DDA_WINDOW = 20;

export function initialDda(): DdaState {
  return { history: [], windowBoost: 1, damageScale: 1 };
}

function goodRate(h: Judgment[]): number {
  if (h.length === 0) return 1;
  const good = h.filter((j) => j === "PERFECT" || j === "GREAT" || j === "GOOD").length;
  return good / h.length;
}

function tailMissStreak(h: Judgment[]): number {
  let s = 0;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i] === "MISS" || h[i] === "BAD") s++;
    else break;
  }
  return s;
}

/** 최신 판정 1개를 반영해 DDA 상태 갱신 (순수함수) */
export function updateDda(prev: DdaState, latest: Judgment): DdaState {
  const history = [...prev.history, latest].slice(-DDA_WINDOW);
  let windowBoost = prev.windowBoost;
  let damageScale = prev.damageScale;

  const rate = goodRate(history);
  const streak = tailMissStreak(history);

  if (streak >= 3) {
    // 급락 방지: 즉시 관대 모드
    windowBoost = Math.min(1.3, windowBoost + 0.1);
    damageScale = Math.max(0.7, damageScale - 0.15);
  } else if (history.length >= 8) {
    if (rate < 0.5) {
      windowBoost = Math.min(1.3, windowBoost + 0.06);
      damageScale = Math.max(0.7, damageScale - 0.08);
    } else if (rate < 0.7) {
      windowBoost = Math.min(1.2, windowBoost + 0.03);
      damageScale = Math.max(0.8, damageScale - 0.04);
    } else if (rate > 0.9) {
      // 잘하면 기준선으로 복귀 (보상: 데미지 정상화)
      windowBoost = Math.max(1.0, windowBoost - 0.04);
      damageScale = Math.min(1.0, damageScale + 0.05);
    } else {
      windowBoost = Math.max(1.0, windowBoost - 0.01);
      damageScale = Math.min(1.0, damageScale + 0.01);
    }
  }

  return { history, windowBoost, damageScale };
}

/** DDA 부스트 적용된 타이밍 스케일 */
export function ddaTimingScale(base: number, dda: DdaState): number {
  return Math.min(1.8, base * dda.windowBoost);
}
