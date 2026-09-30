import { describe, expect, it } from "vitest";
import { offsetForStage, trackForStage } from "./audio";
import { buildChart } from "./chart";

describe("trackForStage", () => {
  it("스테이지별 트랙 매핑", () => {
    expect(trackForStage("stage1")).toMatch(/stage1\.mp3$/);
    expect(trackForStage("stage2")).toMatch(/stage2\.mp3$/);
    expect(trackForStage("stage3")).toMatch(/stage3\.mp3$/);
    expect(trackForStage("stage4")).toMatch(/stage4\.mp3$/);
    expect(trackForStage("stage5")).toMatch(/stage5\.mp3$/);
    expect(trackForStage("daily")).toMatch(/daily\.mp3$/);
  });

  it("커스텀/알 수 없는 스테이지는 절차 그루브(null)", () => {
    expect(trackForStage("custom:123")).toBe(null);
    expect(trackForStage("stage9")).toBe(null);
  });
});

describe("offsetForStage", () => {
  it("실측 오프셋 반환, 없으면 0", () => {
    expect(offsetForStage("stage2")).toBeCloseTo(0.06, 2);
    expect(offsetForStage("stage3")).toBeCloseTo(0.26, 2);
    expect(offsetForStage("custom:123")).toBe(0);
    expect(offsetForStage("stage9")).toBe(0);
  });
});

describe("chart bpm matches tracks", () => {
  it("스테이지별 채보 BPM이 실측치", () => {
    expect(buildChart("stage1", "ko").bpm).toBe(120);
    expect(buildChart("stage2", "ko").bpm).toBe(120);
    expect(buildChart("stage3", "ko").bpm).toBe(128);
    expect(buildChart("daily:2026-01-01", "ko").bpm).toBe(120);
  });
});
