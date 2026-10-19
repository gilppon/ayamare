/**
 * 채보 에디터 ↔ Chart 변환 (순수함수).
 *
 * B-09: 기존 에디터는 `Math.round(n.time / beat)` 로 8분박자 정보를 버렸다.
 * `autoChart` 가 `beat/2` 로 양자화한 노트를 불러오면 전부 0.5박 밀리고
 * 인접 노트와 충돌해 `Set` 에서 조용히 삭제됐다.
 * 여기서는 **슬롯 인덱스(마디당 8슬롯 = 8분박자 단위)** 를 정본 좌표로 삼고
 * 양방향 변환을 왕복 가능하게 만든다.
 */

import type { Note } from "./types";

export const SLOTS_PER_BAR = 8;

/** 에디터가 보유한 마디 수 (UI 하한). */
export const MIN_BARS = 8;
/** 에디터가 보유할 수 있는 마디 수 상한 (성능·저장 용량 보호). */
export const MAX_BARS = 64;

export interface EditorCell {
  /** 홀드 길이 (8분박자 단위). 0 = 탭 */
  hold: number;
  gimmick?: NonNullable<Note["gimmick"]>;
}

export type EditorCells = Record<string, EditorCell>;

const ACTIONS = ["bow15", "bow45", "bow90", "dogeza"] as const;

/** 마디 · 8분박자 슬롯 · 레인 → 셀 키 */
export function cellKey(bar: number, slot: number, lane: number): string {
  return `${bar}:${slot}:${lane}`;
}

/** 셀 좌표 → 노트 타임(초) */
export function slotToTime(bar: number, slot: number, bpm: number): number {
  return (bar * 4 + slot / 2) * (60 / bpm);
}

/** 노트 타임(초) → 셀 좌표. 반올림 오차는 가장 가까운 슬롯으로 흡수한다. */
export function timeToSlot(time: number, bpm: number): { bar: number; slot: number } {
  const totalSlots = Math.round(time / (60 / bpm / 2));
  return { bar: Math.floor(totalSlots / SLOTS_PER_BAR), slot: ((totalSlots % SLOTS_PER_BAR) + SLOTS_PER_BAR) % SLOTS_PER_BAR };
}

/** 셀 → 노트 목록 (시간순 · 레인순 정렬) */
export function cellsToNotes(cells: EditorCells, bpm: number, idBase = 900000): Note[] {
  const notes: Note[] = [];
  let id = idBase;
  for (const k of Object.keys(cells)) {
    const [bar, slot, lane] = k.split(":").map(Number);
    if (!Number.isFinite(bar) || !Number.isFinite(slot) || !Number.isFinite(lane)) continue;
    if (lane < 0 || lane > 3) continue;
    const cell = cells[k];
    notes.push({
      id: id++,
      time: slotToTime(bar, slot, bpm),
      lane: lane as 0 | 1 | 2 | 3,
      action: ACTIONS[lane],
      hold: cell.hold * (60 / bpm / 2),
      gimmick: cell.gimmick,
    });
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane || a.id - b.id);
  return notes;
}

/**
 * 노트 목록 → 셀. `bars` 마디를 벗어나는 노트는 버린다.
 * 홀드는 8분박자 단위로 반올림해 최대 `maxHoldSlots` 로 제한한다.
 */
export function notesToCells(
  notes: Note[],
  bpm: number,
  bars: number,
  maxHoldSlots = SLOTS_PER_BAR
): EditorCells {
  const out: EditorCells = {};
  for (const n of notes) {
    if (!Number.isFinite(n.time)) continue;
    const hold = Number.isFinite(n.hold) ? (n.hold ?? 0) : 0;
    if (hold < 0) continue;
    const { bar, slot } = timeToSlot(n.time, bpm);
    if (bar < 0 || bar >= bars) continue;
    if (n.lane < 0 || n.lane > 3) continue;
    out[cellKey(bar, slot, n.lane)] = {
      hold: Math.min(Math.max(0, Math.round(hold / (60 / bpm / 2))), maxHoldSlots),
      gimmick: n.gimmick,
    };
  }
  return out;
}

/** 구버전 "bar:beat:lane" (4분박자) 키 마이그레이션 — beat → slot = beat * 2 */
export function migrateLegacyKeys(keys: string[]): EditorCells {
  const out: EditorCells = {};
  for (const k of keys) {
    const [bar, beat, lane] = k.split(":").map(Number);
    if (!Number.isFinite(bar) || !Number.isFinite(beat) || !Number.isFinite(lane)) continue;
    out[cellKey(bar, beat * 2, lane)] = { hold: 0 };
  }
  return out;
}

/** 한 마디의 길이(초) */
export function barDuration(bpm: number): number {
  return (60 / bpm) * 4;
}

/**
 * C-02: 노트 목록을 담기에 필요한 마디 수.
 *
 * 기존 에디터는 `bars = 8` 고정이라 임포트 시 나머지를 **조용히 버렸다**.
 * `autoChart` 는 카운트인 2마디를 앞에 붙이므로, 대략적인 곡에서도
 * 마지막 노트는 8마디를 크게 넘어간다 → 자동채보 결과가 거의 전부 사라졌다.
 * 여기서 실제 필요한 만큼의 마디를 계산해 격자를 늘린다.
 */
export function barsForNotes(notes: Note[], bpm: number): number {
  const barSec = barDuration(bpm);
  let max = -1;
  for (const n of notes) {
    if (!Number.isFinite(n.time)) continue;
    const bar = Math.floor(n.time / barSec);
    if (bar > max) max = bar;
  }
  return max + 1;
}

/**
 * 셀 집합이 실제로 사용하는 마디 수 (불량 키는 무시).
 * 격자 길이를 셀에서 유도하면 "보이는데 편집 못하는" 노트가 생기지 않는다.
 */
export function barsForCells(cells: EditorCells): number {
  let max = -1;
  for (const k of Object.keys(cells)) {
    const bar = Number(k.split(":")[0]);
    if (Number.isFinite(bar) && bar > max) max = bar;
  }
  return max + 1;
}

/**
 * 격자 밖 셀을 제거한다.
 *
 * localStorage 에 남은 오래된 초안(예전 8마디 하드코딩 시절 이후 더 많은 마디가
 * 저장된 경우)을 그대로 읽으면 **보이지 않으면서 채보 길이에만 반영되는** 노트가 생긴다.
 */
export function clampCellsToBars(cells: EditorCells, maxBars = MAX_BARS): EditorCells {
  const out: EditorCells = {};
  for (const k of Object.keys(cells)) {
    const [bar, slot, lane] = k.split(":").map(Number);
    if (!Number.isFinite(bar) || !Number.isFinite(slot) || !Number.isFinite(lane)) continue;
    if (bar < 0 || bar >= maxBars) continue;
    if (slot < 0 || slot >= SLOTS_PER_BAR) continue;
    if (lane < 0 || lane > 3) continue;
    out[k] = cells[k];
  }
  return out;
}
