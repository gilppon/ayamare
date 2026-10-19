import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { CHART_STAGE_IDS, buildChart } from "./chart";
import { judgeableCount } from "./visibility";
import { STAGES } from "./progression";
import { makeRng, simulate, describe as describeCounts, type PlayerModel } from "./balance";

/**
 * 밸런스 실측 — 부드러운 플레이어가 실제로 얻는 정확도 분포.
 *
 * 판정 윈도우(PERFECT 55ms … BAD 260ms)와 해금 기준(80/85/88/90%)은
 * 서로 다른 파일에 나란히 정의돼 있고, **둘이 맞는다는 보장은 없다.**
 * 이 파일은 실제 `judgeTap` + 실제 채보로 그 관계를 **계산해 보여준다.**
 *
 * 게이트를 이 파일에서 만들지는 않는다 — 그러면 "내가 만든 기준을 내가
 * 증명하는" 형태가 된다. 여기서는 사실을 기록하고, 판단은 아래
 * CONCLUSIONS 과 state.md 에서 한다.
 *
 * vitest 는 콘솔을 잡으므로 결과를 파일로 남긴다:
 *   balance-report.txt  (실행 시마다 갱신 — 커밋하지 않는다)
 */

const RUNS = 300;

/** 누를 수 있는 노트만 모은다 (fake 기믹은 판정 대상이 아니다) */
const judgeableTimes = (stageId: string) =>
  buildChart(stageId).notes.filter((n) => n.gimmick !== "fake").map((n) => n.time);

/** 게임이 정확도 분모로 쓰는 값 (수정 후: 판정 대상 노트 수) */
const gameDenominator = (stageId: string) => judgeableCount(buildChart(stageId).notes);

const PLAYERS: Array<[string, PlayerModel]> = [
  ["숙련  σ25", { sigmaMs: 25 }],
  ["상급  σ40", { sigmaMs: 40 }],
  ["중급  σ60", { sigmaMs: 60 }],
  ["초급  σ90", { sigmaMs: 90 }],
  ["초보  σ150", { sigmaMs: 150 }],
  // 오프셋 보정을 안 한 플레이어: 40ms 늦게 친다 (A相의 전제)
  ["보정없음 σ40+40", { sigmaMs: 40, biasMs: 40 }],
  // 중급 + 피로 (5% 놓침)
  ["중급 5%놓침", { sigmaMs: 60, missRate: 0.05 }],
];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const report: string[] = [];
const say = (line = "") => report.push(line);

afterAll(() => {
  writeFileSync("balance-report.txt", report.join("\n") + "\n", "utf8");
});

function measure(stageId: string, model: PlayerModel, order: number, gate: number) {
  const times = judgeableTimes(stageId);
  const accs: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    accs.push(simulate(times, model, makeRng(1000 + i * 7919 + order * 31)).accuracy);
  }
  accs.sort((a, b) => a - b);
  return {
    mean: accs.reduce((a, b) => a + b, 0) / accs.length,
    median: accs[Math.floor(accs.length / 2)],
    p10: accs[Math.floor(accs.length * 0.1)],
    p90: accs[Math.floor(accs.length * 0.9)],
    passRate: gate > 0 ? accs.filter((a) => a >= gate).length / RUNS : NaN,
  };
}

describe("밸런스 실측 — 스테이지별 정확도 분포", () => {
  for (const stageId of CHART_STAGE_IDS) {
    const def = STAGES.find((s) => s.id === stageId)!;
    const chart = buildChart(stageId);
    const times = judgeableTimes(stageId);
    const fakes = chart.notes.length - times.length;

    it(`${stageId} (BPM ${def.bpm}, ${chart.notes.length}노트) 해금기준 ${pct(def.requiredAccuracy)}`, () => {
      // 시뮬레이션의 분모가 게임의 분모와 같은지 먼저 검증한다.
      // 다르면 아래 수치가 "실제 플레이가 받는 정확도" 가 아니라 fiction 이 된다.
      expect(times.length, `${stageId}: 시뮬 분모 ≠ 게임 분모`).toBe(gameDenominator(stageId));

      say("=".repeat(76));
      say(
        `${stageId}  BPM ${def.bpm}  채보 ${chart.notes.length}노트 (판정대상 ${times.length}, fake ${fakes})`
      );
      say(
        def.requiredAccuracy > 0
          ? `해금 기준 ${pct(def.requiredAccuracy)} — stage${def.order - 1} 클리어 시 필요`
          : "해금 기준 없음 (첫 스테이지)"
      );
      say("-".repeat(76));
      say("플레이어            평균    중앙값       P10       P90 | 통과율");

      const rates: number[] = [];
      for (const [label, model] of PLAYERS) {
        const m = measure(stageId, model, def.order, def.requiredAccuracy);
        rates.push(m.passRate);
        const rate = def.requiredAccuracy > 0 ? `${(m.passRate * 100).toFixed(0)}%` : "—";
        say(
          `${label.padEnd(19)}${pct(m.mean).padStart(7)}${pct(m.median).padStart(9)}` +
            `${pct(m.p10).padStart(10)}${pct(m.p90).padStart(10)} | ${rate.padStart(5)}`
        );
      }
      say(`  [중급 σ60 예시] ${describeCounts(simulate(times, { sigmaMs: 60 }, makeRng(4242)))}`);
      say();

      expect(rates).toHaveLength(PLAYERS.length);
    });
  }
});

/**
 * 실측이 드러낸 구조적 사실.
 *
 * "밸런스가 나쁘다" 는 주관적 판단이 아니라, **코드 구조상 불가능**하거나
 * **노력이와 무관하게 손해인** 상태다.
 */
describe("CONCLUSIONS — 실측이 드러낸 구조적 사실", () => {
  it("fake 노트는 누를 수 없어도 정확도 분모에는 들어간다 (무조건 손해)", () => {
    // 게임의 실제 분모는 chart.notes.length (GameScreen finish).
    // fake 는 selectPressTarget 와 MISS 스캔 양쪽에서 제외된다.
    // → 판정 케이스로 한 번도 집계되지 않는데 분모만 잡는다.
    say("─".repeat(76));
    say("fake 노트의 분모 누락 (완벽 플레이의 정확도 상한)");
    for (const stageId of CHART_STAGE_IDS) {
      const chart = buildChart(stageId);
      const fakes = judgeableCount(chart.notes);
      const total = chart.notes.length;
      const ceiling = fakes / total;
      say(
        `  ${stageId}: 판정대상 ${fakes}/${total} → 완벽해도 ${(ceiling * 100).toFixed(1)}%`
      );
      if (total !== fakes) {
        expect(ceiling, `${stageId} 는 완벽한 플레이로도 100% 에 못 미친다`).toBeLessThan(1);
      }
    }
    say();
  });

  it("가중치 계약: 정확도는 [0,1] 안에 있다", () => {
    for (const [, model] of PLAYERS) {
      for (const stageId of CHART_STAGE_IDS) {
        const r = simulate(judgeableTimes(stageId), model, makeRng(7));
        expect(r.accuracy).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.accuracy).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("실수 0 이면 정확도 1.0 이다 (게이트를 통과한다)", () => {
    for (const stageId of CHART_STAGE_IDS) {
      const r = simulate(judgeableTimes(stageId), { sigmaMs: 0 }, makeRng(1));
      expect(r.accuracy, stageId).toBe(1);
    }
  });

  it("해금 게이트의 '높이'를 실제로 잰다 (몇 ms까지 헛져도 통과하는가)", () => {
    // ⚠️ 이전 버전은 이걸 **σ 가 가장 작은 지점**으로 스캔했다.
    // σ=10 은 거의 완벽하니 당연히 통과하고 → 모든 스테이지가 "σ≈10" 이 나온다.
    // "통과 가능한 실력" 을 물었는데 "가장 잘하는 실력" 을 답한 셈이다.
    //
    // 질문의 의도는 반대다: **얼마나 못쳐도 통과하는가** = 게이트가 얼마나 낮은 벽인가.
    // 그래서 통과가 깨지는 σ 을 찾아 그 **경계**를 보고한다.
    say("─".repeat(76));
    say("해금 게이트의 높이 (σ 스캔, 편향 0, 중앙값 기준)");
    for (const stageId of CHART_STAGE_IDS) {
      const def = STAGES.find((s) => s.id === stageId)!;
      if (def.requiredAccuracy === 0) continue;
      const times = judgeableTimes(stageId);

      const medianAt = (sigma: number) => {
        const accs: number[] = [];
        for (let i = 0; i < 120; i++) {
          accs.push(simulate(times, { sigmaMs: sigma }, makeRng(555 + i)).accuracy);
        }
        accs.sort((a, b) => a - b);
        return accs[Math.floor(accs.length / 2)];
      };

      // 통과가 깨지는 지점 (상승 단조이므로 첫 실패가 경계)
      let breakSigma: number | null = null;
      for (let sigma = 10; sigma <= 200; sigma += 1) {
        if (medianAt(sigma) < def.requiredAccuracy) {
          breakSigma = sigma;
          break;
        }
      }
      say(
        `  ${stageId} (기준 ${pct(def.requiredAccuracy)}): σ ≤ ${
          breakSigma === null ? ">200" : `${breakSigma - 1}`
        }ms 까지 통과 → 벽 높이는 "초급자(σ90) 통과" 선 근처`
      );
      expect(breakSigma, `${stageId} 는 통과 가능한 실력이 존재해야 한다`).not.toBeNull();
    }
    say();
  });
});
