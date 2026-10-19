import { describe, expect, it } from "vitest";
import { DDA_WINDOW, ddaTimingScale, initialDda, updateDda, type DdaState } from "./dda";
import { BAD_MS, GREAT_MS, PERFECT_MS } from "./constants";
import { getTimingWindows } from "./judgment";
import { effectiveTimingScale } from "./skills";
import type { Judgment, SkillType } from "./types";

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

/**
 * B-14 회귀.
 *
 * 게임 루프(RAF, `useEffect(..., [])`) 는 최초 렌더의 `timingWindows` 를 닫고 있었다.
 * 그 결과 DDA 가 올린 윈도우가 **탭 판정**에는 반영되지만
 * **MISS 판정 / 홀드 강제 해제**에는 반영되지 않아 어시스트 모드가 반쪽짜리가 됐다.
 *
 * 루프는 이제 `loopCtxRef` 로 값을 읽는다. 렌더 코드 자체는 테스트 대상이 아니므로
 * "값이 진짜 갱신되는가" 를 고정한다.
 */
describe("DDA 윈도우 부스트 전파 (B-14)", () => {
  const seq = (...js: Judgment[]) => js.reduce((s, j) => updateDda(s, j), initialDda());

  it("MISS 연속 3회면 실제 MISS 판정 윈도우가 커진다", () => {
    const baseBad = ddaTimingScale(1, initialDda());
    const after = seq("MISS", "MISS", "MISS");

    expect(after.windowBoost).toBeGreaterThan(1);
    const boostedBad = ddaTimingScale(1, after);
    expect(boostedBad).toBeGreaterThan(baseBad);

    // 초 단위 MISS 윈도우도 함께 커져야 한다
    const missWindowBase = getTimingWindows(1).bad / 1000;
    const missWindowAfter = getTimingWindows(boostedBad).bad / 1000;
    expect(missWindowAfter).toBeGreaterThan(missWindowBase);
  });

  it("미스가 쌓일수록 MISS 윈도우가 단조 증가하고 1.3 에서 멈춘다", () => {
    let d = initialDda();
    let prev = ddaTimingScale(1, d);
    for (let i = 0; i < 9; i++) {
      d = updateDda(d, "MISS");
      const now = ddaTimingScale(1, d);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
    expect(prev).toBeLessThanOrEqual(1.3);
  });

  it("완주하면 부스트가 기준선으로 복귀한다 (영구 애드버티지 아님)", () => {
    let d = seq("MISS", "MISS", "MISS", "MISS");
    expect(d.windowBoost).toBeGreaterThan(1);
    for (let i = 0; i < DDA_WINDOW * 3; i++) d = updateDda(d, "PERFECT");
    expect(d.windowBoost).toBeCloseTo(1, 5);
    expect(d.damageScale).toBeCloseTo(1, 5);
  });

  it("스킬·설정 배율과 DDA 배율이 곱해져 모든 윈도우가 동일하게 확대된다", () => {
    const skills = new Set<SkillType>(["steady_hands"]);
    const withSkill = effectiveTimingScale(1, skills);
    expect(withSkill).toBeCloseTo(1.12, 5);

    const finalScale = ddaTimingScale(withSkill, seq("MISS", "MISS", "MISS"));
    const windows = getTimingWindows(finalScale);

    expect(windows.perfect / PERFECT_MS).toBeCloseTo(finalScale, 5);
    expect(windows.great / GREAT_MS).toBeCloseTo(finalScale, 5);
    expect(windows.bad / BAD_MS).toBeCloseTo(finalScale, 5);

    const strict = getTimingWindows(1);
    expect(windows.perfect).toBeGreaterThan(strict.perfect);
    expect(windows.bad).toBeGreaterThan(strict.bad);
  });
});
