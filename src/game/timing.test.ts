import { describe, expect, it } from "vitest";
import {
  BUCKET_COUNT,
  BUCKET_EDGES,
  BUCKET_WIDTH_MS,
  RANGE_MS,
  bucketHeights,
  bucketIndexOf,
  isReliable,
  timingStats,
  withReliability,
} from "./timing";
import { clampOffset, OFFSET_MAX_MS, OFFSET_MIN_MS } from "@/stores/settingsStore";

/**
 * A — 오디오 지연 보정.
 *
 * 유선 헤드폰 10~30ms, 블루투스 120~250ms 지연한다.
 * PERFECT 이 ±55ms 라 블루투스 사용자는 보정 수단 없이선 구조적으로 불가능하다.
 *
 * 이 테스트는 그 보정 수단의 **계산과 안전장치**를 고정한다.
 */
describe("오차 → 버킷 매핑", () => {
  it("버킷은 -200ms ~ +200ms 를 25ms 간격으로 덮는다", () => {
    expect(BUCKET_WIDTH_MS).toBe(25);
    expect(RANGE_MS).toBe(200);
    expect(BUCKET_EDGES[0]).toBe(-200);
    expect(BUCKET_EDGES[BUCKET_EDGES.length - 1]).toBe(200);
    // 400ms / 25ms = 16구간
    expect(BUCKET_COUNT).toBe(16);
  });

  it("0ms 는 정확히 중앙 버킷이다", () => {
    expect(bucketIndexOf(0)).toBe(BUCKET_COUNT / 2);
  });

  it("오차 부호가 버킷 위치에 반영된다", () => {
    expect(bucketIndexOf(-50)).toBeLessThan(bucketIndexOf(0));
    expect(bucketIndexOf(50)).toBeGreaterThan(bucketIndexOf(0));
    expect(bucketIndexOf(-50)).toBe(BUCKET_COUNT / 2 - 2);
    expect(bucketIndexOf(50)).toBe(BUCKET_COUNT / 2 + 2);
  });

  it("범위 밖은 양 끝으로 클램프된다 (히스토그램이 깨지지 않는다)", () => {
    expect(bucketIndexOf(-9999)).toBe(0);
    expect(bucketIndexOf(9999)).toBe(BUCKET_COUNT - 1);
  });

  it("NaN 은 중앙으로 떨어진다 (빈 칸을 만들지 않는다)", () => {
    expect(bucketIndexOf(NaN)).toBe(BUCKET_COUNT / 2);
  });
});

describe("타이밍 통계", () => {
  it("빈 표본은 안전하게 0 을 낸다", () => {
    const s = timingStats([]);
    expect(s.count).toBe(0);
    expect(s.meanMs).toBe(0);
    expect(s.suggestedOffsetMs).toBe(0);
    expect(s.suggestionReliable).toBe(false);
    expect(s.buckets.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("NaN/무한대 표본은 통계에서 제외된다", () => {
    const s = timingStats([10, NaN, 20, Infinity]);
    expect(s.count).toBe(2);
    expect(s.meanMs).toBe(15);
  });

  it("정확히 치는 플레이어는 평균·중앙값 0", () => {
    const s = timingStats([0, 0, 0, 5, -5]);
    expect(s.meanMs).toBeCloseTo(0, 6);
    expect(Math.abs(s.medianMs)).toBeLessThanOrEqual(13);
  });

  it("늦게 치는 플레이어는 양수 평균을 낸다", () => {
    const s = timingStats([100, 110, 90, 120, 105]);
    expect(s.meanMs).toBeGreaterThan(0);
    expect(s.medianMs).toBeGreaterThan(0);
  });

  it("빠르게 치는 플레이어는 음수 평균을 낸다", () => {
    const s = timingStats([-80, -95, -70, -85]);
    expect(s.meanMs).toBeLessThan(0);
  });

  it("편차(stdDev)가 크면 방향은 같아도 산포가 크다", () => {
    const steady = timingStats([100, 100, 100, 100, 100]);
    const shaky = timingStats([-100, 300, 0, 200, -200]);
    expect(steady.stdDevMs).toBeCloseTo(0, 6);
    expect(shaky.stdDevMs).toBeGreaterThan(steady.stdDevMs);
  });

  it("히스토그램 합계는 유효 표본 수와 같다", () => {
    const s = timingStats([-180, -30, 0, 25, 40, 190, NaN]);
    expect(s.buckets.reduce((a, b) => a + b, 0)).toBe(s.count);
    expect(s.count).toBe(6);
  });
});

describe("추천 오프셋 — 방향이 핵심 계약", () => {
  /**
   * 부호 규약: error = 입력시각 - 노트시각 (양수 = 늦음).
   * 판정은 `입력시각 - 오프셋` 이므로, 늦게 치는 사용자에게 **양수**를 권해야 한다.
   * 이 방향이 틀리면 보정을 켤수록 판정이 더 어긋난다 — 가장 위험한 버그.
   */
  it("늦게 치면 양수를 권한다 (판정을 그만큼 앞당긴다)", () => {
    // 블루투스: 150ms 늦게 치는 사용자
    const s = timingStats(Array(30).fill(150));
    expect(s.medianMs).toBeGreaterThan(100);
    expect(s.suggestedOffsetMs).toBeGreaterThan(0);
  });

  it("빠르게 치면 음수를 권한다", () => {
    const s = timingStats(Array(30).fill(-80));
    expect(s.suggestedOffsetMs).toBeLessThan(0);
  });

  it("추천값은 지연과 같은 부호·근사적 크기다", () => {
    // 중앙값은 25ms 버킷 해상도의 **중심값**으로 환산되므로 150 → 163 이다.
    // 사용자에게 제안할 값이므로 "방향이 정확하고 오차가 버킷 폭 이내" 면 충분하다.
    const late = timingStats(Array(30).fill(150));
    expect(late.suggestedOffsetMs).toBeGreaterThan(0);
    expect(Math.abs(late.suggestedOffsetMs - 150)).toBeLessThanOrEqual(13);

    const early = timingStats(Array(30).fill(-75));
    expect(early.suggestedOffsetMs).toBeLessThan(0);
    expect(Math.abs(early.suggestedOffsetMs + 75)).toBeLessThanOrEqual(13);
  });

  it("정확히 치면 추천값이 0 이다 (슬라이더를 건드리지 않는다)", () => {
    const s = timingStats([0, 3, -3, 0, 2]);
    expect(s.suggestedOffsetMs).toBe(0);
  });

  it("중앙값은 아웃라이어에 강하다 (평균이 끌려가지 않는다)", () => {
    // 30타는 정상, 2타만 극단적 오실수
    const errors = [...Array(30).fill(120), 900, -600];
    const s = timingStats(errors);
    // 평균은 오염되지만 중앙값은 120ms 근처를 유지해야 한다
    expect(s.meanMs).toBeGreaterThan(s.medianMs);
    expect(s.medianMs).toBeGreaterThan(80);
    expect(s.medianMs).toBeLessThan(160);
  });

  it("추천값이 설정 허용 범위를 넘지 않는다", () => {
    for (const v of [900, -900, 150, -150]) {
      const s = timingStats(Array(30).fill(v));
      expect(clampOffset(s.suggestedOffsetMs)).toBeGreaterThanOrEqual(OFFSET_MIN_MS);
      expect(clampOffset(s.suggestedOffsetMs)).toBeLessThanOrEqual(OFFSET_MAX_MS);
    }
  });
});

describe("자동 적용 신뢰성 게이트", () => {
  it("표본이 적으면 신뢰하지 않는다", () => {
    const s = timingStats(Array(5).fill(120));
    expect(s.suggestionReliable).toBe(false);
    expect(isReliable(s)).toBe(false);
  });

  it("표본이 충분하고 흔들림이 작으면 신뢰한다", () => {
    const s = timingStats([...Array(20).fill(120), ...Array(20).fill(122), ...Array(20).fill(118)]);
    expect(s.count).toBe(60);
    expect(s.stdDevMs).toBeLessThan(10);
    expect(withReliability(s).suggestionReliable).toBe(true);
  });

  it("산포가 크면 신뢰하지 않는다 (게이지 밴조) ", () => {
    const s = timingStats([-200, -150, -100, 0, 100, 150, 200, -180, 190, 120]);
    expect(s.stdDevMs).toBeGreaterThan(60);
    expect(withReliability(s).suggestionReliable).toBe(false);
  });

  it("withReliability 는 원본을 변형하지 않는다 (불변성)", () => {
    const s = timingStats(Array(30).fill(100));
    const next = withReliability(s);
    expect(s.suggestionReliable).toBe(false);
    expect(next.buckets).toBe(s.buckets);
  });
});

describe("오프셋 값 클램프", () => {
  it("±200ms 안으로 제한된다", () => {
    expect(clampOffset(5000)).toBe(OFFSET_MAX_MS);
    expect(clampOffset(-5000)).toBe(OFFSET_MIN_MS);
  });

  it("5ms 격자에 맞춘다 (무한한 미세 값 방지)", () => {
    expect(clampOffset(13)).toBe(15);
    expect(clampOffset(12)).toBe(10);
    expect(clampOffset(-7)).toBe(-5);
  });

  it("NaN/Infinity 는 0 으로 (설정 오염 방어)", () => {
    // ±200 으로 클램프하는 대신 0 이 안전하다.
    // Infinity 는 localStorage 손상 같은 경우를 뜻하며, "극단으로 보정"은
    // 사용자를 게임 안 playable 상태로 만들어 버린다.
    expect(clampOffset(NaN)).toBe(0);
    expect(clampOffset(Infinity)).toBe(0);
    expect(clampOffset(-Infinity)).toBe(0);
  });
});

describe("히스토그램 높이 정규화", () => {
  it("최댓값이 1 이 된다", () => {
    const h = bucketHeights([2, 4, 8, 0]);
    expect(Math.max(...h)).toBe(1);
    expect(h[2]).toBe(1);
  });

  it("모두 0 이면 전부 0 (NaN 방지)", () => {
    expect(bucketHeights([0, 0, 0])).toEqual([0, 0, 0]);
  });
});