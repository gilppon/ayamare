import { describe, expect, it } from "vitest";
import { detectPeaks, peaksToChart } from "./autoChart";

describe("autoChart", () => {
  it("피크를 양자화해 노트로 변환", () => {
    const c = peaksToChart([0.1, 0.35, 0.6, 0.6, 1.2], { bpm: 130 });
    expect(c.notes.length).toBeLessThanOrEqual(4);
    expect(c.version).toBe(2);
    expect(c.notes[0].time).toBeGreaterThan(3);
    const times = c.notes.map((n) => n.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("합성 클릭 검출", () => {
    const sr = 8000;
    const data = new Float32Array(sr * 2);
    // 0.5초, 1.0초, 1.5초에 임펄스
    for (const t of [0.5, 1.0, 1.5]) {
      const idx = Math.floor(t * sr);
      for (let j = 0; j < 200; j++) data[idx + j] = Math.random() * 2 - 1;
    }
    const peaks = detectPeaks(data, sr, { thresholdRatio: 1.5 });
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(peaks[0]).toBeGreaterThan(0.3);
  });
});
