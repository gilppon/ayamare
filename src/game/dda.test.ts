import { describe, expect, it } from "vitest";
import { ddaTimingScale, initialDda, updateDda, type DdaState } from "./dda";

describe("dda", () => {
  it("연속 미스면 즉시 관대해진다", () => {
    let s = initialDda();
    s = updateDda(s, "MISS");
    s = updateDda(s, "MISS");
    const before = s.windowBoost;
    s = updateDda(s, "MISS");
    expect(s.windowBoost).toBeGreaterThan(before);
    expect(s.damageScale).toBeLessThan(1);
  });

  it("잘하면 기준선으로 복귀한다", () => {
    let s: DdaState = { history: [], windowBoost: 1.2, damageScale: 0.8 };
    for (let i = 0; i < 12; i++) s = updateDda(s, "PERFECT");
    expect(s.windowBoost).toBeLessThan(1.2);
    expect(s.windowBoost).toBeGreaterThanOrEqual(1.0);
  });

  it("부스트 상한 1.3", () => {
    let s = initialDda();
    for (let i = 0; i < 30; i++) s = updateDda(s, "MISS");
    expect(s.windowBoost).toBeLessThanOrEqual(1.3);
    expect(s.damageScale).toBeGreaterThanOrEqual(0.7);
  });

  it("타이밍 스케일 합성", () => {
    expect(ddaTimingScale(1.12, { history: [], windowBoost: 1.2, damageScale: 1 })).toBeCloseTo(1.344);
  });
});
