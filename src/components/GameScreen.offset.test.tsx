import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import GameScreen from "./GameScreen";
import { advanceAudio, audioContexts } from "@/test/setup";
import { SONG_PREROLL_SEC } from "@/game/audio";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMetaStore } from "@/stores/metaStore";
import { buildChart } from "@/game/chart";
import { KEY_TO_LANE } from "@/game/constants";
import type { Chart, GameResult, Note } from "@/game/types";

/**
 * A — 오디오 지연 보정 **통합 테스트**.
 *
 * 핵심 계약은 두 가지다:
 *
 *  1. 보정은 **판정에만** 적용된다. 노트의 시각적 위치는 실제 오디오를 따라간다.
 *     (시각까지 옮기면 "노트를 따라 치는" 플레이가 어긋나 게임이 성립하지 않는다)
 *
 *  2. 늦게 치는 사용자(+오차)를 보정값이 상쇄한다.
 *     블루투스 150ms 지연 환경에서 PERFECT 이 가능해져야 한다.
 *
 * 순수 계산(`timing.ts`)만으로는 이 계약이 지켜졌는지 알 수 없다 —
 * 오프셋이 애초에 어느 경로에 끼어드는지가 중요하기 때문에 통합 레벨에서 검증한다.
 */

const base = buildChart("stage1");
const KEYS = ["a", "s", "d", " "] as const;

const chart = (notes: Note[], duration: number): Chart => ({
  ...base,
  title: "OFFSET",
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
  songOrigin = audioContexts[audioContexts.length - 1].currentTime;
}

const keyDown = (lane: 0 | 1 | 2 | 3) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
  });

async function playOut(onFinish: ReturnType<typeof vi.fn>) {
  await act(async () => {
    for (let i = 0; i < 400 && onFinish.mock.calls.length === 0; i++) {
      advanceAudio(0.05);
      await vi.advanceTimersByTimeAsync(50);
    }
  });
  return onFinish.mock.calls[0]?.[0] as GameResult | undefined;
}

function mountGame(c: Chart, onFinish = vi.fn()) {
  return {
    onFinish,
    ...render(
      <GameScreen
        stageId="custom:offset"
        chartOverride={c}
        equippedSkill="none"
        onFinish={onFinish}
        onQuit={vi.fn()}
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
    audioOffsetMs: 0,
    reduceMotion: false,
    colorblind: false,
    haptics: false,
    voice: false,
  });
  useMetaStore.setState({ ownedSkills: ["none"], equippedSkill: "none", points: 0, capital: 0 });
});

describe("A: 지연 보정이 판정에 적용된다", () => {
  it("보정 0 이면 기존 판정이 그대로 유지된다", async () => {
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(2);
    keyDown(0);

    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(1);
  });

  /**
   * 블루투스 시나리오: 소리가 150ms 늦게 들린다.
   * 사용자도 그만큼 늦게 치게 되므로, 오프셋 +150 로 상쇄해야 한다.
   *
   * note.time = 2.0 에 150ms 늦게 = songSec 2.15 부근에 친다.
   * `advanceTo` 는 목표 시각까지 **최소 1스텝** 전진하므로 정확히 그 시각을 지난다.
   */
  it("늦게 치는 입력을 오프셋이 상쇄한다 (블루투스 150ms)", async () => {
    useSettingsStore.setState({ audioOffsetMs: 150 });

    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(2.15);
    keyDown(0);

    const r = await playOut(onFinish);
    // 보정 없으면 GOOD/GREAT, 보정 있으면 PERFECT
    expect(r!.counts.PERFECT).toBe(1);
    expect(r!.counts.MISS).toBe(0);
  });

  it("빠르게 치는 입력을 음수 오프셋이 상쇄한다", async () => {
    useSettingsStore.setState({ audioOffsetMs: -150 });

    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1.85);
    keyDown(0);

    const r = await playOut(onFinish);
    expect(r!.counts.PERFECT).toBe(1);
  });

  /**
   * 오프셋이 **어떤 클럭에** 걸리는지 한 번에 판정한다.
   *
   * +150 보정 상태에서 노트보다 정확히 150ms 늦게 친다:
   *   - 판정 클럭에 걸렸다면 → PERFECT, 기록된 오차도 ≈ 0
   *   - 렌더 클럭에 걸렸다면 → 화면의 노트가 어긋나 "눈으로 따라치는" 플레이가 무너진다.
   *
   * 기록 오차가 0 인 것은 **보정 후 클럭**으로 오차를 잰다는 뜻이므로,
   * 판정에 쓰이는 시각과 진단에 쓰이는 시각이 같음을 함께 증명한다.
   */
  it("보정은 판정 클럭에만 걸리고, 진단 오차도 같은 클럭을 본다", async () => {
    useSettingsStore.setState({ audioOffsetMs: 150 });
    const notes = Array.from({ length: 4 }, (_, i) => note({ id: i + 1, time: 2 + i * 0.4 }));
    const onFinish = vi.fn();
    const view = mountGame(chart(notes, 5), onFinish);
    await startGame();

    for (const n of notes) {
      await advanceTo(n.time + 0.15);
      keyDown(0);
    }

    const r = (await playOut(onFinish))!;
    expect(r.counts.PERFECT).toBe(4);
    // 보정 후 오차 ≈ 0 → 진단이 판정과 같은 클럭을 본다
    expect(Math.abs(r.timing!.meanMs)).toBeLessThan(40);
    expect(r.timing!.suggestedOffsetMs).toBe(0);
    // 렌더가 유효하다 (오프셋이 렌더에 새어 NaN/무한대가 되지 않는다)
    expect(view.container.innerHTML).not.toContain("NaN");
    expect(view.container.innerHTML).not.toContain("Infinity");
  });
});

describe("A3: 결과에 타이밍 통계가 실린다", () => {
  it("누른 오차가 결과 객체에 포함된다", async () => {
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(2);
    keyDown(0);

    const r = await playOut(onFinish);
    expect(r!.timing).toBeTruthy();
    expect(r!.timing!.count).toBe(1);
    // 정타이므로 오차 ≈ 0
    expect(Math.abs(r!.timing!.meanMs)).toBeLessThan(30);
  });

  it("보정 후 오차가 기록된다 (self-feedback 방지)", async () => {
    // 오프셋 -150 인데 실제로 1.85 에 쳤다.
    // 보정 후 입력 시각은 2.0 → 오차 ≈ 0 이어야 한다.
    // (보정 전 오차를 기록하면 설정값이 자기 자신을 되먹임한다)
    useSettingsStore.setState({ audioOffsetMs: -150 });
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(1.85);
    keyDown(0);

    const r = await playOut(onFinish);
    expect(Math.abs(r!.timing!.meanMs)).toBeLessThan(30);
    // 보정 전 오차였다면 ≈ -150 으로 기록되었을 것이다
    expect(r!.timing!.meanMs).toBeGreaterThan(-50);
  });

  it("한 타도 안 치면 통계 표본이 0 이다 (빈 상태 방어)", async () => {
    const c = chart([note({ id: 1, time: 2 })], 3);
    const { onFinish } = mountGame(c);
    await startGame();

    await advanceTo(2.6); // 노트를 놓친다
    const r = await playOut(onFinish);
    expect(r!.timing!.count).toBe(0);
    expect(r!.timing!.suggestedOffsetMs).toBe(0);
    expect(r!.timing!.suggestionReliable).toBe(false);
  });

  it("여러 타를 치면 평균이 실제 지연 방향을 가리킨다", async () => {
    const notes = Array.from({ length: 6 }, (_, i) => note({ id: i + 1, time: 2 + i * 0.5 }));
    const c = chart(notes, 6);
    const { onFinish } = mountGame(c);
    await startGame();

    // 매번 100ms 늦게 친다
    for (let i = 0; i < notes.length; i++) {
      await advanceTo(notes[i].time + 0.1);
      keyDown(0);
    }

    const r = await playOut(onFinish);
    expect(r!.timing!.count).toBe(6);
    // 부호 규약: 양수 = 늦음
    expect(r!.timing!.meanMs).toBeGreaterThan(60);
    // 늦게 치는 사용자 → 양수 오프셋 권장 (판정을 앞당긴다)
    expect(r!.timing!.suggestedOffsetMs).toBeGreaterThan(0);
  });

  /**
   * 자기Referential 방어: 기록되는 것은 **보정 후** 오차여야 한다.
   *
   * 보정 전 오차를 기록하면 통계가 항상 "보정만큼 어긋났다" 고 말해 추천이
   * 계속 같은 방향을 밀어붓고, 사용자가 슬라이더를 만질수록 판정이 더 나빠진다.
   */
  it("보정 후 오차를 기록한다 (self-feedback 방지)", async () => {
    // +150 보정 상태에서 150ms 늦게 친다 → 보정 후 오차 ≈ 0
    useSettingsStore.setState({ audioOffsetMs: 150 });
    const notes = Array.from({ length: 6 }, (_, i) => note({ id: i + 1, time: 2 + i * 0.5 }));
    const c = chart(notes, 6);
    const { onFinish } = mountGame(c);
    await startGame();

    for (let i = 0; i < notes.length; i++) {
      await advanceTo(notes[i].time + 0.15);
      keyDown(0);
    }

    const r = await playOut(onFinish);
    // 보정 후 오차이므로 ≈ 0. 보정 전이면 +150 이었다.
    expect(Math.abs(r!.timing!.meanMs)).toBeLessThan(40);
    expect(r!.timing!.suggestedOffsetMs).toBe(0);
  });
});