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
import type { Chart, GameResult, Note } from "@/game/types";

/**
 * GameScreen 판정 파이프라인 통합 테스트.
 *
 * 훅·순수함수는 각각 검증되지만, **"키 입력 → 판정 → 점수/연속 → 결과 객체"** 가
 * 실제로 이어지는지는 아무도 보지 않았다. 여기서는 짧은 합성 채보로 그 경로를
 * 처음부터 끝까지 통과시킨다.
 *
 * 시간은 스텁 오디오 컨텍스트를 직접 전진시킨다 (`advanceAudio`).
 * `songTime = ctx.currentTime - songStart` 이므로 오디오를 n 초 전진시키면
 * 곡 시각도 n 초 흐른다.
 */

const base = buildChart("stage1");
const KEYS = ["a", "s", "d", " "] as const;

const chart = (notes: Note[], duration: number): Chart => ({
  ...base,
  title: "INTEGRATION",
  subtitle: "",
  questions: [],
  notes,
  duration,
});

const note = (over: Partial<Note> & { id: number; time: number }): Note => ({
  lane: 0,
  action: "bow15",
  hold: 0,
  ...over,
});

/**
 * **곡 시각(seconds) 까지** 전진시킨다.
 *
 * `songTime = ctx.currentTime - songStart` 이고 `songStart = ctx.currentTime + 0.12` 다.
 * 오디오 시각을 그대로 세면 0.12초씩 밀려 PERFECT 판정이 GREAT/GOOD 로 떨어진다.
 * 그래서 시작 시점의 오디오 시각을 기준점으로 잡고 songTime 을 보정한다.
 */
let songOrigin = 0;

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
  // 곡 시작 기준의 오디오 시각을 기록
  songOrigin = audioContexts[audioContexts.length - 1].currentTime;
}

const keyDown = (lane: 0 | 1 | 2 | 3) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
  });

const keyUp = (lane: 0 | 1 | 2 | 3) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
  });

/** 판정 결과를 끝까지 흘려보낸다 (곡 종료 → onFinish) */
async function playOut(onFinish: ReturnType<typeof vi.fn>) {
  await act(async () => {
    for (let i = 0; i < 400 && onFinish.mock.calls.length === 0; i++) {
      advanceAudio(0.05);
      await vi.advanceTimersByTimeAsync(50);
    }
  });
  return onFinish.mock.calls[0]?.[0] as GameResult | undefined;
}

function mountGame(c: Chart, onFinish = vi.fn(), onQuit = vi.fn()) {
  return {
    onFinish,
    onQuit,
    ...render(
      <GameScreen
        stageId="custom:it"
        chartOverride={c}
        equippedSkill="none"
        onFinish={onFinish}
        onQuit={onQuit}
      />
    ),
  };
}

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
  useProgressStore.setState({ lastNewlyCompleted: [], claimed: {}, bestByStage: {}, runHistory: [] } as never);
});

describe("판정 파이프라인", () => {
  it("정확한 타이밍의 입력은 PERFECT 로 판정된다", async () => {
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(2 );
    keyDown(0);
    keyUp(0);

    const r = await playOut(onFinish);
    expect(r).toBeTruthy();
    expect(r!.counts.PERFECT).toBe(1);
    expect(r!.counts.MISS).toBe(0);
    expect(r!.accuracy).toBeCloseTo(1, 2);
    expect(r!.maxCombo).toBe(1);
  });

  it("없는 레인을 누르면 MISS 로 집계된다", async () => {
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    // 레인 0 의 노트에 레인 2 를 누른다
    await advanceTo(2 );
    keyDown(2);
    keyUp(2);

    const r = await playOut(onFinish);
    expect(r!.counts.MISS).toBe(1);
    expect(r!.counts.PERFECT).toBe(0);
    expect(r!.maxCombo).toBe(0);
    expect(r!.allPerfect).toBe(false);
  });

  it("아무것도 안 치면 전부 MISS 다", async () => {
    const c = chart(
      [note({ id: 1, time: 1, lane: 0 }), note({ id: 2, time: 2, lane: 1 })],
      3
    );
    const { onFinish } = mountGame(c);
    await startGame();
    const r = await playOut(onFinish);
    expect(r!.counts.MISS).toBe(2);
    expect(r!.accuracy).toBeLessThan(1);
  });

  it("모든 노트를 치면 ALL PERFECT 결과가 나온다", async () => {
    const notes = [1, 2, 3, 4].map((i) => note({ id: i, time: 1 + i, lane: (i % 4) as 0 | 1 | 2 | 3 }));
    const c = chart(notes, 6);
    const { onFinish } = mountGame(c);
    await startGame();

    for (const n of notes) {
      await advanceTo(n.time );
      keyDown(n.lane);
      keyUp(n.lane);
    }

    const r = await playOut(onFinish);
    expect(r!.allPerfect).toBe(true);
    expect(r!.counts.PERFECT).toBe(4);
    expect(r!.maxCombo).toBe(4);
    expect(r!.score).toBeGreaterThan(0);
    expect(r!.stageId).toBe("custom:it");
  });

  it("가짜 노트는 눌러도 판정되지 않는다 (funcake)", async () => {
    const c = chart(
      [note({ id: 1, time: 1, lane: 0, gimmick: "fake" }), note({ id: 2, time: 2, lane: 1 })],
      3
    );
    const { onFinish } = mountGame(c);
    await startGame();

    // 함정을 누른다 (레인 0)
    await advanceTo(1 );
    keyDown(0);
    keyUp(0);
    // 진짜 노트를 놓친다
    await advanceTo(2 - 1);
    await playOut(onFinish);

    const r = onFinish.mock.calls[0][0] as GameResult;
    // 가짜 노트는 채점에 포함되지 않는다 → 주어진 판정 없음
    expect(r.counts.PERFECT + r.counts.MISS + r.counts.GREAT + r.counts.GOOD + r.counts.BAD).toBeLessThanOrEqual(1);
  });

  it("기믹 노트(invisible / speedUp) 도 판정된다", async () => {
    const notes = [
      note({ id: 1, time: 1, lane: 0, gimmick: "invisible" }),
      note({ id: 2, time: 2, lane: 1, gimmick: "speedUp" }),
    ];
    const c = chart(notes, 4);
    const { onFinish } = mountGame(c);
    await startGame();
    for (const n of notes) {
      await advanceTo(n.time );
      keyDown(n.lane);
      keyUp(n.lane);
    }
    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(2);
    expect(r!.allPerfect).toBe(true);
  });
});

describe("홀드 노트 (B-01)", () => {
  it("홀드를 끝까지 누르고 있으면 정상 판정된다", async () => {
    const c = chart([note({ id: 1, time: 1, lane: 0, hold: 1 })], 4);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1 );
    keyDown(0);
    await advanceTo(1.2); // 홀드 구간 유지
    keyUp(0);

    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(1);
    expect(r!.forcedReleases ?? 0).toBe(0);
    expect(r!.releaseCounts).toBeTruthy();
  });

  it("놓친 홀드는 곡이 끝나면 강제 해제된다 (레인 잠금 방지)", async () => {
    const c = chart([note({ id: 1, time: 1, lane: 0, hold: 4 })], 8);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1 );
    keyDown(0);
    // 끝까지 놓친 채 곡이 끝나도록 둔다
    const r = await playOut(onFinish);
    expect(r!.forcedReleases ?? 0).toBeGreaterThan(0);
  });
});

describe("연속 / 점수 / 게이지", () => {
  it("연속이 끊기면 maxCombo 에 반영되지 않는다", async () => {
    const notes = [
      note({ id: 1, time: 1, lane: 0 }),
      note({ id: 2, time: 2, lane: 1 }),
      note({ id: 3, time: 3, lane: 2 }),
    ];
    const c = chart(notes, 5);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1 );
    keyDown(0);
    keyUp(0);
    // 2번째는 놓친다
    await advanceTo(3 - 2);
    keyDown(2);
    keyUp(2);

    const r = await playOut(onFinish);
    expect(r!.maxCombo).toBe(1);
    expect(r!.allPerfect).toBe(false);
  });

  it("분노 게이지와 주가는 판정에 반응한다 (0~100 유지)", async () => {
    const notes = [1, 2, 3, 4, 5].map((i) => note({ id: i, time: 1 + i }));
    const c = chart(notes, 8);
    const { onFinish } = mountGame(c);
    await startGame();
    const r = await playOut(onFinish);
    expect(r!.anger).toBeGreaterThanOrEqual(0);
    expect(r!.anger).toBeLessThanOrEqual(100);
    expect(Number.isFinite(r!.stock)).toBe(true);
    expect(r!.stock).toBeGreaterThan(0);
  });
});

describe("일시정지 / 종료", () => {
  it("일시정지 중에는 판정이 멈춘다", async () => {
    const c = chart([note({ id: 1, time: 2 })], 4);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByText("일시정지")).toBeTruthy();

    // 정지 중인데 노트를 친다 → 판정되지 않는다
    keyDown(0);
    keyUp(0);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(0);
  });

  it("포기하면 결과를 만들지 않고 상위 quit 만 부른다", async () => {
    const onFinish = vi.fn();
    const onQuit = vi.fn();
    mountGame(chart([note({ id: 1, time: 2 })], 5), onFinish, onQuit);
    await startGame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    act(() => {
      screen.getByRole("button", { name: /포기하고 나가기/ }).click();
    });
    expect(onQuit).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });
});