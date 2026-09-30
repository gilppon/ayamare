import { describe, expect, it } from "vitest";
import { buildChart } from "./chart";
import {
  DESPAWN_BEHIND,
  SPAWN_AHEAD,
  isNoteVisible,
  selectPressTarget,
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
