import { describe, expect, it } from "vitest";
import {
  calculateAccuracy,
  comboMultiplier,
  getTimingWindows,
  judgeRelease,
  judgeTap,
} from "./judgment";

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
