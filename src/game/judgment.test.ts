import { describe, expect, it } from "vitest";
import {
  ACCURACY_WEIGHT,
  calculateAccuracy,
  comboMultiplier,
  getTimingWindows,
  judgeRelease,
  judgeTap,
} from "./judgment";
import { ANGER_DELTA, STOCK_DELTA, computeGrade } from "./constants";
import type { Judgment, JudgmentCounts } from "./types";

const all = (n: number, key: Judgment): JudgmentCounts => ({
  PERFECT: key === "PERFECT" ? n : 0,
  GREAT: key === "GREAT" ? n : 0,
  GOOD: key === "GOOD" ? n : 0,
  BAD: key === "BAD" ? n : 0,
  MISS: key === "MISS" ? n : 0,
});

describe("judgeTap", () => {
  it("기본 윈도우로 판정한다", () => {
    const w = getTimingWindows(1);
    expect(judgeTap(0.03, "none", w)).toBe("PERFECT");
    expect(judgeTap(0.08, "none", w)).toBe("GREAT");
    expect(judgeTap(0.15, "none", w)).toBe("GOOD");
    expect(judgeTap(0.25, "none", w)).toBe("BAD");
  });

  it("눈물안약 스킬은 GREAT를 PERFECT로 보정한다", () => {
    const w = getTimingWindows(1);
    expect(judgeTap(0.08, "teardrops", w)).toBe("PERFECT");
    expect(judgeTap(0.15, "teardrops", w)).toBe("GOOD");
  });

  it("scale이 크면 관대해진다 (접근성)", () => {
    const strict = getTimingWindows(1);
    const kind = getTimingWindows(1.2);
    // 60ms = 기본 PERFECT(55ms) 초과 → GREAT, 관대 모드에서는 PERFECT
    expect(judgeTap(0.06, "none", strict)).toBe("GREAT");
    expect(judgeTap(0.06, "none", kind)).toBe("PERFECT");
  });
});

describe("judgeRelease", () => {
  it("홀드 릴리즈 규칙을 따른다", () => {
    const w = getTimingWindows(1);
    expect(judgeRelease(0.05, "none", w)).toBe("PERFECT");
    expect(judgeRelease(0.2, "none", w)).toBe("GREAT");
    expect(judgeRelease(0.4, "none", w)).toBe("GOOD");
    expect(judgeRelease(1.0, "none", w)).toBe("BAD");
  });
});

describe("comboMultiplier / accuracy", () => {
  it("콤보 배율은 최대 1.5x", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(50)).toBe(1.5);
    expect(comboMultiplier(999)).toBe(1.5);
  });

  it("정확도 계산", () => {
    expect(
      calculateAccuracy(
        { PERFECT: 1, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 },
        1
      )
    ).toBe(1);
    expect(
      calculateAccuracy(
        { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 1 },
        1
      )
    ).toBe(0);
    expect(calculateAccuracy(
      { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 }, 0
    )).toBe(0);
  });
});

/**
 * B — "아무것도 안 누르기" 보다 "엉뚱하게 누르기" 가 유리했던 구조를 제거한다.
 *
 * 기존: BAD 정확도 0.35 / 주가 -2.5%
 *   → 감을 잃은 플레이어가 "일단 아무 레인이나 치자" 를 합리적 선택으로 받아들였다.
 *   100노트 기준 주가가 8% 남는 결과였다.
 *
 * 계약을 세 채널(정확도 · 주가 · 분노)에 대해 명시적으로 고정한다.
 */
describe("B: 더치면 이득인 구조를 없앤다", () => {
  it("정확도: BAD 는 정확히 0 (MISS 와 동일)", () => {
    expect(ACCURACY_WEIGHT.BAD).toBe(0);
    expect(ACCURACY_WEIGHT.MISS).toBe(0);
    expect(calculateAccuracy(all(100, "BAD"), 100)).toBe(0);
    expect(calculateAccuracy(all(100, "MISS"), 100)).toBe(0);
  });

  it("정확도: 마구치기가 손대지 않음보다 나아지지 않는다", () => {
    const mash = calculateAccuracy(all(100, "BAD"), 100);
    const idle = calculateAccuracy(all(100, "MISS"), 100);
    expect(mash).toBeLessThanOrEqual(idle);
    expect(mash).toBe(idle);
  });

  it("정확도: GOOD 은 여전히 점수를 준다 (무차별 조작과 구분된다)", () => {
    // 마구치기(0) < GOOD 만 반복(0.6) 이 유지되어야 "조금이라도 맞춰치자" 는 동기가 산다
    expect(calculateAccuracy(all(100, "GOOD"), 100)).toBeGreaterThan(
      calculateAccuracy(all(100, "BAD"), 100)
    );
  });

  it("정확도: GOOD 대 BAD 는 실질적 격차를 갖는다", () => {
    // 마구치기가 "어차피 같은 0" 이면 GOOD 을 노릴 이유가 사라진다.
    // 적어도 0.5 이상 벌어져야 방향이 분명하다.
    const gap = ACCURACY_WEIGHT.GOOD - ACCURACY_WEIGHT.BAD;
    expect(gap).toBeGreaterThanOrEqual(0.5);
  });

  it("주가: BAD 손해가 MISS 와 같은 규모다 (이전엔 1/6)", () => {
    expect(STOCK_DELTA.BAD).toBeLessThan(0);
    expect(STOCK_DELTA.MISS).toBeLessThan(0);
    // 이전 -0.025 → -0.09. MISS(-0.14) 와의 비가 1.6배 이내로 좁혀졌다.
    const ratio = Math.abs(STOCK_DELTA.MISS / STOCK_DELTA.BAD);
    expect(ratio).toBeLessThan(2);
    // 이전 비율은 5.6배였다.
    expect(ratio).toBeGreaterThan(1);
  });

  it("주가: BAD 는 그래도 MISS 보다 나쁘지 않아야 한다 (의지는 있었다)", () => {
    expect(STOCK_DELTA.BAD).toBeGreaterThan(STOCK_DELTA.MISS);
  });

  it("분노: BAD 도 분노를 올린다 (속이도록 누를 수 없다)", () => {
    expect(ANGER_DELTA.BAD).toBeGreaterThan(0);
    expect(ANGER_DELTA.BAD).toBeGreaterThanOrEqual(ANGER_DELTA.GOOD);
    // 이전 4 → 7. MISS(9) 와의 격차가 방향성만 남도록.
    expect(ANGER_DELTA.MISS - ANGER_DELTA.BAD).toBeLessThanOrEqual(3);
  });

  it("등급: 마구치기와 손대지 않음이 같은 최하 등급이다", () => {
    expect(computeGrade(calculateAccuracy(all(100, "BAD"), 100))).toBe("F");
    expect(computeGrade(calculateAccuracy(all(100, "MISS"), 100))).toBe("F");
  });

  it("등급: 정확히 노려치면 좋은 등급이 나온다 (보상이 남아 있다)", () => {
    expect(computeGrade(calculateAccuracy(all(100, "PERFECT"), 100))).toBe("SSS");
    expect(computeGrade(calculateAccuracy(all(100, "GREAT"), 100))).toBe("A");
    // GOOD 위주는 중간 이하 — 무작정 누르기의 우위가 없어야 한다
    expect(computeGrade(calculateAccuracy(all(100, "GOOD"), 100))).toBe("C");
  });

  it("정확도 가중치는 0~1 사이이고 단조 감소한다", () => {
    const order: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];
    for (const j of order) {
      expect(ACCURACY_WEIGHT[j]).toBeGreaterThanOrEqual(0);
      expect(ACCURACY_WEIGHT[j]).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < order.length; i++) {
      expect(ACCURACY_WEIGHT[order[i]]).toBeLessThanOrEqual(ACCURACY_WEIGHT[order[i - 1]]);
    }
  });

  /**
   * 게임 규칙 전체가 성립하는지 확인 — 3개 채널의 **정렬 순서가 일치**해야 한다.
   *
   * 정확도 / 주가 / 분노 중 하나라도 순서가 어긋나면 플레이어가 받는
   * 신호가 모순된다 ("더 정확히 치면 불리하다" 같은 상황이 생긴다).
   */
  it("3개 채널의 순서가 일관된다 (더 잘 치는 것이 모든 면에서 유리)", () => {
    const order: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];
    // 정확도: 하강
    for (let i = 1; i < order.length; i++) {
      expect(ACCURACY_WEIGHT[order[i]]).toBeLessThanOrEqual(ACCURACY_WEIGHT[order[i - 1]]);
    }
    // 주가: 하강
    for (let i = 1; i < order.length; i++) {
      expect(STOCK_DELTA[order[i]]).toBeLessThanOrEqual(STOCK_DELTA[order[i - 1]]);
    }
    // 분노: 상승 (좋게 칠수록 분노가 빨리 내린다)
    for (let i = 1; i < order.length; i++) {
      expect(ANGER_DELTA[order[i]]).toBeGreaterThanOrEqual(ANGER_DELTA[order[i - 1]]);
    }
  });

  it("[핵심] 더치면 이득 구간이 존재하지 않는다 (정확도 기준)", () => {
    // 임의의 두 판정에 대해, 더 잘 친 쪽의 정확도가 낮아지는 경우는 없어야 한다.
    const order: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];
    for (let i = 1; i < order.length; i++) {
      const better = order[i - 1];
      const worse = order[i];
      const withBetter = calculateAccuracy(all(100, better), 100);
      const withWorse = calculateAccuracy(all(100, worse), 100);
      expect(withBetter).toBeGreaterThanOrEqual(withWorse);
    }
  });

  it("최악의 선택은 아예 손해다 (모두 손해이며 방어 불가능)", () => {
    for (const j of ["BAD", "MISS"] as Judgment[]) {
      expect(STOCK_DELTA[j]).toBeLessThan(0);
      expect(ANGER_DELTA[j]).toBeGreaterThan(0);
      expect(ACCURACY_WEIGHT[j]).toBe(0);
    }
  });
});
