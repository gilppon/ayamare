import { describe, expect, it } from "vitest";
import {
  FIRST_STAGE,
  STAGES,
  computeUnlocks,
  isStageId,
  newlyUnlocked,
  prevStage,
  stageDef,
  stageStatus,
  stageTitleKey,
  unlockProgress,
  clearLine,
  type StageId,
} from "./progression";

/**
 * C — 스테이지 진행(해금).
 *
 * 이전엔 6개 스테이지가 **전부 즉시 진입 가능**했다. 게임이 아니라 도구의 구조.
 * 미션 9종도 포인트 → 스킬 구매로만 이어지고, 스킬을 스테이지 보상으로 주는
 * 흐름이 없어 플레이어가 성취감을 느낄 자리가 없었다.
 *
 * 규칙: `stageN` 은 `stage(N-1)` 을 해금 기준 정확도 이상으로 클리어하면 열린다.
 */

const best = (accuracy: number) => ({ score: 10000, accuracy, grade: "SS" });

describe("스테이지 정의", () => {
  it("5개 스테이지가 순서대로 정의되어 있다", () => {
    expect(STAGES).toHaveLength(5);
    expect(STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("BPM 이 실제로 난이도를 반영한다 (오름차순)", () => {
    const bpms = STAGES.map((s) => s.bpm);
    for (let i = 1; i < bpms.length; i++) {
      expect(bpms[i]).toBeGreaterThanOrEqual(bpms[i - 1]);
    }
  });

  it("첫 스테이지는 조건이 없다", () => {
    expect(FIRST_STAGE.requiredAccuracy).toBe(0);
    expect(prevStage(FIRST_STAGE.id)).toBeNull();
  });

  it("해금 기준이 뒤로 갈수록 높아진다 (선형 난이도)", () => {
    const reqs = STAGES.slice(1).map((s) => s.requiredAccuracy);
    for (let i = 1; i < reqs.length; i++) {
      expect(reqs[i]).toBeGreaterThanOrEqual(reqs[i - 1]);
    }
  });

  it("해금 기준은 현실적으로 도달 가능한 값이다", () => {
    for (const s of STAGES.slice(1)) {
      // 100% 는 불가능하므로 95% 를 넘지 않아야 한다
      expect(s.requiredAccuracy).toBeGreaterThan(0);
      expect(s.requiredAccuracy).toBeLessThanOrEqual(0.95);
    }
  });

  it("stageDef / isStageId 는 모르는 ID 를 거절한다", () => {
    expect(stageDef("stage3")?.order).toBe(3);
    expect(stageDef("custom:123")).toBeNull();
    expect(stageDef("daily")).toBeNull();
    expect(isStageId("stage5")).toBe(true);
    expect(isStageId("daily")).toBe(false);
  });

  it("i18n 키 매핑이 모든 스테이지를 덮는다", () => {
    for (const s of STAGES) {
      expect(stageTitleKey(s.id)).toBe(`title.${s.id}`);
    }
  });
});

describe("해금 판정", () => {
  it("아무것도 플레이하지 않았으면 첫 스테이지만 열린다", () => {
    const { unlocked } = computeUnlocks({});
    expect(unlocked.stage1).toBe(true);
    expect(unlocked.stage2).toBe(false);
    expect(unlocked.stage3).toBe(false);
    expect(unlocked.stage4).toBe(false);
    expect(unlocked.stage5).toBe(false);
  });

  it("앞 스테이지를 기준 이상으로 클리어하면 다음이 열린다", () => {
    const { unlocked } = computeUnlocks({
      stage1: best(0.85),
      stage2: best(0.9),
      stage3: best(0.92),
      stage4: best(0.95),
    });
    expect(unlocked.stage1).toBe(true);
    expect(unlocked.stage2).toBe(true); // 0.85 >= 0.80
    expect(unlocked.stage3).toBe(true); // 0.90 >= 0.85
    expect(unlocked.stage4).toBe(true); // 0.92 >= 0.88
    expect(unlocked.stage5).toBe(true); // 0.95 >= 0.90
  });

  it("기준에 못 미치면 잠긴다", () => {
    const { unlocked } = computeUnlocks({ stage1: best(0.79) });
    expect(unlocked.stage1).toBe(true);
    expect(unlocked.stage2).toBe(false); // 0.79 < 0.80
  });

  it("선형 진행이다 (다음 스테이지를 건너뛰어 열 수 없다)", () => {
    // stage1 만 완벽해도 stage3 은 열리지 않는다
    const { unlocked } = computeUnlocks({ stage1: best(1) });
    expect(unlocked.stage2).toBe(true);
    expect(unlocked.stage3).toBe(false);
  });

  it("stageStatus 는 잠김/해금만 판정한다", () => {
    expect(stageStatus("stage1", {})).toBe("unlocked");
    expect(stageStatus("stage2", {})).toBe("locked");
    expect(stageStatus("stage2", { stage1: best(0.9) })).toBe("unlocked");
  });
});

describe("잠긴 상태의 진행도", () => {
  it("기준 미달이면 0 에서 출발한다", () => {
    expect(unlockProgress("stage2", {})).toBe(0);
  });

  it("기준에 도달하면 1 이다", () => {
    expect(unlockProgress("stage2", { stage1: best(0.8) })).toBe(1);
  });

  it("기준을 넘으면 1 을 넘지 않는다", () => {
    expect(unlockProgress("stage2", { stage1: best(1) })).toBe(1);
  });

  it("중간값은 비율로 표시된다 (막다른 느낌 방지)", () => {
    // 0.40 / 0.80 = 50%
    const p = unlockProgress("stage2", { stage1: best(0.4) });
    expect(p).toBeCloseTo(0.5, 5);
  });

  it("첫 스테이지는 항상 100% 진행도다", () => {
    expect(unlockProgress("stage1", {})).toBe(1);
  });
});

/**
 * "새로 열림" 판정은 **런 이전 상태**와 비교해야 한다.
 *
 * 갱신 후 상태와 비교하면 원래 열려 있던 스테이지를 "새로 열림" 으로
 * 잘못 표시하거나, 아예 아무것도 표시되지 않는다.
 */
describe("새로 열린 스테이지", () => {
  it("런 이전 상태에서 열려 있지 않았고 기준을 넘었을 때만 표시한다", () => {
    const before = computeUnlocks({ stage1: best(0.7) }).unlocked;
    const opened = newlyUnlocked(0.85, before);
    expect(opened).toContain("stage2");
  });

  it("이미 열려 있던 것은 '새로 열림' 이 아니다", () => {
    const before = computeUnlocks({ stage1: best(0.9) }).unlocked;
    // 같은 정확도로 다시 플레이해도 중복 표시되면 안 된다
    expect(newlyUnlocked(0.9, before)).not.toContain("stage2");
  });

  it("기준 미달이면 아무것도 열리지 않는다", () => {
    const before = computeUnlocks({}).unlocked;
    expect(newlyUnlocked(0.5, before)).toEqual([]);
  });

  /**
 * ⚠️ 선형 규칙: 낮은 스테이지를 잘 치면 높은 스테이지까지 한꺼번에 열리면 안 된다.
 *
 * 조건을 독립적으로만 보면 stage1 을 99% 로 친 한 런이 stage2~5 를 전부 열어
 * "순서대로 밟아가는" 감각이 사라지고 난이도 벽이 무너진다.
 */
it("선형 규칙: 앞 스테이지를 못 넘으면 뒤도 열리지 않는다", () => {
  const before = computeUnlocks({}).unlocked;
  // stage2 기준 80% 까지만 충족 → stage3(85%) 부터는 열리지 않아야 한다
  const opened = newlyUnlocked(0.82, before);
  expect(opened).toEqual(["stage2"]);
});

it("선형 규칙: 조건이 계속 충족되면 연쇄적으로 열린다", () => {
  const before = computeUnlocks({}).unlocked;
  // 99% 는 모든 기준을 충족 → stage2~5 가 순서대로 열린다
  const opened = newlyUnlocked(0.99, before);
  expect(opened).toEqual(["stage2", "stage3", "stage4", "stage5"]);
});

  it("첫 스테이지는 '새로 열림' 대상이 아니다 (원래 열려 있다)", () => {
    const before = computeUnlocks({}).unlocked;
    expect(newlyUnlocked(1, before)).not.toContain("stage1" as StageId);
  });
});

describe("클리어 라인", () => {
  it("MISS/BAD 가 없으면 클리어 라인이다", () => {
    expect(clearLine({ PERFECT: 50, GREAT: 10, GOOD: 5, BAD: 0, MISS: 0 })).toBe(true);
  });

  it("MISS/BAD 가 하나라도 있으면 아니다", () => {
    expect(clearLine({ PERFECT: 50, GREAT: 10, GOOD: 5, BAD: 1, MISS: 0 })).toBe(false);
    expect(clearLine({ PERFECT: 50, GREAT: 10, GOOD: 5, BAD: 0, MISS: 1 })).toBe(false);
  });
});