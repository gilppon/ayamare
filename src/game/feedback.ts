/**
 * 타격 피드백 플래너 (순수함수).
 *
 * I-07. 기존 구현은 PERFECT 한 번에 카메라 흔들림 + 줌펀치 + 쇼크웨이브 +
 * 스파크 8개 + 플래시 4개 + 히트스톱이 **동시에** 터졌고,
 * `reduceMotion` 을 켜면 이들이 **전부 사라져** 팝업만 남았다.
 * 즉 "과잉" 과 "접근성" 이 한 줄의 if 로 묶여 있었다.
 *
 * 여기서 두 가지를 분리한다.
 *  1) **강도 등급(tier)** — PERFECT > GREAT > GOOD > BAD > MISS 의 위계를 명시한다.
 *  2) **표현 채널** — 모션(파티클/셰이크/줌)과 비모션(색 링/팝업/햅틱)을 나눈다.
 *     모션 감소 모드에서는 비모션 채널만 남겨 **정보는 유지하면서 움직임만 뺀다.**
 */

import { JUDGMENTS } from "./constants";
import type { Judgment } from "./types";
/** 피드백 강도 등급 */
export type FeedbackTier = "none" | "light" | "medium" | "heavy" | "climax";

export interface FeedbackPlan {
  tier: FeedbackTier;
  /** 판정 라벨 팝업 */
  popup: boolean;
  /** 카메라 플래시 개수 (모션) */
  flashes: number;
  /** 파티클 개수 (모션) */
  sparks: number;
  /** 퍼동 링 (모션) */
  shockwave: boolean;
  /** 줌 펀치 강도 (모션) */
  zoom: number;
  /** 히트스톱 지속 ms (모션) */
  hitstopMs: number;
  /**
   * 정지 링 — 위치가 변하지 않고 **색·투명도만** 바뀌는 대체 피드백.
   * 모션 감소 모드에서 "무언가 일어났다" 는 신호를 남긴다.
   */
  solidRing: boolean;
  /** 화면 흔들림 */
  cameraShake: boolean;
  /** 햅틱 (접근성 prefs 반영은 호출측) */
  haptic: "perfect" | "great" | "bad" | "miss" | "none";
  /** 색상 판정용 */
  color: string;
}

const ZERO_MOTION = {
  flashes: 0,
  sparks: 0,
  shockwave: false,
  zoom: 0,
  hitstopMs: 0,
  cameraShake: false,
};

/**
 * 판정별 피드백 계획.
 *
 * @param judgment 판정
 * @param isDogeza 도게자 여부 (클라이맥스 강화)
 * @param reduceMotion 모션 감소 선호
 */
export function planFeedback(
  judgment: Judgment,
  isDogeza = false,
  reduceMotion = false
): FeedbackPlan {
  const color = JUDGMENTS[judgment].color;

  const base: Omit<FeedbackPlan, "tier" | "color" | "haptic" | "solidRing"> =
    judgment === "PERFECT"
      ? isDogeza
        ? {
            popup: true,
            flashes: 5,
            sparks: 10,
            shockwave: true,
            zoom: 1.2,
            hitstopMs: 70,
            cameraShake: true,
          }
        : {
            popup: true,
            flashes: 3,
            sparks: 6,
            shockwave: true,
            zoom: 0.7,
            hitstopMs: 40,
            cameraShake: true,
          }
      : judgment === "GREAT"
      ? {
          popup: true,
          flashes: 1,
          sparks: 3,
          shockwave: false,
          zoom: 0.35,
          hitstopMs: 0,
          cameraShake: false,
        }
      : judgment === "GOOD"
      ? {
          popup: true,
          flashes: 0,
          sparks: 1,
          shockwave: false,
          zoom: 0,
          hitstopMs: 0,
          cameraShake: false,
        }
      : judgment === "BAD"
      ? {
          popup: true,
          flashes: 1,
          sparks: 0,
          shockwave: false,
          zoom: 0,
          hitstopMs: 0,
          cameraShake: false,
        }
      : {
          // MISS 는 "안 일어남" 을 강하게 알린다
          popup: true,
          flashes: 2,
          sparks: 0,
          shockwave: false,
          zoom: 0,
          hitstopMs: 0,
          cameraShake: false,
        };

  const tier: FeedbackTier =
    judgment === "PERFECT"
      ? isDogeza
        ? "climax"
        : "heavy"
      : judgment === "GREAT"
      ? "medium"
      : judgment === "GOOD"
      ? "light"
      : judgment === "MISS"
      ? "medium"
      : judgment === "BAD"
      ? "light"
      : "none";

  const haptic: FeedbackPlan["haptic"] =
    judgment === "PERFECT"
      ? "perfect"
      : judgment === "GREAT"
      ? "great"
      : judgment === "MISS"
      ? "miss"
      : "bad";

  if (reduceMotion) {
    // 모션은 전부 걷어내되 정지 링으로 "타격" 신호를 남긴다
    return {
      tier,
      popup: true,
      ...ZERO_MOTION,
      solidRing: true,
      haptic,
      color,
    };
  }

  return { tier, ...base, solidRing: false, haptic, color };
}

/** 등급 비교용 — 높을수록 강한 피드백 */
export const TIER_WEIGHT: Record<FeedbackTier, number> = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3,
  climax: 4,
};
