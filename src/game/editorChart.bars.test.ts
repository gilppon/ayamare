import { describe, expect, it } from "vitest";
import { BPM } from "./constants";
import {
  MAX_BARS,
  MIN_BARS,
  barDuration,
  barsForCells,
  barsForNotes,
  cellKey,
  clampCellsToBars,
  cellsToNotes,
  notesToCells,
} from "./editorChart";
import { peaksToChart } from "./autoChart";
import type { Note } from "./types";

/**
 * C-02 회귀 — 에디터 격자가 고정 8마디였을 때 생긴 **조용한 데이터 손실**.
 *
 * `importJson` 이 `notesToCells(notes, BPM, 8)` 을 호출했다.
 * `autoChart` 는 카운트인 2마디를 앞에 붙이므로, 대략적인 곡에서도
 * 마지막 노트가 8마디를 크게 넘어가 **자동채보 결과 대부분이 버려졌다.**
 * (사용자는 성공 메시지만 보고 제목만 바뀐 상태를 본다)
 */
describe("C-02: 격자 길이는 고정값이 아니라 내용에 맞춘다", () => {
  const noteAt = (bar: number, slot: number, lane: 0 | 1 | 2 | 3 = 0): Note => ({
    id: bar * 8 + slot,
    time: (bar * 4 + slot / 2) * (60 / BPM),
    lane,
    action: "bow15",
    hold: 0,
  });

  it("barsForNotes 는 노트가 요구하는 마디 수를 정확히 낸다", () => {
    // 20마디까지 필요한 채보
    expect(barsForNotes([noteAt(0, 0), noteAt(19, 4)], BPM)).toBe(20);
    // 빈 목록이면 0
    expect(barsForNotes([], BPM)).toBe(0);
    // NaN 시각은 무시한다
    expect(barsForNotes([noteAt(2, 0), { ...noteAt(0, 0), time: NaN }], BPM)).toBe(3);
  });

  it("8마디를 넘는 채보가 고정 8마디에서 잘리지 않는다", () => {
    const notes = Array.from({ length: 24 }, (_, i) => noteAt(i, 0, (i % 4) as 0 | 1 | 2 | 3));
    const needed = Math.max(MIN_BARS, barsForNotes(notes, BPM));

    const kept = notesToCells(notes, BPM, needed);
    expect(cellsToNotes(kept, BPM)).toHaveLength(notes.length);

    // 회귀: 이전 고정값으로는 24개 중 8개만 살아남았다
    const truncated = notesToCells(notes, BPM, MIN_BARS);
    expect(cellsToNotes(truncated, BPM)).toHaveLength(MIN_BARS);
  });

  it("자동채보 결과가 실제 격자에 모두 들어간다", () => {
    // 카운트인 2마디 + 여러 마디에 걸친 노트
    const peaks = Array.from({ length: 40 }, (_, i) => i * 0.37);
    const auto = peaksToChart(peaks, { bpm: BPM, lang: "ko" });

    const needed = Math.max(MIN_BARS, barsForNotes(auto.notes, BPM));
    const kept = cellsToNotes(notesToCells(auto.notes, BPM, needed), BPM);
    expect(kept).toHaveLength(auto.notes.length);
  });

  it("MAX_BARS 를 넘는 부분만 잘리고 그 수를 알 수 있다", () => {
    const notes = Array.from({ length: 8 }, (_, i) => noteAt(i + MAX_BARS, 0));
    const capped = Math.min(MAX_BARS, barsForNotes(notes, BPM));
    expect(cellsToNotes(notesToCells(notes, BPM, capped), BPM)).toHaveLength(0);
  });

  it("barsForCells 는 실제 사용 중인 최대 마디 + 1 을 낸다", () => {
    expect(barsForCells({})).toBe(0);
    expect(barsForCells({ [cellKey(0, 0, 0)]: { hold: 0 } })).toBe(1);
    expect(barsForCells({ [cellKey(7, 0, 0)]: { hold: 0 }, [cellKey(2, 0, 1)]: { hold: 0 } })).toBe(8);
  });

  it("clampCellsToBars 는 격자 밖·불량 셀을 버린다 (L-17)", () => {
    const cells = {
      [cellKey(0, 0, 0)]: { hold: 0 },
      [cellKey(3, 4, 2)]: { hold: 2 },
      [cellKey(MAX_BARS, 0, 0)]: { hold: 0 }, // 격자 밖
      [cellKey(1, 99, 0)]: { hold: 0 }, // 슬롯 범위 밖
      [cellKey(1, 0, 9)]: { hold: 0 }, // 레인 범위 밖
      "garbage": { hold: 0 },
    };
    const clamped = clampCellsToBars(cells);
    expect(Object.keys(clamped).sort()).toEqual(
      [cellKey(0, 0, 0), cellKey(3, 4, 2)].sort()
    );
  });

  it("barDuration 는 마디 길이를 초로 준다", () => {
    expect(barDuration(BPM)).toBeCloseTo((60 / BPM) * 4, 10);
  });
});