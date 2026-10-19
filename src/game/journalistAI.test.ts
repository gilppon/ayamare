import { describe, expect, it } from "vitest";
import {
  INITIAL_PRESS_CONTEXT,
  PRAISE_MIN_SAMPLE,
  intensifyQuestion,
  praiseForHit,
  tauntForMiss,
} from "./journalistAI";

describe("journalistAI", () => {
  it("연속 미스면 추궁 수위 상승", () => {
    const calm = tauntForMiss({ ...INITIAL_PRESS_CONTEXT, missStreak: 0 }, 0);
    const hot = tauntForMiss({ ...INITIAL_PRESS_CONTEXT, missStreak: 3 }, 0);
    expect(calm).not.toBe(hot);
    expect(hot).toMatch(/연속|1면|고개/);
  });

  it("분노 80+면 분노 멘트", () => {
    expect(
      tauntForMiss({ ...INITIAL_PRESS_CONTEXT, anger: 85 }, 0)
    ).toMatch(/분노|임계치/);
  });

  it("PERFECT 연속이면 칭찬 수위 상승", () => {
    expect(
      praiseForHit({ ...INITIAL_PRESS_CONTEXT, perfectStreak: 6 }, 0)
    ).toMatch(/PERFECT|공기/);
  });

  it("질문 강화/완화", () => {
    const base = "주가가 14% 폭락했습니다.";
    expect(
      intensifyQuestion(base, { ...INITIAL_PRESS_CONTEXT, judged: 12, missStreak: 3 }, 0)
    ).not.toBe(base);
    expect(
      intensifyQuestion(base, { ...INITIAL_PRESS_CONTEXT, judged: 12, combo: 25 }, 0)
    ).toMatch(/기세|잘하고/);
  });

  it("B-13 회귀: 표본이 부족하면 호평 꼬리가 붙지 않는다", () => {
    // 미플레이 상태의 accuracy 는 1 이라 이전에는 매 런 첫 질문이 호평으로 끝났다
    expect(PRAISE_MIN_SAMPLE).toBeGreaterThan(0);
    expect(intensifyQuestion("질문 원문", INITIAL_PRESS_CONTEXT, 0)).toBe("질문 원문");
    expect(
      intensifyQuestion("질문 원문", { ...INITIAL_PRESS_CONTEXT, judged: PRAISE_MIN_SAMPLE - 1 }, 0)
    ).toBe("질문 원문");
    expect(
      intensifyQuestion("질문 원문", { ...INITIAL_PRESS_CONTEXT, judged: PRAISE_MIN_SAMPLE }, 0)
    ).not.toBe("질문 원문");
  });
});
