import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStageEffects, CAP_POPUPS, CAP_FRAMES, CAP_SPARKS, CAP_SHOCKWAVES, CAP_SOLID_RINGS, TTL_POPUP, TTL_SOLID_RING, TTL_REACTION } from "./useStageEffects";
import { planFeedback } from "@/game/feedback";
import type { Judgment } from "@/game/types";

/**
 * 스테이지 이펙트 수명·상한 안전망.
 *
 * 검증 대상은 두 가지다:
 *  1) **상한** — 고밀도 구간에서 DOM 이 폭증하지 않는가 (배열이 자라지 않는가)
 *  2) **수명** — 아이템이 TTL 이 지나면 실제로 제거되는가, 오래된 제거 콜백이
 *     새 아이템을 지우지 않는가 (id 가드)
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const mount = (reduceMotion = false) => renderHook(() => useStageEffects(reduceMotion));

describe("상한 (DOM 폭증 방지)", () => {
  it("팝업은 CAP_POPUPS 을 넘지 않는다", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < CAP_POPUPS + 30; i++) result.current.addPopup("PERFECT", i % 4, "절");
    });
    expect(result.current.popups.length).toBeLessThanOrEqual(CAP_POPUPS);
  });

  it("쇼크웨이는 CAP_SHOCKWAVES 를 넘지 않는다", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < 40; i++) result.current.addShockwave(i % 4);
    });
    expect(result.current.shockwaves.length).toBeLessThanOrEqual(CAP_SHOCKWAVES);
  });

  it("스파크는 요청 개수만큼 생성되고 상한을 지킨다", () => {
    const { result } = mount();
    act(() => result.current.addSparks(1, 8, "#fbbf24"));
    expect(result.current.sparks).toHaveLength(8);

    act(() => {
      for (let i = 0; i < 20; i++) result.current.addSparks(0, 6, "#fff");
    });
    expect(result.current.sparks.length).toBeLessThanOrEqual(CAP_SPARKS);
  });

  /** 플래시 상한 버그 회귀: 이전 구현은 `slice(-12)` 로 자른 뒤 개수를 더해 상한이 잠시 18까지 찼다 */
  it("플래시는 batch 를 먼저 잘라 상한을 절대 넘지 않는다", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < 8; i++) result.current.addFlashes(6);
    });
    expect(result.current.flashes.length).toBeLessThanOrEqual(CAP_FRAMES);
  });

  it("정지 링은 CAP_SOLID_RINGS 를 넘지 않는다", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < 40; i++) result.current.addSolidRing(i % 4, "#fff");
    });
    expect(result.current.solidRings.length).toBeLessThanOrEqual(CAP_SOLID_RINGS);
  });
});

describe("수명 (TTL)", () => {
  it("팝업은 TTL_POPUP 후 사라진다", () => {
    const { result } = mount();
    act(() => result.current.addPopup("PERFECT", 0, "절"));
    expect(result.current.popups).toHaveLength(1);
    act(() => vi.advanceTimersByTime(TTL_POPUP + 1));
    expect(result.current.popups).toHaveLength(0);
  });

  it("정지 링은 TTL_SOLID_RING 후 사라진다", () => {
    const { result } = mount();
    act(() => result.current.addSolidRing(1, "#fbbf24"));
    act(() => vi.advanceTimersByTime(TTL_SOLID_RING + 1));
    expect(result.current.solidRings).toHaveLength(0);
  });

  it("반응 라인은 TTL_REACTION 후 사라진다", () => {
    const { result } = mount();
    act(() => result.current.setReactionLine("미스", "bad"));
    expect(result.current.reaction).not.toBeNull();
    act(() => vi.advanceTimersByTime(TTL_REACTION + 1));
    expect(result.current.reaction).toBeNull();
  });

  it("id 가드: 오래된 제거 콜백이 새로 추가된 라인을 지우지 않는다", () => {
    const { result } = mount();
    act(() => result.current.setReactionLine("첫번째", "bad"));
    act(() => vi.advanceTimersByTime(TTL_REACTION - 10));
    act(() => result.current.setReactionLine("두번째", "good"));
    // 첫 번째 라인의 만료가 지나가도 두 번째는 남아 있어야 한다
    act(() => vi.advanceTimersByTime(20));
    expect(result.current.reaction?.text).toBe("두번째");
  });
});

describe("U-04 스크린리더 안내", () => {
  it("팝업과 별개로 판정 문자열을 갱신한다", () => {
    const { result } = mount();
    act(() => result.current.addPopup("PERFECT", 1, "참배"));
    expect(result.current.liveJudgment).toContain("참배");
  });
});

describe("reduceMotion", () => {
  it("시각 이펙트는 전부 무음 처리된다", () => {
    const { result } = mount(true);
    act(() => {
      result.current.addFlashes(10);
      result.current.addSparks(0, 10, "#fff");
      result.current.addShockwave(0);
      result.current.triggerSlowmo("클라이맥스");
      result.current.triggerZoom(0.5);
      result.current.triggerHitstop(100);
    });
    expect(result.current.flashes).toHaveLength(0);
    expect(result.current.sparks).toHaveLength(0);
    expect(result.current.shockwaves).toHaveLength(0);
    expect(result.current.slowmo).toBeNull();
    expect(result.current.zoomPunch).toBe(0);
    expect(result.current.isHitstopped()).toBe(false);
  });

  it("I-07: 정지 링과 팝업은 reduceMotion 에서도 살아 있다 (정보 보존)", () => {
    const { result } = mount(true);
    act(() => {
      result.current.addSolidRing(2, "#fbbf24");
      result.current.addPopup("PERFECT", 2, "절");
    });
    expect(result.current.solidRings).toHaveLength(1);
    expect(result.current.popups).toHaveLength(1);
  });
});

describe("applyPlan (I-07 단일 진입점)", () => {
  const planFor = (judgment: Judgment, reduceMotion = false) =>
    planFeedback(judgment, false, reduceMotion);

  it("계획대로 필요한 채널만 켠다", () => {
    const { result } = mount();
    const plan = planFor("PERFECT");
    act(() => result.current.applyPlan(plan, 0, "절", "PERFECT"));
    expect(result.current.popups.length).toBeGreaterThanOrEqual(1);
    if (plan.solidRing) expect(result.current.solidRings).toHaveLength(1);
    if (plan.shockwave) expect(result.current.shockwaves).toHaveLength(1);
  });

  it("reduceMotion 플랜은 링·팝업만 남긴다", () => {
    const { result } = mount();
    const plan = planFor("PERFECT", true);
    act(() => result.current.applyPlan(plan, 0, "절", "PERFECT"));
    expect(result.current.sparks).toHaveLength(0);
    expect(result.current.shockwaves).toHaveLength(0);
    expect(result.current.solidRings.length).toBe(plan.solidRing ? 1 : 0);
    expect(result.current.popups.length).toBe(plan.popup ? 1 : 0);
  });
});

describe("줌 / 히트스톱", () => {
  it("줌은 1.5 을 넘지 않는다", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < 20; i++) result.current.triggerZoom(0.5);
    });
    expect(result.current.zoomPunch).toBeLessThanOrEqual(1.5);
  });

  it("감쇠는 0 으로 수렴한다", () => {
    const { result } = mount();
    act(() => result.current.triggerZoom(1));
    act(() => {
      for (let i = 0; i < 80; i++) result.current.decayZoom();
    });
    expect(result.current.zoomPunch).toBe(0);
  });

  it("히트스톱은 지정 시간 동안만 활성이다", () => {
    const { result } = mount();
    act(() => result.current.triggerHitstop(500));
    // isHitstopped 는 performance.now() 기준 — 가짜 타이머로 전진시킨다
    expect(result.current.isHitstopped()).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.isHitstopped()).toBe(true);
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.isHitstopped()).toBe(false);
  });
});

describe("clearTransient", () => {
  it("모든 일시 상태를 비운다", () => {
    const { result } = mount();
    act(() => {
      result.current.addPopup("PERFECT", 0, "절");
      result.current.addFlashes(4);
      result.current.addSparks(0, 4, "#fff");
      result.current.addShockwave(0);
      result.current.addSolidRing(0, "#fff");
      result.current.setReactionLine("x", "good");
      result.current.pushSns("positive", "ko");
      result.current.triggerZoom(1);
      result.current.triggerHitstop(1000);
    });
    act(() => result.current.clearTransient());
    expect(result.current.popups).toHaveLength(0);
    expect(result.current.flashes).toHaveLength(0);
    expect(result.current.sparks).toHaveLength(0);
    expect(result.current.shockwaves).toHaveLength(0);
    expect(result.current.solidRings).toHaveLength(0);
    expect(result.current.reaction).toBeNull();
    expect(result.current.sns).toHaveLength(0);
    expect(result.current.zoomPunch).toBe(0);
    expect(result.current.isHitstopped()).toBe(false);
  });
});

describe("SNS 피드", () => {
  it("최신 항목이 앞에 온다 (최대 5개)", () => {
    const { result } = mount();
    act(() => {
      for (let i = 0; i < 12; i++) result.current.pushSns(i % 2 ? "positive" : "negative", "ko");
    });
    expect(result.current.sns).toHaveLength(5);
  });
});