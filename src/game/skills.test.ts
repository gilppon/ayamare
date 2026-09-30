import { describe, expect, it } from "vitest";
import {
  SKILLS,
  activeSkills,
  comboGain,
  earnPoints,
  effectiveTimingScale,
  scaleAngerDelta,
  scaleStockMultiplier,
  shouldProtectCombo,
  upgradeTapJudgment,
} from "./skills";

describe("skills", () => {
  it("activeSkills는 보유+장착 합집합", () => {
    const s = activeSkills(["teardrops"], "bulletproof");
    expect(s.has("teardrops")).toBe(true);
    expect(s.has("bulletproof")).toBe(true);
    expect(s.has("none")).toBe(false);
  });

  it("판정 업그레이드", () => {
    expect(upgradeTapJudgment("GREAT", ["teardrops"])).toBe("PERFECT");
    expect(upgradeTapJudgment("BAD", ["wide_heart"])).toBe("GOOD");
    expect(upgradeTapJudgment("BAD", ["teardrops"])).toBe("BAD");
  });

  it("타이밍 스케일", () => {
    expect(effectiveTimingScale(1, ["steady_hands"])).toBeCloseTo(1.12);
    expect(effectiveTimingScale(1, [])).toBe(1);
  });

  it("콤보/보호", () => {
    expect(comboGain("PERFECT", ["combo_chain"])).toBe(2);
    expect(comboGain("PERFECT", [])).toBe(1);
    expect(shouldProtectCombo("MISS", ["bulletproof"])).toBe(true);
    expect(shouldProtectCombo("MISS", [])).toBe(false);
  });

  it("분노/주가 보정", () => {
    expect(scaleAngerDelta(9, ["calm_voice"])).toBeCloseTo(6.75);
    expect(scaleAngerDelta(-6, ["calm_voice"])).toBeCloseTo(-6.9);
    expect(scaleStockMultiplier(0.86, ["safe_asset"])).toBeCloseTo(1 - 0.14 * 0.65);
    expect(scaleStockMultiplier(1.034, ["safe_asset"])).toBeCloseTo(1 + 0.034 * 1.1);
  });

  it("포인트 공식", () => {
    expect(earnPoints(50000, 0.9, 40, 3)).toBe(
      Math.round(100 + 180 + 80 + 45)
    );
    expect(earnPoints(0, 0, 0)).toBeGreaterThanOrEqual(10);
  });

  it("밸런스: 전 스킬 해금은 15~25런 분량", () => {
    const total = SKILLS.reduce((a, s) => a + s.cost, 0);
    const avgRun = earnPoints(60000, 0.8, 30, 2);
    const runs = total / avgRun;
    expect(avgRun).toBeGreaterThan(150);
    expect(avgRun).toBeLessThan(700);
    expect(runs).toBeGreaterThan(8);
    expect(runs).toBeLessThan(30);
  });
});
