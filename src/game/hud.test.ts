import { describe, expect, it } from "vitest";
import { ANGER_STEPS, angerColor, angerPips } from "./constants";

describe("angerPips (I-09)", () => {
  it("0~100 을 0~ANGER_STEPS 개의 pip 로 매핑한다", () => {
    expect(angerPips(0)).toBe(0);
    expect(angerPips(100)).toBe(ANGER_STEPS);
  });

  it("구간 경계에서 단조 증가한다", () => {
    let prev = -1;
    for (let a = 0; a <= 100; a += 2) {
      const p = angerPips(a);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(ANGER_STEPS);
      prev = p;
    }
  });

  it("값이 범위를 벗어나도 clamp 한다", () => {
    expect(angerPips(-50)).toBe(0);
    expect(angerPips(999)).toBe(ANGER_STEPS);
  });

  it("20% 마다 한 단계씩 차오른다", () => {
    // 100 / 5 = 20 단위
    expect(angerPips(10)).toBe(1);
    expect(angerPips(30)).toBe(2);
    expect(angerPips(50)).toBe(3);
    expect(angerPips(70)).toBe(4);
    expect(angerPips(90)).toBe(ANGER_STEPS);
  });
});

describe("angerColor", () => {
  it("기존 임계값(30/55/80) 을 유지한다", () => {
    expect(angerColor(0)).toBe("#34d399");
    expect(angerColor(29)).toBe("#34d399");
    expect(angerColor(30)).toBe("#facc15");
    expect(angerColor(54)).toBe("#facc15");
    expect(angerColor(55)).toBe("#fb923c");
    expect(angerColor(79)).toBe("#fb923c");
    expect(angerColor(80)).toBe("#f43f5e");
    expect(angerColor(100)).toBe("#f43f5e");
  });

  it("범위를 벗어나도 clamp 후 색을 준다", () => {
    expect(angerColor(-10)).toBe("#34d399");
    expect(angerColor(200)).toBe("#f43f5e");
  });
});
