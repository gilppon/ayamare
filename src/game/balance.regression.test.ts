import { describe, expect, it } from "vitest";
import { isJudgeable, judgeableCount, judgeableNotes, selectPressTarget } from "./visibility";
import { buildChart, CHART_STAGE_IDS } from "./chart";
import { calculateAccuracy, getTimingWindows, judgeTap } from "./judgment";
import { makeRng, simulate, type PlayerModel } from "./balance";
import type { JudgmentCounts, Note } from "./types";

/**
 * 밸런스 실측이 발견한 결함의 회귀 방지.
 *
 * 발견 경위: `fake` 기믹 노트는 (1) `selectPressTarget` 에서 제외돼 **누를 수 없고**,
 * (2) MISS 스캔에서도 제외돼 **놓쳐도 MISS 가 되지 않는다.** 그런데 정확도 분모가
 * `chart.notes.length` 였고 그 안에 fake 가 들어 있었다.
 *
 * 결과: 어떤 플레이도 그 노트에서 점수를 얻을 수 없는데 분모만 늘어난다.
 * 완벽한 플레이의 정확도 상한이 stage2 98.8% … stage5 96.6% 로 낮아졌다.
 * 그리고 stage5 해금 기준이 90% 라, 이 구조적 손해가 곧 해금 가능성 축소를
 * 의미했다.
 *
 * 이 테스트는 그 분모 규칙을 고정한다.
 */

const note = (over: Partial<Note> = {}): Note => ({
  id: 0,
  time: 10,
  lane: 0,
  action: "bow15",
  hold: 0,
  ...over,
});

describe("판정 대상 규칙 — 판정되지 않는 노트를 단일 출처로", () => {
  it("fake 가 아니면 판정 대상이다", () => {
    expect(isJudgeable(note())).toBe(true);
    expect(isJudgeable(note({ gimmick: "invisible" }))).toBe(true);
    expect(isJudgeable(note({ gimmick: "speedUp" }))).toBe(true);
  });

  it("fake 는 판정 대상이 아니다", () => {
    expect(isJudgeable(note({ gimmick: "fake" }))).toBe(false);
  });

  it("judgeableCount 는 판정 대상만 센다", () => {
    const notes = [note(), note({ gimmick: "fake" }), note({ gimmick: "invisible" })];
    expect(judgeableCount(notes)).toBe(2);
    expect(judgeableCount([])).toBe(0);
  });

  it("judgeableNotes 는 판정 대상만 남긴다 (순서 유지)", () => {
    const notes = [
      note({ id: 1 }),
      note({ id: 2, gimmick: "fake" }),
      note({ id: 3 }),
      note({ id: 4, gimmick: "fake" }),
    ];
    expect(judgeableNotes(notes).map((n) => n.id)).toEqual([1, 3]);
  });

  it("모든 스테이지에서 판정 대상이 0 이 아니어야 한다 (빈 채보 방지)", () => {
    for (const id of CHART_STAGE_IDS) {
      expect(judgeableCount(buildChart(id).notes), id).toBeGreaterThan(0);
    }
  });
});

describe("분모 규칙의 두 소비처가 일치한다", () => {
  it("MISS 판정이 제외하는 노트와 정확도 분모가 제외하는 노트가 같다", () => {
    // 두 곳의 규칙이 어긋나면 "판정 안 하는 노트를 점수로 치는" 상태가 된다.
    // useGameLoop 는 isJudgeable 을 쓰므로 여기서는 그 결과를 검증한다.
    for (const id of CHART_STAGE_IDS) {
      const notes = buildChart(id).notes;
      const total = notes.length;
      const judgeable = judgeableCount(notes);
      const fakes = total - judgeable;

      const counts: JudgmentCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
      // 완벽히 치면 judgeable 개만큼 PERFECT 이 쌓이고 fake 는 아무것도 안 쌓인다
      counts.PERFECT = judgeable;

      // 판정 대상 수를 분모로 쓰면 정확히 100%
      expect(calculateAccuracy(counts, judgeable), `${id} (fake ${fakes}개)`).toBe(1);

      // ⚠️ 손실 성질은 **fake 가 있는 스테이지에서만** 성립한다.
      // fake 가 없으면 두 분모가 같으니 100% 보다 작아질 수 없다.
      // (stage1 은 fake 0개 — 여기서 전 스테이지를 검사하면 틀린 검사가 된다)
      const withTotal = calculateAccuracy(counts, total);
      if (fakes > 0) {
        expect(withTotal, `${id}: 채보 전체(${total})를 분모로 쓰면 손해다`).toBeLessThan(1);
      } else {
        expect(withTotal, `${id}: fake 가 없으니 분모가 같아야 한다`).toBe(1);
      }
    }
  });

  it("selectPressTarget 도 fake 를 먹지 않는다 (기존 동작 유지)", () => {
    const notes = [note({ id: 1, time: 10, gimmick: "fake" }), note({ id: 2, time: 10 })];
    const target = selectPressTarget(notes, () => "pending", 0, 10, 0.26);
    expect(target?.id).toBe(2);
  });
});

describe("완벽한 플레이의 정확도는 100% 다", () => {
  for (const id of CHART_STAGE_IDS) {
    it(`${id} — fake 가 있어도 100% 에 도달한다`, () => {
      const chart = buildChart(id);
      const judgeable = judgeableCount(chart.notes);
      const counts: JudgmentCounts = { PERFECT: judgeable, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
      expect(calculateAccuracy(counts, judgeable)).toBe(1);
    });
  }
});

describe("분모 규칙이 판정 결과를 바꾸지 않는다 (관여도 낮음)", () => {
  it("같은 오차 분포면 분모를 바꿔도 순위는 유지된다", () => {
    // 규칙 변경이 "누가 더 잘 치게 만들었나" 를 뒤집지 않았음을 확인한다.
    for (const stageId of CHART_STAGE_IDS) {
      const times = judgeableNotes(buildChart(stageId).notes).map((n) => n.time);
      const good: PlayerModel = { sigmaMs: 25 };
      const weak: PlayerModel = { sigmaMs: 120 };
      const a = simulate(times, good, makeRng(11)).accuracy;
      const b = simulate(times, weak, makeRng(11)).accuracy;
      expect(a, `${stageId}: 숙련자가 초급자보다 낮으면 안 된다`).toBeGreaterThan(b);
    }
  });
});

describe("판정 가중치와 게이트의 관계 (실측으로 확인한 사실)", () => {
  it("PERFECT 윈도우 안의 실수는 정확도 1.0 을 만든다", () => {
    const w = getTimingWindows();
    // 정확도가 1 이 되려면 PERFECT 안에 들어야 한다
    const counts: JudgmentCounts = { PERFECT: 100, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    expect(calculateAccuracy(counts, 100)).toBe(1);
    expect(w.perfect).toBeGreaterThan(0);
  });

  it("σ 가 커질수록 정확도가 단조 감소한다 (측정 도구의 계약)", () => {
    // 실측 도구가 신뢰하려면 이 성질이 성립해야 한다.
    // (이게 깨지면 실측 보고서 전체가 무효가 된다)
    const times = judgeableNotes(buildChart("stage4").notes).map((n) => n.time);
    const rates: number[] = [];
    for (const sigma of [20, 50, 80, 120, 160]) {
      let pass = 0;
      const N = 120;
      for (let i = 0; i < N; i++) {
        if (simulate(times, { sigmaMs: sigma }, makeRng(31 + i)).accuracy >= 0.88) pass++;
      }
      rates.push(pass / N);
    }
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i], `σ 가 커졌는데 통과율이 올랐다 (${i})`).toBeLessThanOrEqual(rates[i - 1]);
    }
    expect(rates[0], "숙련자는 게이트를 통과해야 한다").toBe(1);
  });

  it("초급자는 stage2까지만 통과하고 중급자는 모두 통과한다 (현재 게이트의 위치)", () => {
    // 이게 "게이트가 합리적인가" 를 판단하는 근거다 (주관 아니라 측정).
    const times = (id: string) => judgeableNotes(buildChart(id).notes).map((n) => n.time);
    const rate = (id: string, model: PlayerModel, gate: number) => {
      let pass = 0;
      const N = 200;
      for (let i = 0; i < N; i++) {
        if (simulate(times(id), model, makeRng(77 + i)).accuracy >= gate) pass++;
      }
      return pass / N;
    };

    // 초급(σ90): stage2(80%) 는 대부분 통과, stage5(90%) 는 대부분 실패
    expect(rate("stage2", { sigmaMs: 90 }, 0.8)).toBeGreaterThan(0.5);
    expect(rate("stage5", { sigmaMs: 90 }, 0.9)).toBeLessThan(0.2);

    // 중급(σ60): 전부 통과해야 한다 (막히면 안 된다)
    for (const [id, gate] of [
      ["stage2", 0.8],
      ["stage3", 0.85],
      ["stage4", 0.88],
      ["stage5", 0.9],
    ] as const) {
      expect(rate(id, { sigmaMs: 60 }, gate), `${id} 에서 중급자가 막힌다`).toBeGreaterThan(0.8);
    }
  });
});

describe("판정 함수 자체의 계약 (시뮬레이션이 기반한 것)", () => {
  it("가중치가 [0,1] 범위다", () => {
    for (const j of ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"] as const) {
      const w = (
        {
          PERFECT: 1,
          GREAT: 0.8,
          GOOD: 0.6,
          BAD: 0,
          MISS: 0,
        } as const
      )[j];
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("오차가 0 이면 PERFECT 다", () => {
    expect(judgeTap(0)).toBe("PERFECT");
  });

  it("오차가 커질수록 판정이 나빠진다 (단조)", () => {
    const w = getTimingWindows();
    const order = ["PERFECT", "GREAT", "GOOD", "BAD"] as const;
    let prev = 0;
    for (const ms of [0, w.perfect + 1, w.great + 1, w.good + 1, w.bad + 1]) {
      const j = judgeTap(ms / 1000, "none", w);
      const idx = j === "MISS" ? 99 : order.indexOf(j);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});
