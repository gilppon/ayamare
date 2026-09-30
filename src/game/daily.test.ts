import { describe, expect, it } from "vitest";
import { buildDailyChart, getDailyKey, mulberry32 } from "./daily";

describe("daily", () => {
  it("같은 키는 같은 차트", () => {
    const a = buildDailyChart("2026-09-30");
    const b = buildDailyChart("2026-09-30");
    expect(a.notes.length).toBe(b.notes.length);
    expect(a.notes.map((n) => [n.time, n.lane])).toEqual(
      b.notes.map((n) => [n.time, n.lane])
    );
  });

  it("다른 날짜는 다른 차트", () => {
    const a = buildDailyChart("2026-09-30");
    const b = buildDailyChart("2026-10-01");
    expect(a.notes.length).toBeGreaterThan(20);
    expect(
      a.notes.map((n) => n.time).join(",") ===
        b.notes.map((n) => n.time).join(",")
    ).toBe(false);
  });

  it("mulberry32는 [0,1) 범위", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("getDailyKey 형식", () => {
    expect(getDailyKey(new Date(2026, 8, 30))).toBe("2026-09-30");
  });
});
