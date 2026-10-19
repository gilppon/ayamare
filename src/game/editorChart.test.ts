import { describe, expect, it } from "vitest";
import { peaksToChart, detectPeaks } from "./autoChart";
import { BPM } from "./constants";
import {
  SLOTS_PER_BAR,
  cellKey,
  cellsToNotes,
  migrateLegacyKeys,
  notesToCells,
  slotToTime,
  timeToSlot,
} from "./editorChart";

describe("에디터 좌표계 (8분박자 슬롯)", () => {
  it("슬롯 8개가 마디 하나를 4분박자 단위로 정확히 덮는다", () => {
    expect(SLOTS_PER_BAR).toBe(8);
    for (let bar = 0; bar < 3; bar++) {
      for (let slot = 0; slot < SLOTS_PER_BAR; slot++) {
        const t = slotToTime(bar, slot, BPM);
        expect(timeToSlot(t, BPM)).toEqual({ bar, slot });
      }
    }
  });

  it("B-09 회귀: 8분박자(홀수 슬롯) 시간이 4분박자로 뭉개지지 않는다", () => {
    const beat = 60 / BPM;
    for (const half of [0.5, 1.5, 2.5, 3.5]) {
      const t = (2 * 4 + half) * beat; // 3마디, half 박 지점
      // 기존 버그: Math.round(t / beat) → half 가 반올림되어 소실
      const legacyRounded = Math.round(t / beat) / beat;
      expect(legacyRounded).not.toBeCloseTo(t, 6);
      // 신규: 슬롯 인덱스로 정확히 복원
      const { bar, slot } = timeToSlot(t, BPM);
      expect(bar).toBe(2);
      expect(slot).toBe(half * 2);
      expect(slotToTime(bar, slot, BPM)).toBeCloseTo(t, 9);
    }
  });

  it("셀 → 노트 → 셀 왕복이 손실 없다", () => {
    const cells = {
      [cellKey(0, 0, 0)]: { hold: 0 },
      [cellKey(3, 5, 2)]: { hold: 4, gimmick: "invisible" as const },
      [cellKey(7, 7, 3)]: { hold: 6, gimmick: "fake" as const },
      [cellKey(2, 2, 1)]: { hold: 2, gimmick: "speedUp" as const },
    };
    const notes = cellsToNotes(cells, BPM);
    expect(notes).toHaveLength(4);
    const back = notesToCells(notes, BPM, 8);
    expect(back).toEqual(cells);
    // 홀드는 초 단위로 변환 후 다시 8분박자 단위로 복원되어야 한다
    const holdNote = notes.find((n) => n.lane === 2)!;
    expect(holdNote.hold).toBeCloseTo(4 * (60 / BPM / 2), 9);
    expect(holdNote.gimmick).toBe("invisible");
  });

  it("시간 순으로 정렬된다 (게임 루프가 notes 배열 순서를 가정한다)", () => {
    const cells = {
      [cellKey(4, 0, 0)]: { hold: 0 },
      [cellKey(0, 4, 1)]: { hold: 0 },
      [cellKey(2, 0, 2)]: { hold: 0 },
      [cellKey(0, 1, 3)]: { hold: 0 },
    };
    const times = cellsToNotes(cells, BPM).map((n) => n.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("마디 범위를 벗어난 노트는 버린다", () => {
    const notes = cellsToNotes(
      { [cellKey(99, 0, 0)]: { hold: 0 }, [cellKey(1, 0, 0)]: { hold: 0 } },
      BPM
    );
    const cells = notesToCells(notes, BPM, 8);
    expect(Object.keys(cells)).toEqual([cellKey(1, 0, 0)]);
  });

  it("구버전 4분박자 키를 마이그레이션한다", () => {
    expect(Object.keys(migrateLegacyKeys(["2:1:0", "2:3:2"]))).toEqual([
      cellKey(2, 2, 0),
      cellKey(2, 6, 2),
    ]);
  });

  it("B-09 회귀: autoChart 초안 전체가 에디터 그리드로 유실 없이 로드된다", () => {
    // 8분박자 격자에 맞춘 피크열 → 자동채보 → 셀 변환
    // (peaksToChart 가 2마디 카운트인을 오프셋으로 붙이므로 0~5마디를 쓴다)
    const beat = 60 / BPM;
    const peaks: number[] = [];
    for (let bar = 0; bar < 6; bar++) {
      for (let slot = 0; slot < SLOTS_PER_BAR; slot++) {
        if ((slot + bar) % 3 === 0) continue; // 밀도 변주
        peaks.push((bar * 4 + slot / 2) * beat);
      }
    }
    const chart = peaksToChart(peaks, { bpm: BPM });
    expect(chart.notes.length).toBe(peaks.length);

    const cells = notesToCells(chart.notes, BPM, 8);
    // B-09 이전 버그라면 8분박자 시간이 반올림되어 인접 셀과 충돌,
    // 셀 개수가 크게 줄었었다.
    expect(Object.keys(cells)).toHaveLength(peaks.length);
    expect(cellsToNotes(cells, BPM)).toHaveLength(peaks.length);
  });
});

describe("detectPeaks", () => {
  it("B-12 회귀: 4로 나누어떨어지지 않는 위치의 트랜지언트도 검출한다", () => {
    const sr = 44100;
    const data = new Float32Array(sr);
    for (let i = 0; i < data.length; i++) data[i] = 0.01;
    data[22050] = 1; // 22050 % 4 === 2 — 이전 고정 위상 샘플링에선 통째로 누락됐다
    const peaks = detectPeaks(data, sr, { maxPeaks: 10 });
    expect(peaks).toHaveLength(1);
    expect(Math.abs(peaks[0] - 0.5)).toBeLessThan(0.05);
  });

  it("여러 트랜지언트를 시간순으로 검출한다", () => {
    const sr = 44100;
    const data = new Float32Array(sr);
    for (let i = 0; i < data.length; i++) data[i] = 0.005;
    for (const at of [0.2, 0.5, 0.9]) {
      const base = Math.round(at * sr);
      for (let k = 0; k < 400 && base + k < data.length; k++) data[base + k] = 1 - k / 400;
    }
    const peaks = detectPeaks(data, sr, { maxPeaks: 20 });
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks[0]).toBeLessThan(peaks[peaks.length - 1]);
  });
});
