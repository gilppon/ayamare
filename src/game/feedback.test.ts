import { describe, expect, it } from "vitest";
import { TIER_WEIGHT, planFeedback, type FeedbackTier } from "./feedback";
import { JUDGMENTS } from "./constants";
import type { Judgment } from "./types";

const ALL: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];

describe("planFeedback", () => {
  it("I-07: 모션 감소 모드에서는 모든 움직임이 제거된다", () => {
    for (const j of ALL) {
      for (const dogeza of [false, true]) {
        const p = planFeedback(j, dogeza, true);
        expect(p.flashes).toBe(0);
        expect(p.sparks).toBe(0);
        expect(p.shockwave).toBe(false);
        expect(p.zoom).toBe(0);
        expect(p.hitstopMs).toBe(0);
        expect(p.cameraShake).toBe(false);
      }
    }
  });

  it("I-07: 모션 감소 모드에서도 정보는 사라지지 않는다 (팝업 + 정지 링 + 햅틱)", () => {
    for (const j of ALL) {
      const p = planFeedback(j, false, true);
      expect(p.popup).toBe(true);
      // 움직임 대신 "무언가 일어났다" 는 색 신호를 남긴다
      expect(p.solidRing).toBe(true);
      expect(p.haptic).not.toBe("none");
      expect(p.color).toBe(JUDGMENTS[j].color);
    }
  });

  it("PERFECT > GREAT > GOOD 강도 위계를 지킨다", () => {
    const w = (j: Judgment) => TIER_WEIGHT[planFeedback(j).tier];
    expect(w("PERFECT")).toBeGreaterThan(w("GREAT"));
    expect(w("GREAT")).toBeGreaterThan(w("GOOD"));
  });

  it("도게자 PERFECT 는 최고 등급 climax 이다", () => {
    const normal = planFeedback("PERFECT", false);
    const dogeza = planFeedback("PERFECT", true);
    expect(dogeza.tier).toBe("climax");
    expect(TIER_WEIGHT[dogeza.tier]).toBeGreaterThan(TIER_WEIGHT[normal.tier]);
    // 클라이맥스는 기존 연출보다도 강화된다
    expect(dogeza.sparks).toBeGreaterThan(normal.sparks);
    expect(dogeza.flashes).toBeGreaterThan(normal.flashes);
    expect(dogeza.hitstopMs).toBeGreaterThan(normal.hitstopMs);
    expect(dogeza.zoom).toBeGreaterThan(normal.zoom);
  });

  it("MISS 는 GOOD 보다 강한 신호를 준다 (아무 일도 안 일어난 신호)", () => {
    const miss = planFeedback("MISS");
    const good = planFeedback("GOOD");
    expect(miss.flashes).toBeGreaterThan(good.flashes);
    expect(TIER_WEIGHT[miss.tier]).toBeGreaterThan(TIER_WEIGHT[good.tier]);
  });

  it("같은 판정은 항상 같은 계획을 낸다 (결정적)", () => {
    const a = planFeedback("GREAT");
    const b = planFeedback("GREAT");
    expect(a).toEqual(b);
  });

  it("모든 판정이 팝업을 낸다 (시각 언어가 항상 존재해야 한다)", () => {
    for (const j of ALL) {
      expect(planFeedback(j).popup).toBe(true);
      expect(planFeedback(j, false, true).popup).toBe(true);
    }
  });

  it("모든 판정에 햅틱이 매핑된다", () => {
    expect(planFeedback("PERFECT").haptic).toBe("perfect");
    expect(planFeedback("GREAT").haptic).toBe("great");
    expect(planFeedback("BAD").haptic).toBe("bad");
    expect(planFeedback("MISS").haptic).toBe("miss");
    expect(planFeedback("GOOD").haptic).toBe("bad");
  });

  it("모션 채널이 파티클을 과잉 사용하지 않는다 (시각 노이즈 억제)", () => {
    // PERFECT 1회당 파티클은 10개를 넘지 않는다
    for (const j of ALL) {
      for (const d of [false, true]) {
        expect(planFeedback(j, d).sparks).toBeLessThanOrEqual(10);
      }
    }
  });

  it("tier 는 정의된 값만 사용한다", () => {
    const valid: FeedbackTier[] = ["none", "light", "medium", "heavy", "climax"];
    for (const j of ALL) {
      for (const d of [false, true]) {
        for (const r of [false, true]) {
          expect(valid).toContain(planFeedback(j, d, r).tier);
        }
      }
    }
  });
});
