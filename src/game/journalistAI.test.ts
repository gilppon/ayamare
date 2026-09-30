import { describe, expect, it } from "vitest";
import {
  INITIAL_PRESS_CONTEXT,
  castNextQuestion,
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
      intensifyQuestion(base, { ...INITIAL_PRESS_CONTEXT, missStreak: 3 }, 0)
    ).not.toBe(base);
    expect(
      intensifyQuestion(base, { ...INITIAL_PRESS_CONTEXT, combo: 25 }, 0)
    ).toMatch(/기세|잘하고/);
  });

  it("다음 질문자 캐스팅", () => {
    expect(castNextQuestion({ ...INITIAL_PRESS_CONTEXT, anger: 80 }, 1)).toBe("boss");
    expect(castNextQuestion(INITIAL_PRESS_CONTEXT, 0)).toBe("rookie");
  });
});
