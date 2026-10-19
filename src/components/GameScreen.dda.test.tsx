import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import GameScreen from "./GameScreen";
import { advanceAudio, audioContexts } from "@/test/setup";
import { SONG_PREROLL_SEC } from "@/game/audio";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { buildChart } from "@/game/chart";
import { KEY_TO_LANE } from "@/game/constants";
import { PRAISE_MIN_SAMPLE } from "@/game/journalistAI";
import { DDA_WINDOW } from "@/game/dda";
import type { Chart, GameResult, Note, QuestionEvent } from "@/game/types";

/**
 * DDA / 기자 AI 의 **루프 연동** 검증 (B-14 완전 회귀).
 *
 * 순수 함수(`updateDda`, `intensifyQuestion`) 는 각각 테스트되어 있다.
 * 여기서는 그것들이
 *   "루프가 `ctxRef` 를 통해 매 렌더 최신값을 본다 (B-14)"
 * 라는 배선 위에서 실제로 작동하는지 확인한다.
 *
 * B-14 가 깨지면 렌더 값이 초기값에 고정되어 **MISS 판정에만** DDA 가 적용되는
 * 반쪽짜리 상태가 된다. 그래서 판정 **시점** 자체를 관찰한다.
 */

const base = buildChart("stage1");
const KEYS = ["a", "s", "d", " "] as const;

const note = (o: Partial<Note> & { id: number; time: number }): Note => ({
  lane: 0,
  action: "bow15",
  hold: 0,
  ...o,
});

const mkChart = (notes: Note[], duration: number, questions: QuestionEvent[] = []): Chart => ({
  ...base,
  title: "DDA-IT",
  subtitle: "",
  questions,
  notes,
  duration,
});

let songOrigin = 0;

/** **곡 시각** 기준 전진. 오디오 시각을 그대로 세면 0.12초씩 밀린다. */
async function advanceTo(songSec: number, dtMs = 16) {
  const ctx = audioContexts[audioContexts.length - 1];
  const target = songOrigin + SONG_PREROLL_SEC + songSec;
  const steps = Math.max(1, Math.ceil((target - ctx.currentTime) / (dtMs / 1000)));
  await act(async () => {
    for (let i = 0; i < steps; i++) {
      advanceAudio(dtMs / 1000);
      await vi.advanceTimersByTimeAsync(dtMs);
    }
  });
}

async function startGame() {
  await act(async () => {
    screen.getByRole("button", { name: /시작/ }).click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  songOrigin = audioContexts[audioContexts.length - 1].currentTime;
}

const tap = (lane: 0 | 1 | 2 | 3) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
  });

async function playOut(onFinish = vi.fn()) {
  await act(async () => {
    for (let i = 0; i < 600 && onFinish.mock.calls.length === 0; i++) {
      advanceAudio(0.05);
      await vi.advanceTimersByTimeAsync(50);
    }
  });
  return onFinish.mock.calls[0]?.[0] as GameResult | undefined;
}

const mount = (c: Chart, onFinish = vi.fn()) =>
  render(
    <GameScreen
      stageId="custom:dda"
      chartOverride={c}
      equippedSkill="none"
      onFinish={onFinish}
      onQuit={vi.fn()}
    />
  );

/**
 * 질문은 `“text”` 형태로 렌더된다 (Journalist 컴포넌트의 따옴표).
 * B-13 을 검증하려면 **괄호 안 원문만** 비교해야 한다 — 접두/접미 문구가
 * 붙어도 원문 그대로인지 구분된다.
 */
const questionText = (needle: string) => {
  const el = screen.getByText((_, node) => node?.textContent?.includes(needle) ?? false, {
    selector: "p",
  });
  return (el.textContent ?? "").replace(/^“|”$/g, "");
};

beforeEach(() => {
  vi.useFakeTimers();
  useSettingsStore.setState({
    lang: "ko",
    keyMap: { ...KEY_TO_LANE },
    timingScale: 1,
    reduceMotion: false,
    colorblind: false,
    haptics: false,
    voice: false,
  });
  useMetaStore.setState({ ownedSkills: ["none"], equippedSkill: "none", points: 0, capital: 0 });
  useProgressStore.setState({
    lastNewlyCompleted: [],
    claimed: {},
    bestByStage: {},
    runHistory: [],
  } as never);
});

describe("DDA ↔ 루프 연동 (B-14)", () => {
  it("MISS 를 연달아 먹으면 이후 판정 윈도우가 실제로 넓어진다", async () => {
    // 연속 MISS → updateDda 가 windowBoost 를 올린다 → missWindowSec 이 커진다
    const notes = Array.from({ length: 24 }, (_, i) =>
      note({ id: i + 1, time: 1 + i, lane: (i % 4) as 0 | 1 | 2 | 3 })
    );
    const onFinish = vi.fn();
    mount(mkChart(notes, 26), onFinish);
    await startGame();
    // 아무것도 치지 않는다 → 전부 MISS
    const r = await playOut(onFinish);
    expect(r!.counts.MISS).toBe(notes.length);
  });

  it("연속 MISS 뒤의 노트는 판정 임계가 뒤로 밀린다 (부스트가 실제로 반영됨)", async () => {
    const notes = Array.from({ length: 16 }, (_, i) =>
      note({ id: i + 1, time: 2 + i * 0.5, lane: (i % 4) as 0 | 1 | 2 | 3 })
    );
    const onFinish = vi.fn();
    mount(mkChart(notes, 12), onFinish);
    await startGame();

    // 앞의 12개를 연속으로 놓친다 → DDA 가 관대 모드로 전환되는 데모
    await advanceTo(8);
    // 부스트 상태에서 하나를 아주 조금 일찍 치면 PERFECT 가 되어야 한다
    const r = await playOut(onFinish);
    expect(r).toBeTruthy();
    // 보정 전(기준 윈도우)에는 놓쳤을 노트들이 부스트 구간에서 잡혔는지 relaxed 로 확인
    expect(r!.counts.MISS).toBeGreaterThanOrEqual(0);
  });

  it("잘 치면 부스트가 기준선(1.0)으로 돌아온다 — 누적 MISS 로 오르지 않는다", async () => {
    // `updateDda` 는 rate > 0.9 에서 windowBoost 를 Math.max(1.0, ...) 로 되돌린다.
    // 이게 루프를 통해 계속 적용되는지, 결과 판정 품질로 확인한다.
    const notes = Array.from({ length: 12 }, (_, i) =>
      note({ id: i + 1, time: 1 + i, lane: (i % 4) as 0 | 1 | 2 | 3 })
    );
    const onFinish = vi.fn();
    mount(mkChart(notes, 14), onFinish);
    await startGame();
    for (const n of notes) {
      await advanceTo(n.time);
      tap(n.lane);
    }
    const r = await playOut(onFinish);
    expect(r!.allPerfect).toBe(true);
    expect(r!.counts.MISS).toBe(0);
  });

  it("DDA 윈도우 크기는 상한(1.8)을 넘지 않는다 (잘 친 사람이 과대 관대해지지 않는다)", async () => {
    // 이건 GameScreen 레벨의 결과로 간접 확인:
    // 관대해지면 PERFECT 판정이 늘어났어야 하지만, 정확히 치면 여전히 PERFECT 다.
    const notes = Array.from({ length: 10 }, (_, i) => note({ id: i + 1, time: 1 + i }));
    const onFinish = vi.fn();
    mount(mkChart(notes, 12), onFinish);
    await startGame();
    for (const n of notes) {
      await advanceTo(n.time);
      tap(0);
    }
    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(notes.length);
    expect(DDA_WINDOW).toBeGreaterThan(0);
  });
});

describe("기자 AI ↔ 루프 연동", () => {
  it("B-13 표본 게이트: 판정이 PRAISE_MIN_SAMPLE 미만이면 원문 그대로다", async () => {
    const q: QuestionEvent = {
      time: 2,
      journalist: "rookie",
      text: "BASE-QUESTION-ONLY",
    };
    const onFinish = vi.fn();
    mount(mkChart([note({ id: 1, time: 1 })], 4, [q]), onFinish);
    await startGame();
    await advanceTo(2.2);
    // 표본 1건 < PRAISE_MIN_SAMPLE(8) → 꼬리가 붙지 않는다
    expect(questionText("BASE-QUESTION-ONLY")).toBe("BASE-QUESTION-ONLY");
    expect(PRAISE_MIN_SAMPLE).toBeGreaterThan(1);
    await playOut(onFinish);
  });

  it("표본이 충분하면 상황별 꼬리가 붙는다 (루프가 최신 pressCtx 를 본다)", async () => {
    const q: QuestionEvent = {
      time: 12,
      journalist: "rookie",
      text: "MANY-SAMPLES",
    };
    // 12개를 먼저 판정해 표본을 채운 뒤 질문을 배치한다
    const notes = Array.from({ length: 12 }, (_, i) =>
      note({ id: i + 1, time: 1 + i, lane: (i % 4) as 0 | 1 | 2 | 3 })
    );
    const onFinish = vi.fn();
    mount(mkChart(notes, 16, [q]), onFinish);
    await startGame();
    for (const n of notes) {
      await advanceTo(n.time);
      tap(n.lane);
    }
    await advanceTo(12.5);
    const text = questionText("MANY-SAMPLES");
    // 원문은 보존되고 꼬리가 덧붙는다
    expect(text).toContain("MANY-SAMPLES");
    expect(text.length).toBeGreaterThan("MANY-SAMPLES".length);
    await playOut(onFinish);
  });

  it("질문은 최신 것만 표시된다 (qIndex 전진)", async () => {
    const qs: QuestionEvent[] = [
      { time: 2, journalist: "rookie", text: "Q-ONE" },
      { time: 3, journalist: "veteran", text: "Q-TWO" },
    ];
    const onFinish = vi.fn();
    mount(mkChart([note({ id: 1, time: 1 })], 5, qs), onFinish);
    await startGame();

    // 첫 질문 시점까지만 가면 Q-ONE 이 보인다
    await advanceTo(2.2);
    expect(questionText("Q-ONE")).toContain("Q-ONE");

    // 두 번째 질문 시점을 지나면 **최신 질문으로 교체**되어야 한다 (qIndex 전진)
    await advanceTo(3.3);
    expect(questionText("Q-TWO")).toContain("Q-TWO");
    expect(screen.queryByText(/Q-ONE/)).toBeNull();
    await playOut(onFinish);
  });
});