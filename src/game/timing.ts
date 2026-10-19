/**
 * 타이밍 히스토그램 (순수함수).
 *
 * 리듬게임에서 플레이어가 자기 환경(유선/블루투스/TV 출력)을 맞추는 유일한 수단이
 * "지금 내가 얼마나 늦게 치고 있는가" 를 눈으로 보는 것이다. 숫자 스코어만으로는
 * "PERFECT 가 안 나온다" 는 사실만 알 수 있고, 원인을 알 수 없다.
 *
 * 이 모듈은 그 진단 정보를 계산만 한다. 표시와 입력 보정은 호출측이 한다.
 */

/** 히스토그램 버킷 (ms). 중앙 0 을 정확히 표현하도록 짝수 개 + 음수 포함. */
export const BUCKET_WIDTH_MS = 25;

/** 히스토그램 범위: ±200ms (블루투스 지연 상단까지) */
export const RANGE_MS = 200;

/** 버킷 경계 배열 (오름차순). BUCKET_WIDTH_MS 간격으로 -RANGE_MS ~ +RANGE_MS. */
export const BUCKET_EDGES: number[] = (() => {
  const edges: number[] = [];
  for (let ms = -RANGE_MS; ms <= RANGE_MS; ms += BUCKET_WIDTH_MS) edges.push(ms);
  return edges;
})();

export const BUCKET_COUNT = BUCKET_EDGES.length - 1;

// `TimingStats` 의 정본은 `types.ts` 다 (GameResult.timing 과 동일한 타입을 써야 한다).

import type { TimingStats as ResultTimingStats } from "./types";

export type TimingStats = ResultTimingStats;

const EMPTY_STATS: Omit<TimingStats, "suggestionReliable"> = {
  buckets: new Array(BUCKET_COUNT).fill(0),
  count: 0,
  meanMs: 0,
  medianMs: 0,
  stdDevMs: 0,
  meanAbsMs: 0,
  suggestedOffsetMs: 0,
};

/** 오차(ms) → 버킷 인덱스. 범위 밖은 양 끝으로 클램프한다. */
export function bucketIndexOf(errorMs: number): number {
  if (!Number.isFinite(errorMs)) return Math.floor(BUCKET_COUNT / 2);
  if (errorMs <= BUCKET_EDGES[0]) return 0;
  if (errorMs >= BUCKET_EDGES[BUCKET_COUNT]) return BUCKET_COUNT - 1;
  // BUCKET_EDGES 는 균등 간격이므로 나눗셈으로 충분하다.
  return Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor((errorMs + RANGE_MS) / BUCKET_WIDTH_MS)));
}

/**
 * 밀집도 가중 중앙값.
 *
 * 버킷 중심값으로 환산하므로 **해상도는 25ms** 다. 정확히 0 을цент으로 잡으면
 * ±12.5ms 근처가 0 이 아니라 +13 으로 나온다. 이 오차는 추천 오프셋에 그대로
 * 흘러 들어가 사용자에게 의미 없는 13ms 밀기를 제안하게 되므로,
 * 버킷 폭의 절반 이내면 0 으로 스냅한다 ("정확히 치는 플레이어는 건드리지 않는다").
 */
function weightedMedian(buckets: number[], edges: number[]): number {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const centers = edges.slice(0, -1).map((e, i) => e + (edges[i + 1] - e) / 2);
  let acc = 0;
  for (let i = 0; i < buckets.length; i++) {
    acc += buckets[i];
    if (acc >= total / 2) {
      const c = centers[i];
      return Math.abs(c) <= BUCKET_WIDTH_MS / 2 ? 0 : c;
    }
  }
  const last = centers[centers.length - 1];
  return Math.abs(last) <= BUCKET_WIDTH_MS / 2 ? 0 : last;
}

/**
 * 오차 표본들로부터 통계를 만든다.
 *
 * @param errorsMs 탭 판정 시점의 오차(밀리초). **양수 = 늦게 침, 음수 = 빨리 침.**
 *   즉 `입력시각 - 노트시각` 이다. 이 부호 규약은 결과 화면 히스토그램의
 *   x축 방향(왼쪽=빠름, 오른쪽=늦음)과 설정 슬라이더 방향을 함께 결정하므로
 *   **호출측과 반드시 일치해야 한다.**
 */
export function timingStats(errorsMs: number[]): TimingStats {
  const clean = errorsMs.filter((e) => Number.isFinite(e));
  if (clean.length === 0) {
    return { ...EMPTY_STATS, buckets: [...EMPTY_STATS.buckets], suggestionReliable: false };
  }

  const buckets = new Array(BUCKET_COUNT).fill(0);
  for (const e of clean) buckets[bucketIndexOf(e)]++;

  const sum = clean.reduce((a, b) => a + b, 0);
  const meanMs = sum / clean.length;
  const meanAbsMs = clean.reduce((a, b) => a + Math.abs(b), 0) / clean.length;
  const variance = clean.reduce((a, b) => a + (b - meanMs) ** 2, 0) / clean.length;
  const stdDevMs = Math.sqrt(variance);
  const medianMs = weightedMedian(buckets, BUCKET_EDGES);

  return {
    buckets,
    count: clean.length,
    meanMs,
    medianMs,
    stdDevMs,
    meanAbsMs,
    // 늦게 치는 사용자(+median)에게 **양수**를 권한다.
    // 판정은 `입력시각 - 오프셋` 이므로, 이 값을 넣으면 입력이 그만큼 앞당겨져
    // 실제 들린 소리(=늦게 도착한 신호)를 따라치는 손이 PERFECT 을 맞힌다.
    //
    // 중앙값을 쓰는 이유: 실수 1~2회로 평균이 끌려가는 것을 막는다.
    suggestedOffsetMs: Math.round(medianMs),
    suggestionReliable: false,
  };
}

/**
 * 표본이 추천 신뢰 구간에 드는지 여부 (자동 적용 금지 기준).
 *
 * 표본 20타 미만, 또는 표준편차 60ms 초과면 "이 플레이어는 아직 자기 타이밍을
 * 모른다" 고 본다. 3타를 보고 확신하거나, 손이 흔들리는 사람에게 값을 밀어붙이면
 * 오히려 판정을 더 어긋나게 만든다.
 */
export function isReliable(stats: TimingStats, minCount = 20, maxStdDevMs = 60): boolean {
  return stats.count >= minCount && stats.stdDevMs <= maxStdDevMs;
}

/**
 * 자동 적용 신뢰성은 **호출측**이 표본 수를 보고 결정한다.
 * (이 함수는 표본만 받아 계산하므로 런타임 정책이 섞이지 않는다)
 */
export function withReliability(
  stats: TimingStats,
  minCount = 20,
  maxStdDevMs = 60
): TimingStats {
  return { ...stats, suggestionReliable: isReliable(stats, minCount, maxStdDevMs) };
}

/** 히스토그램 시각화용 — 정규화된 높이(최대 1) */
export function bucketHeights(buckets: number[]): number[] {
  const max = buckets.reduce((a, b) => (b > a ? b : a), 0);
  if (max <= 0) return buckets.map(() => 0);
  return buckets.map((b) => b / max);
}