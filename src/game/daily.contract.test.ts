import { describe, expect, it } from "vitest";
import { DAILY_TOTAL_BARS, buildDailyChart, getDailyKey } from "./daily";
import { STAGE_BPMS } from "./constants";

/**
 * 데일리 챌린지 채보 계약.
 *
 * C-07: UI 는 3언어로 "60초 속죄" 라고 광고하는데 실제 길이는 약 38초였다
 *       (18마디 @120bpm). 계약과 구현이 어긋나지 않게 1분으로 맞춘다.
 * C-08: 주석에 적힌 "도게자는 마디당 1개 이하" 규칙이 코드에 없었고,
 *       균등 4선택이라 도게자가 매 마디 25% 를 차지했다.
 * C-09: 마디당 보장 홀드 노트가 밀도 루프 노트와 (레인, 박자) 가 겹칠 수 있어
 *       어떤 노트를 쳐야 하는지 입력이 모호해졌다.
 */
const KEYS = Array.from({ length: 30 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`);

describe("데일리 차트 계약", () => {
  it("C-07: 광고(60초)와 실제 길이가 어긋나지 않는다", () => {
    for (const key of KEYS.slice(0, 7)) {
      const chart = buildDailyChart(key);
      expect(chart.duration).toBeGreaterThanOrEqual(55);
      expect(chart.duration).toBeLessThanOrEqual(70);
    }
  });

  it("C-07: 같은 날짜 키는 항상 같은 차트를 만든다 (결정적)", () => {
    expect(buildDailyChart("2026-03-01")).toEqual(buildDailyChart("2026-03-01"));
    expect(buildDailyChart("2026-03-01")).not.toEqual(buildDailyChart("2026-03-02"));
  });

  it("노트가 정렬되어 있고 유일 id 를 갖는다", () => {
    const chart = buildDailyChart("2026-03-05");
    for (let i = 1; i < chart.notes.length; i++) {
      expect(chart.notes[i].time).toBeGreaterThanOrEqual(chart.notes[i - 1].time);
    }
    expect(new Set(chart.notes.map((n) => n.id)).size).toBe(chart.notes.length);
  });

  it("C-09: 같은 (레인, 시각) 에 노트가 둘 이상 존재하지 않는다", () => {
    for (const key of KEYS) {
      const seen = new Set<string>();
      for (const n of buildDailyChart(key).notes) {
        const k = `${n.time.toFixed(4)}:${n.lane}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it("C-08: 도게자는 마디당 최대 1개다", () => {
    const barSec = (60 / STAGE_BPMS.daily) * 4;
    for (const key of KEYS) {
      const perBar = new Map<number, number>();
      for (const n of buildDailyChart(key).notes) {
        if (n.lane !== 3) continue;
        const bar = Math.floor(n.time / barSec);
        perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
      }
      for (const [bar, count] of perBar) {
        expect(count, `${key} ${bar}마디`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("마디당 보장 홀드가 실제로 존재한다", () => {
    const chart = buildDailyChart("2026-03-07");
    expect(chart.notes.some((n) => n.hold > 0)).toBe(true);
  });

  it("카운트인 구간에는 노트를 놓지 않는다", () => {
    const barSec = (60 / STAGE_BPMS.daily) * 4;
    for (const n of buildDailyChart("2026-03-09").notes) {
      expect(Math.floor(n.time / barSec)).toBeGreaterThanOrEqual(2);
    }
  });

  it("3언어로 서브타이틀을 채운다", () => {
    expect(buildDailyChart("2026-03-01", "ko").subtitle).toBeTruthy();
    expect(buildDailyChart("2026-03-01", "en").subtitle).toBeTruthy();
    expect(buildDailyChart("2026-03-01", "ja").subtitle).toBeTruthy();
  });

  it("getDailyKey 는 로컬 날짜를 YYYY-MM-DD 로 만든다", () => {
    expect(getDailyKey(new Date(2026, 2, 7))).toBe("2026-03-07");
    expect(DAILY_TOTAL_BARS).toBe(30);
  });
});