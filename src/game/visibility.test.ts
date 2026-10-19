import { describe, expect, it } from "vitest";
import { buildChart } from "./chart";
import { buildDailyChart } from "./daily";
import {
  DESPAWN_BEHIND,
  SPAWN_AHEAD,
  SPEEDUP_EXPONENT,
  isNoteVisible,
  noteFallY,
  selectPressTarget,
  speedUpRemainingRatio,
  visibleNoteWindow,
} from "./visibility";

describe("isNoteVisible", () => {
  it("스폰 전에는 보이지 않는다", () => {
    expect(isNoteVisible(10, 10 - SPAWN_AHEAD - 0.01, "pending")).toBe(false);
    expect(isNoteVisible(10, 10 - SPAWN_AHEAD + 0.01, "pending")).toBe(true);
  });

  it("STAGE1 전 노트가 스폰→판정선까지 중간 소멸 없이 연속 표시된다", () => {
    const chart = buildChart("stage1");
    expect(chart.notes.length).toBeGreaterThan(20);
    for (const n of chart.notes) {
      if (n.gimmick === "fake") continue;
      // 50ms 간격으로 스폰~소멸 구간 전수 검사: 한 번이라도 false면 중간 소멸 버그
      let gaps = 0;
      for (let t = n.time - SPAWN_AHEAD + 0.01; t < n.time + DESPAWN_BEHIND; t += 0.05) {
        if (!isNoteVisible(n.time, t, "pending")) gaps++;
      }
      expect(gaps).toBe(0);
      // 소멸 경계 확인
      expect(isNoteVisible(n.time, n.time + DESPAWN_BEHIND + 0.01, "pending")).toBe(false);
      expect(isNoteVisible(n.time, n.time + DESPAWN_BEHIND - 0.01, "pending")).toBe(true);
    }
  });

  it("hit 상태만 즉시 소멸, miss는 유지", () => {
    expect(isNoteVisible(5, 5, "hit")).toBe(false);
    expect(isNoteVisible(5, 5, "miss")).toBe(true);
    expect(isNoteVisible(5, 5, "holding")).toBe(true);
  });
});

describe("selectPressTarget", () => {
  it("윈도우 내 가장 빠른 노트를 우선 선택 (8분박자 뒷노트 선점 버그 방지)", () => {
    const chart = buildChart("stage1");
    // 같은 레인에 230ms 간격으로 두 노트 배치
    const notes = [
      { ...chart.notes[0], id: 1, time: 10, lane: 1 as const },
      { ...chart.notes[0], id: 2, time: 10.23, lane: 1 as const },
    ];
    const stateOf = () => "pending" as const;
    // 첫 노트 기준 +200ms에 누르면: 구규칙은 뒷노트(30ms) 선택, 신규칙은 앞노트 선택
    const picked = selectPressTarget(notes, stateOf, 1, 10.2, 0.26);
    expect(picked?.id).toBe(1);
  });

  it("윈도우 밖이면 null, fake는 제외", () => {
    const chart = buildChart("stage1");
    const notes = [
      { ...chart.notes[0], id: 1, time: 10, lane: 0 as const },
      { ...chart.notes[0], id: 2, time: 10.1, lane: 0 as const, gimmick: "fake" as const },
    ];
    expect(selectPressTarget(notes, () => "pending", 0, 11, 0.26)).toBe(null);
    const picked = selectPressTarget(notes, () => "pending", 0, 10.05, 0.26);
    expect(picked?.id).toBe(1);
  });
});

describe("visibleNoteWindow (P-01 이진 탐색 윈도우)", () => {
  const mk = (times: number[]) =>
    times.map((t, i) => ({
      id: i,
      time: t,
      lane: 0 as const,
      action: "bow15" as const,
      hold: 0,
    }));

  it("전수 필터와 동일한 결과를 준다", () => {
    const times = Array.from({ length: 200 }, (_, i) => i * 0.25);
    const notes = mk(times);
    for (const now of [0, 1.3, 12.7, 49.9, 60]) {
      const { start, end } = visibleNoteWindow(notes, now);
      const win = notes.slice(start, end);
      const all = notes.filter((n) => isNoteVisible(n.time, now, "pending"));
      expect(win.map((n) => n.id)).toEqual(all.map((n) => n.id));
    }
  });

  it("윈도우가 실제로 좁다 (O(N) → O(윈도우))", () => {
    const notes = mk(Array.from({ length: 500 }, (_, i) => i * 0.2));
    const { start, end } = visibleNoteWindow(notes, 50);
    expect(end - start).toBeLessThan(notes.length / 4);
  });

  it("모든 스테이지/데일리 채보가 time 오름차순 불변식을 만족한다", () => {
    for (const stage of ["stage1", "stage2", "stage3", "stage4", "stage5"]) {
      const notes = buildChart(stage).notes;
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
      }
    }
    const d = buildDailyChart("2026-09-30").notes;
    for (let i = 1; i < d.length; i++) {
      expect(d[i].time).toBeGreaterThanOrEqual(d[i - 1].time);
    }
  });

  it("빈 배열 / 범위 밖에서는 빈 윈도우", () => {
    expect(visibleNoteWindow([], 0)).toEqual({ start: 0, end: 0 });
    const notes = mk([10, 11]);
    expect(visibleNoteWindow(notes, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("noteFallY (speedUp 기믹 곡선)", () => {
  const HIT = 400;
  const SPEED = 200;

  it("B-02 회귀: 마지막 1초에 등속보다 뒤처지지 않는다 (기존 d^1.6 은 감속)", () => {
    for (const d of [0.1, 0.25, 0.5, 0.75]) {
      // 보정 전 지수 1.6 은 d 에서 뒤처진다 (=멈춰 보인다)
      expect(Math.pow(d, 1.6)).toBeLessThan(d);
      // 보정 후 비율은 d 이상이어야 마지막 구간이 정방향 가속이다
      expect(speedUpRemainingRatio(d)).toBeGreaterThanOrEqual(d);
    }
  });

  it("d=1 에서 등속 곡선과 이어지고, d→0 에서 판정선에 정확히 도달한다", () => {
    expect(SPEEDUP_EXPONENT).toBeLessThan(1);
    expect(noteFallY(11, 10, HIT, SPEED)).toBeCloseTo(HIT - SPEED, 6);
    expect(noteFallY(10, 10, HIT, SPEED)).toBeCloseTo(HIT, 6);
  });

  it("판정선을 지난 뒤 역주행하지 않는다 (Y 는 hitLineY 를 넘지 않는다)", () => {
    // noteTime=0 기준. now>0 이면 이미 판정선을 지난 상태(d<0).
    for (const now of [0.1, 0.5, 1.0, 3.0]) {
      expect(noteFallY(0, now, HIT, SPEED)).toBeLessThanOrEqual(HIT + 1e-9);
    }
  });

  it("1초 이전에는 선형(등속)이라 곡선이 끊기지 않는다", () => {
    // d=1.0 경계에서 좌우 극한이 연속
    const below = noteFallY(2.0, 0.999, HIT, SPEED);
    const above = noteFallY(2.0, 1.0, HIT, SPEED);
    expect(Math.abs(below - above)).toBeLessThan(1);
  });
});
