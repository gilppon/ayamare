import { describe, expect, it } from "vitest";
import {
  FAKE_BG,
  MISS_BG,
  MISS_FG,
  NOTE_HEAD_HEIGHT,
  TELEGRAPH_MIN_D,
  hitLinePulse,
  layoutNote,
  layoutReceiver,
  telegraphsFor,
} from "./noteLayout";
import { contrastRatio, readableOn } from "./constants";
import type { Note } from "./types";

const HIT_LINE_Y = 400;
const SPEED = 200; // laneH / LEAD_TIME

const input = {
  state: undefined as string | undefined,
  laneColor: "#38bdf8",
  laneGlow: "rgba(56, 189, 248, 0.55)",
  laneLabel: "45°",
  ghostLabel: "주의!",
  speedLabel: "가속!",
};

const note = (over: Partial<Note> = {}): Note => ({
  id: 1,
  time: 10,
  lane: 1,
  action: "bow45",
  hold: 0,
  ...over,
});

describe("layoutNote", () => {
  it("pending 탭 노트는 등속으로 내려온다", () => {
    const n = note({ time: 10 });
    const far = layoutNote(n, 8, HIT_LINE_Y, SPEED, input);
    const near = layoutNote(n, 9, HIT_LINE_Y, SPEED, input);
    expect(far.y).toBeCloseTo(HIT_LINE_Y - 2 * SPEED, 6);
    expect(near.y).toBeCloseTo(HIT_LINE_Y - 1 * SPEED, 6);
  });

  it("B-02 정합: speedUp 은 noteFallY 와 동일한 좌표를 낸다 (드리프트 없음)", () => {
    const n = note({ time: 10, gimmick: "speedUp" });
    for (const now of [9.9, 9.5, 9.0, 8.0, 7.0]) {
      const l = layoutNote(n, now, HIT_LINE_Y, SPEED, input);
      // noteFallY 와 동일한 규칙을 쓴다 (d>=1 에선 선형, 그 아래는 가속 곡선)
      const d = 10 - now;
      const expected =
        d >= 1 ? HIT_LINE_Y - d * SPEED : HIT_LINE_Y - Math.pow(Math.max(0, d), 0.55) * SPEED;
      expect(l.y).toBeCloseTo(expected, 6);
    }
  });

  it("invisible 은 1초 전부터 흐려지되 35% 잔상을 남긴다", () => {
    const n = note({ time: 10, gimmick: "invisible" });
    const before = layoutNote(n, 8.5, HIT_LINE_Y, SPEED, input);
    const mid = layoutNote(n, 9.5, HIT_LINE_Y, SPEED, input);
    const floorCase = layoutNote(n, 9.9, HIT_LINE_Y, SPEED, input);
    expect(before.opacity).toBe(1);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.opacity).toBeGreaterThanOrEqual(0.35);
    // 완전 소멸로 오해되지 않도록 0.35 에서 멈춘다
    expect(floorCase.opacity).toBeCloseTo(0.35, 6);
    expect(floorCase.dashed).toBe(true);
    expect(floorCase.label).toBe("주의!");
  });

  it("fake 는 '???' 라벨 + 글로우 없음 + 테일 없음", () => {
    const n = note({ time: 10, gimmick: "fake", hold: 2 });
    const l = layoutNote(n, 9.5, HIT_LINE_Y, SPEED, input);
    expect(l.label).toBe("???");
    expect(l.boxShadow).toBe("none");
    expect(l.showTail).toBe(false);
    expect(l.bgColor).toBe(FAKE_BG);
  });

  it("miss 는 회색 + 저대비 + 0.4배 투명도 + 글로우 없음", () => {
    const l = layoutNote(note({ time: 10 }), 10.2, HIT_LINE_Y, SPEED, {
      ...input,
      state: "miss",
    });
    expect(l.bgColor).toBe(MISS_BG);
    expect(l.fgColor).toBe(MISS_FG);
    expect(l.boxShadow).toBe("none");
    expect(l.opacity).toBeLessThanOrEqual(0.4);
  });

  it("holding 은 헤드가 판정선에 붙고 테일이 남은 길이만큼 남는다", () => {
    const l = layoutNote(note({ time: 10, hold: 1 }), 10.2, HIT_LINE_Y, SPEED, {
      ...input,
      state: "holding",
    });
    expect(l.y).toBe(HIT_LINE_Y);
    expect(l.tailTop).toBe(HIT_LINE_Y + 2);
    // 남은 길이 = (10 + 1) - 10.2 = 0.8초
    expect(l.tailH).toBeCloseTo(0.8 * SPEED, 6);
    expect(l.showTail).toBe(true);
  });

  it("holding 이 종료된 뒤 테일 길이는 0 이 된다 (음수 방지)", () => {
    const l = layoutNote(note({ time: 10, hold: 1 }), 12, HIT_LINE_Y, SPEED, {
      ...input,
      state: "holding",
    });
    expect(l.tailH).toBe(0);
  });

  it("홀드 테일은 항상 헤드 아래에서 시작한다", () => {
    const n = note({ time: 10, hold: 1.5 });
    for (const now of [9, 9.9, 10, 10.4]) {
      const l = layoutNote(n, now, HIT_LINE_Y, SPEED, input);
      expect(l.tailTop).toBeGreaterThanOrEqual(l.y - 1);
    }
  });

  it("라벨이 길면 폰트를 줄인다 (모바일 폭 대응)", () => {
    const short = layoutNote(note({ time: 10 }), 9.5, HIT_LINE_Y, SPEED, input);
    const long = layoutNote(note({ time: 10, gimmick: "invisible" }), 9.5, HIT_LINE_Y, SPEED, {
      ...input,
      ghostLabel: "투명 노트입니다",
    });
    expect(short.fontSize).toBe(20);
    expect(long.fontSize).toBe(15);
  });

  it("라벨 색은 배경 휘도로 결정된다 (I-04)", () => {
    for (const color of ["#2dd4bf", "#38bdf8", "#c084fc", "#fb7185"]) {
      const l = layoutNote(note({ time: 10 }), 9.5, HIT_LINE_Y, SPEED, {
        ...input,
        laneColor: color,
      });
      expect(l.fgColor).toBe(readableOn(color));
    }
  });

  it("헤드 높이는 상수로 노출된다", () => {
    expect(NOTE_HEAD_HEIGHT).toBe(36);
  });
});

describe("readableOn (I-04 대비)", () => {
  it("밝은 배경 → 어두운 글자, 어두운 배경 → 밝은 글자", () => {
    expect(readableOn("#ffffff")).toBe("#0b0f19");
    expect(readableOn("#fbbf24")).toBe("#0b0f19");
    expect(readableOn("#000000")).toBe("#f8fafc");
  });

  it("잘못된 값은 안전한 기본값으로 폴백", () => {
    expect(readableOn("nope")).toBe("#0b0f19");
    expect(readableOn("#12")).toBe("#0b0f19");
  });

  it("레인 팔레트 전부에서 WCAG AA 이상(4.5:1) 대비를 확보한다", () => {
    // 일반 팔레트 4색 + 색맹 모드 4색 + 미스/가짜 배경
    const backgrounds = [
      "#2dd4bf", "#38bdf8", "#c084fc", "#fb7185",
      "#00e5ff", "#ffb020", "#b388ff", "#ff5c7a",
      MISS_BG, FAKE_BG,
    ];
    for (const c of backgrounds) {
      const ratio = contrastRatio(readableOn(c), c);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("보라 계열에서 검정 글자를 고른다 (흰 글자 대비가 훨씬 낮다)", () => {
    // 회귀: 임계값을 0.42 로 두면 #c084fc/#b388ff 에 흰 글자를 씌워 대비가 2.6 으로 무너진다
    for (const c of ["#c084fc", "#b388ff"]) {
      expect(readableOn(c)).toBe("#0b0f19");
      expect(contrastRatio(readableOn(c), c)).toBeGreaterThan(
        contrastRatio("#f8fafc", c)
      );
    }
  });
});

describe("layoutReceiver", () => {
  it("미누름은 흐리고, 누름은 레인 색으로 점등", () => {
    const idle = layoutReceiver("#38bdf8", "rgba(56,189,248,0.55)", false, false);
    const on = layoutReceiver("#38bdf8", "rgba(56,189,248,0.55)", true, false);
    expect(idle.opacity).toBeLessThan(on.opacity);
    expect(on.background).toBe("#38bdf8");
    expect(on.boxShadow).toContain("inset");
  });

  it("홀드 진행 표시 플래그를 전달한다", () => {
    expect(layoutReceiver("#38bdf8", "g", false, true).holding).toBe(true);
  });
});

describe("hitLinePulse", () => {
  it("비트 위상 0→1 에서 0.85→0.35 로 감소한다", () => {
    expect(hitLinePulse(0)).toBeCloseTo(0.85, 6);
    expect(hitLinePulse(1)).toBeCloseTo(0.35, 6);
  });
});

describe("telegraphsFor (U-03)", () => {
  const g = (time: number, lane = 0, gimmick: Note["gimmick"] = "speedUp") =>
    note({ id: time * 100 + lane, time, lane: lane as 0 | 1 | 2 | 3, gimmick });

  it("기믹 없으면 예고하지 않는다", () => {
    expect(telegraphsFor([note({ time: 10 })], 9.0, 2.45)).toHaveLength(0);
  });

  it("invisible 은 페이드 시작(1.0초)보다도 미리 예고한다", () => {
    const out = telegraphsFor([g(10, 1, "invisible")], 8.8, 2.45);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("invisible");
    expect(out[0].urgency).toBeGreaterThan(0);
    expect(out[0].urgency).toBeLessThanOrEqual(1);
  });

  it("예고 창에 들어가면 urgency 가 1 로 접근한다", () => {
    const far = telegraphsFor([g(10)], 8.95, 2.45)[0].urgency;
    const close = telegraphsFor([g(10)], 9.15, 2.45)[0].urgency;
    expect(close).toBeGreaterThan(far);
  });

  it("임박/통과한 노트는 예고하지 않는다", () => {
    expect(telegraphsFor([g(10)], 10 - TELEGRAPH_MIN_D + 0.01, 2.45)).toHaveLength(0);
    expect(telegraphsFor([g(10)], 10.5, 2.45)).toHaveLength(0);
  });

  it("스폰 윈도우 밖은 예고하지 않는다", () => {
    expect(telegraphsFor([g(20)], 9, 2.45)).toHaveLength(0);
  });

  it("레인/종류를 그대로 전달한다", () => {
    const out = telegraphsFor([g(10, 3, "fake")], 9.2, 2.45);
    expect(out[0].lane).toBe(3);
    expect(out[0].kind).toBe("fake");
  });
});
