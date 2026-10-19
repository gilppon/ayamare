import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import GameScreen from "./GameScreen";
import { advanceAudio } from "@/test/setup";
import { SONG_PREROLL_SEC } from "@/game/audio";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMetaStore } from "@/stores/metaStore";
import { buildChart } from "@/game/chart";
import { KEY_TO_LANE } from "@/game/constants";
import { calculateAccuracy } from "@/game/judgment";
import type { Chart, GameResult, Note } from "@/game/types";

/**
 * B — "더치면 이득" 구조 제거의 **통합 검증**.
 *
 * 순수함수 테스트(`judgment.test.ts`)가 "가중치가 0 이다" 만 확인한다면,
 * 실제 파이프라인에서 그 값이 어떻게 쓰이는지는 보이지 않는다.
 *
 * ⚠️ 이 파일은 **타이밍에 강하게 의존하지 않는** 성질만 단언한다.
 * jsdom + 가짜 타이머 환경에서는 곡 시각이 프레임 스텝만큼 밀리고,
 * 판정 경계 근처의 오프셋이 어느 판정으로 떨어질지 확정할 수 없다.
 * 그래서 "정확히 N타가 BAD 다" 같은 단언 대신,
 * **어떤 타이밍 분포에서도 성립하는 순서 관계**로 계약을 고정한다.
 */

const base = buildChart("stage1");
const KEYS = ["a", "s", "d", " "] as const;

const chart = (notes: Note[], duration: number): Chart => ({
  ...base,
  title: "BALANCE",
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

async function startGame() {
  await act(async () => {
    screen.getByRole("button", { name: /시작/ }).click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

/** 곡 시각을 `sec` 까지 전진 (60fps 고정 스텝) */
async function advanceTo(sec: number) {
  const steps = Math.max(1, Math.ceil((sec / 60) * 1000));
  await act(async () => {
    for (let i = 0; i < steps; i++) {
      advanceAudio(1 / 60);
      await vi.advanceTimersByTimeAsync(1000 / 60);
    }
  });
}

const keyDown = (lane: 0 | 1 | 2 | 3) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: KEYS[lane], code: `Key${KEYS[lane].toUpperCase()}` })
    );
  });

async function playOut(onFinish: ReturnType<typeof vi.fn>): Promise<GameResult> {
  await act(async () => {
    for (let i = 0; i < 500 && onFinish.mock.calls.length === 0; i++) {
      advanceAudio(0.05);
      await vi.advanceTimersByTimeAsync(50);
    }
  });
  return onFinish.mock.calls[0]?.[0] as GameResult;
}

function mountGame(c: Chart, onFinish = vi.fn()) {
  return {
    onFinish,
    ...render(
      <GameScreen
        stageId="custom:balance"
        chartOverride={c}
        equippedSkill="none"
        onFinish={onFinish}
        onQuit={vi.fn()}
      />
    ),
  };
}

/** 임의 오프셋으로 노트를 때려 결과를 얻는다 (프레임 오차 무관) */
async function playWithOffset(offsetSec: number, count = 6, gap = 0.8): Promise<GameResult> {
  const notes = Array.from({ length: count }, (_, i) => note({ id: i + 1, time: 2 + i * gap }));
  const onFinish = vi.fn();
  mountGame(chart(notes, 2 + count * gap + 2), onFinish);
  await startGame();
  // songOrigin 은 컨텍스트 생성 시각(0) 기준 — 곡 시각 = ctx - SONG_PREROLL
  for (const n of notes) {
    await advanceTo(n.time + offsetSec + SONG_PREROLL_SEC);
    keyDown(0);
  }
  return playOut(onFinish);
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

describe("B: 마구치기 전략이 통하지 않는다", () => {
  it("정확한 타이밍 → 손대지 않음보다 엄격히 좋다", async () => {
    const accurate = await playWithOffset(0);
    expect(accurate.counts.PERFECT + accurate.counts.GREAT).toBeGreaterThan(0);
    expect(accurate.accuracy).toBeGreaterThan(0);
  });

  /**
   * 핵심 계약 — **정확도가 높을수록 점수가 높다** (단조성).
   *
   * BAD 가 0.35 를 받았던 시기에는 "엉뚱하게 때리기"(0.35)가
   * "아무것도 안 치기"(0)보다 높았고, 그 이상으로某些 구간에서
   * "때리는 게 이득" 인 구간이 생겼다.
   * BAD=0 후에는 순서가 뒤집힐 수 없다.
   */
  it("정확도 단조성: 잘 때리면 잘 친 것보다 나쁘지 않다", async () => {
    const perfect = await playWithOffset(0);
    const late = await playWithOffset(0.2); // BAD/GOOD 경계 근처
    const sloppy = await playWithOffset(0.3); // BAD

    expect(perfect.accuracy).toBeGreaterThanOrEqual(late.accuracy);
    expect(late.accuracy).toBeGreaterThanOrEqual(sloppy.accuracy);
  });

  it("손대지 않으면 정확도 0 이다", async () => {
    const notes = Array.from({ length: 6 }, (_, i) => note({ id: i + 1, time: 2 + i * 0.8 }));
    const onFinish = vi.fn();
    mountGame(chart(notes, 8), onFinish);
    await startGame();
    await advanceTo(7);
    const r = await playOut(onFinish);
    expect(r.counts.MISS).toBe(notes.length);
    expect(r.accuracy).toBe(0);
  });

  it("주가는 마구치기로 보존되지 않는다 (감점 효율)", async () => {
    const sloppy = await playWithOffset(0.3, 30, 0.25);
    // 30타 BAD → (1-0.09)^30 ≈ 0.06 → 초기 8200 대비 크게 하락
    expect(sloppy.stock).toBeLessThan(8200 * 0.3);
  });

  it("분노는 마구치기로 속일 수 없다", async () => {
    const sloppy = await playWithOffset(0.3, 20, 0.3);
    // BAD +7 × 20 = +140 → 상한 100 도달
    expect(sloppy.anger).toBeGreaterThanOrEqual(99);
  });

  /**
   * 분노·주가의 "보상 경로"는 이 환경에서 단정할 수 없다.
   *
   * 곡 시각이 프레임 스텝만큼 밀려 어떤 판정이 떨어질지 확정할 수 없어,
   * "정확히 쳤으니 분노가 초기치 근처" 같은 단언은 **타이밍 잡음에 흔들린다**
   * (실측: offset 0 인데 분노가 80 까지 올라갔다 — PERFECT 이 아닌 판정이 섞임).
   *
   * 그래서 보상 경로는 `judgment.test.ts` 의 순수 테스트가
   * ANGER_DELTA / STOCK_DELTA 의 부호와 크기 관계로 고정하고,
   * 여기서는 **파이프라인이 그 상수를 실제로 소비한다** 는 것만 확인한다.
   */
  it("보상 경로: 판정 결과가 주가에 반영된다 (상수가 배선되어 있다)", async () => {
    const r = await playWithOffset(0.2, 8, 0.5);
    // 8타 중 무엇으로 판정되었든, GOOD 이상이면 주가가 오르고
    // BAD/MISS 가 섞이면 내려간다. 0 이면 어디서나 같으므로 배선 누락을 잡는다.
    expect(r.stock).not.toBe(8200);
  });
});

describe("B: 결과 판정이 순수함수와 일치한다", () => {
  it("게임이 계산한 정확도 = calculateAccuracy (파이프라인 정합성)", async () => {
    const r = await playWithOffset(0.1, 5, 0.5);
    expect(r.accuracy).toBeCloseTo(calculateAccuracy(r.counts, r.counts.PERFECT + r.counts.GREAT + r.counts.GOOD + r.counts.BAD + r.counts.MISS), 10);
  });

  it("모든 판정 집계 합이 전체 노트 수와 같다 (무언가 버려지지 않는다)", async () => {
    const count = 8;
    const r = await playWithOffset(0.12, count, 0.6);
    const sum = r.counts.PERFECT + r.counts.GREAT + r.counts.GOOD + r.counts.BAD + r.counts.MISS;
    expect(sum).toBe(count);
  });

  it("점수는 정확도와 독립적으로 지급된다 (별개 채널)", async () => {
    // 정확도가 낮아도 시도한 대가로 점수는 받는다
    const sloppy = await playWithOffset(0.3, 5, 0.5);
    expect(sloppy.score).toBeGreaterThan(0);
  });
});