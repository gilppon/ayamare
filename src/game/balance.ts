/**
 * 밸런스 실측 — 부드러운 플레이어가 실제로 얻는 정확도 분포.
 *
 * 왜 이게 필요한가:
 *   판정 윈도우(PERFECT 55ms … BAD 260ms)와 해금 기준(80/85/88/90%)은
 *   서로 다른 파일에 나란히 정의돼 있고, **둘이 맞는다는 보장은 없다.**
 *   숫자를 "그럴듯하게" 넣어서는 알 수 없다 — 재현해야 안다.
 *
 * 이 모듈은 실제 `judgeTap` / `calculateAccuracy` / 실제 채보 데이터를 써서
 * 플레이어의 타이밍 실수를 **분포로** 주입하고, 그 결과를 계산한다.
 * 즉 게임과 같은 수식으로 같은 결정을 내린다 (재현이 아니라 사용).
 *
 * 모델의 한계 (이걸 감춰야 정직하다):
 *   - 판정은 노트마다 독립적으로 뽑는다 (실제 플레이의 연쇄 실수는 이보다 나쁘다)
 *   - 홀드 릴리즈 판정은 탭과 별개로 계산한다
 *   - 눈으로 오는 시각 → 손의 반응 지연 같은 **계통적 편향**은 `bias` 로만 주입한다
 *   이 한계 때문에 "최악의 경우" 수치는 낙관적이다.
 */

import { judgeTap, calculateAccuracy, getTimingWindows } from "./judgment";
import type { Judgment, JudgmentCounts } from "./types";

export interface PlayerModel {
  /**
   * 타이밍 오차의 표준편차 (ms).
   *
   * 리듬게임 실력의 통상적 해석:
   *   25ms — 숙련자 (Frame Perfect 체감)
   *   40ms — 상급자
   *   60ms — 중급자
   *   90ms — 초급자
   *   150ms — 처음 잡은 손
   */
  sigmaMs: number;
  /**
   * 계통적 편향 (ms). 양수 = 늦게 친다.
   *
   * 중요한 현실 요소: 사람은 **일찍 치려 하면 오히려 늦게 친다.**
   * ("너무 빨리 치려다가 망치는" 패턴) 그래서 분포가 0 에 비대칭이 아니다.
   * A(오디오 오프셋) 를 안 한 플레이어는 여기서 30~80ms 늦는다.
   */
  biasMs?: number;
  /** 노트를 아예 놓치는 비율 (0~1). 피로·집중력 저하를 표현한다 */
  missRate?: number;
}

/** 표준정규분포 표본 (Box–Muller). 결정론적 시드를 쓰기 위해 난수원을 주입한다 */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    // mulberry32 — 짧고 분포가 좋다
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: Rng): number {
  // Box–Muller. u=0 이면 log(0) 이라 -Infinity 가 되므로 밀어낸다.
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 이 플레이어가 노트 하나에 낸 절대 타이밍 오차 (초) */
export function sampleErrorSec(model: PlayerModel, rng: Rng): number {
  const bias = model.biasMs ?? 0;
  const errMs = bias + gaussian(rng) * model.sigmaMs;
  return errMs / 1000;
}

export interface SimResult {
  counts: JudgmentCounts;
  accuracy: number;
  /** 누를 수 있는 노트 수 (fake 기믹 제외 — 실제 판정 대상) */
  judgeable: number;
  /** 채보 전체 노트 수 (게임이 정확도 분모로 쓰는 값) */
  total: number;
}

/**
 * 채보 하나를 플레이한다.
 *
 * @param times 누를 수 있는 노트들의 시각 (초). fake 는 호출자가 제외한다.
 *        (노트의 **개수**만 쓰므로 이 값의 절대 시각은 결과에 영향을 주지 않는다 —
 *         판정은 오차만으로 결정된다. 그래도 실제 채보를 그대로 넘겨야
 *         "이 채보를 이 사람이 치면" 이라는 문장이 거짓이 되지 않는다)
 */
export function simulate(times: readonly number[], model: PlayerModel, rng: Rng): SimResult {
  const windows = getTimingWindows();
  const counts: JudgmentCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
  for (const _time of times) {
    if (model.missRate && rng() < model.missRate) {
      counts.MISS++;
      continue;
    }
    const j: Judgment = judgeTap(Math.abs(sampleErrorSec(model, rng)), "none", windows);
    counts[j]++;
  }
  // total 은 **판정이 발생한 노트 수** (MISS 로 끝나도 1개로 친다)
  const judgeable = times.length;
  const accuracy = calculateAccuracy(counts, judgeable);
  return { counts, accuracy, judgeable, total: judgeable };
}

/** 판정 가중치를 표로 (사람이 읽을 요약) */
export function describe(result: SimResult): string {
  const c = result.counts;
  const total = c.PERFECT + c.GREAT + c.GOOD + c.BAD + c.MISS;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1).padStart(5) : "  0.0");
  return (
    `P${pct(c.PERFECT)}% G${pct(c.GREAT)}% g${pct(c.GOOD)}% ` +
    `B${pct(c.BAD)}% M${pct(c.MISS)}% → 정확도 ${(result.accuracy * 100).toFixed(2)}%`
  );
}
