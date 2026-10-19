/**
 * 노트 렌더 레이아웃 계산 (순수함수).
 *
 * GameScreen 의 JSX 안에 인라인돼 있던 Y좌표·테일·투명도·색상 산출을 이관한다.
 * 목적:
 *  1) 렌더와 로직을 같은 규칙으로 한 곳에 모으고 (드리프트 방지)
 *  2) 기믹(`invisible` / `speedUp` / `fake`) 시각 규칙을 단위 테스트로 고정
 */

import { readableOn } from "./constants";
import type { Note } from "./types";
import { noteFallY } from "./visibility";

/** 미스 처리된 노트의 회색 배경 */
export const MISS_BG = "#334155";
export const MISS_FG = "#1e293b";
/** 가짜 노트(치면 안 되는 함정) */
export const FAKE_BG = "#6b7280";

/** 홀드 테일의 두께 (px) */
export const HOLD_TAIL_THICKNESS = 18;

export interface NoteLayout {
  /** 노트 헤드 Y 좌표 (레인 상단 기준 px) */
  y: number;
  /** 홀드 테일 시작 Y */
  tailTop: number;
  /** 홀드 테일 높이 */
  tailH: number;
  /** 전체 불투명도 0~1 */
  opacity: number;
  /** 헤드 배경색 */
  bgColor: string;
  /** 헤드 글자색 (배경 상대 휘도로 자동 결정) */
  fgColor: string;
  /** 글로우 (미스/가짜는 없음) */
  boxShadow: string;
  /** 라벨 텍스트 */
  label: string;
  /** 점선 테두리 (투명 기믹 표시) */
  dashed: boolean;
  /** 테일을 그려야 하는가 */
  showTail: boolean;
  /** 라벨 폰트 크기 */
  fontSize: number;
}

export interface NoteLayoutInput {
  /** 노트 상태: "pending" | "hit" | "miss" | "holding" */
  state: string | undefined;
  /** 레인 색 (#rrggbb) */
  laneColor: string;
  /** 레인 글로우 rgba */
  laneGlow: string;
  /** 라벨 (일반 노트) */
  laneLabel: string;
  /** 로케일된 기픽 경고 라벨 */
  ghostLabel: string;
  speedLabel: string;
}

/** 기믹별 헤드 높이 (px) */
export const NOTE_HEAD_HEIGHT = 36;

/**
 * 한 노트의 프레임 레이아웃을 계산한다.
 *
 * - `speedUp` : `noteFallY` 로 가속 곡선 (마지막 1초 오목 가속)
 * - `invisible`: 1.0초 전부터 서서히 투명해지되 35% + 점선 테두리로 잔상 유지
 * - `holding`  : 헤드를 판정선에 붙이고 테일을 남은 길이만큼 표시
 */
export function layoutNote(
  note: Note,
  now: number,
  hitLineY: number,
  speed: number,
  input: NoteLayoutInput
): NoteLayout {
  const st = input.state;
  const isFake = note.gimmick === "fake";
  const isGhost = note.gimmick === "invisible";

  let opacity = 1;
  let tailTop = 0;
  let tailH = 0;
  let y: number;

  if (isGhost) {
    // 1.0초부터 투명해지되 잔상을 35% + 점선으로 남겨 기믹임을 명시
    const d = note.time - now;
    if (d < 1.0) opacity = Math.max(0.35, (d - 0.2) / 0.8);
  }

  if (note.gimmick === "speedUp") {
    y = noteFallY(note.time, now, hitLineY, speed);
    if (note.hold > 0) {
      tailTop = y + HOLD_TAIL_THICKNESS;
      tailH = note.hold * speed;
    }
  } else if (st === "holding") {
    y = hitLineY;
    tailTop = hitLineY + 2;
    tailH = Math.max(0, note.time + note.hold - now) * speed;
  } else {
    const diff = note.time - now;
    y = hitLineY - diff * speed;
    if (note.hold > 0) {
      tailTop = y + HOLD_TAIL_THICKNESS;
      tailH = note.hold * speed;
    }
  }

  const bgColor = st === "miss" ? MISS_BG : isFake ? FAKE_BG : input.laneColor;
  const fgColor = st === "miss" ? MISS_FG : readableOn(bgColor);

  const label = isFake
    ? "???"
    : isGhost
    ? input.ghostLabel
    : note.gimmick === "speedUp"
    ? input.speedLabel
    : input.laneLabel;

  if (st === "miss") opacity *= 0.4; // 미스 노트는 반투명으로 바닥으로 떨어진다

  return {
    y,
    tailTop,
    tailH: Math.max(0, tailH),
    opacity: Math.max(0, Math.min(1, opacity)),
    bgColor,
    fgColor,
    boxShadow: st === "miss" || isFake ? "none" : `0 0 18px ${input.laneGlow}`,
    label,
    dashed: isGhost,
    showTail: note.hold > 0 && !isFake,
    fontSize: label.length > 4 ? 15 : 20,
  };
}

/** 레인 수신기(리시버) 바 상태 (순수함수) */
export interface ReceiverState {
  pressed: boolean;
  /** 이 레인에 홀드 노트가 잡혀 있는가 */
  holding: boolean;
  background: string;
  boxShadow: string;
  opacity: number;
}

export function layoutReceiver(
  laneColor: string,
  laneGlow: string,
  pressed: boolean,
  holding: boolean
): ReceiverState {
  return {
    pressed,
    holding,
    background: pressed
      ? laneColor
      : `linear-gradient(180deg, ${laneGlow}, transparent)`,
    boxShadow: pressed
      ? `0 0 18px ${laneColor}, inset 0 0 10px rgba(255,255,255,0.45)`
      : `0 0 8px ${laneGlow}`,
    opacity: pressed ? 0.95 : 0.42,
  };
}

/** 판정선 펄스 (비트 위상 0~1 → 불투명도). 순수함수 */
export function hitLinePulse(beatPhase: number): number {
  return 0.35 + (1 - beatPhase) * 0.5;
}

/** U-03 기믹 예고 큐 항목. 순수함수 — `invisible` 은 페이드 직전에 예고한다. */
export interface Telegraph {
  lane: number;
  kind: NonNullable<Note["gimmick"]>;
  /** 0 → 여유, 1 → 임박 */
  urgency: number;
}

const TELEGRAPH_LEAD: Record<NonNullable<Note["gimmick"]>, number> = {
  invisible: 1.55,
  speedUp: 1.1,
  fake: 1.1,
};

/** 예고가 시작되는 최소 남은 시간 (초) — 이 아래로 내려가면 표시를 끈다 */
export const TELEGRAPH_MIN_D = 0.4;

/**
 * 기믹 예고 목록. `notes` 가 time 오름차순이라고 가정하지 않고 전체를 훑는다
 * (호출 측이 이미 `visibleNoteWindow` 로 좁힌 배열을 넘긴다).
 */
export function telegraphsFor(
  notes: readonly Note[],
  now: number,
  spawnAhead: number
): Telegraph[] {
  const out: Telegraph[] = [];
  for (const n of notes) {
    const kind = n.gimmick;
    if (!kind) continue;
    const d = n.time - now;
    if (d > spawnAhead || d <= TELEGRAPH_MIN_D) continue;
    const lead = TELEGRAPH_LEAD[kind];
    if (d > lead) continue;
    out.push({ lane: n.lane, kind, urgency: 1 - (d - TELEGRAPH_MIN_D) / (lead - TELEGRAPH_MIN_D) });
  }
  return out;
}
