import { useSettingsStore } from "@/stores/settingsStore";
import { attempt } from "./effects";

/**
 * 햅틱 진동 헬퍼. 설정 OFF이거나 미지원이면 no-op.
 *
 * E: 예외를 `catch {}` 로 삼켰다. 게임이 안 깨지는 것은 맞지만
 * "왜 안 울려요" 를 추적할 방법이 사라졌다 — 설정에는 켜짐으로만 보인다.
 * 이제 실패는 `effects.attempt` 가 원인을 남긴다.
 *
 * 미지원 판단은 **설정이 켜져 있는데도** 진동이 없는 기기에서 중요하다.
 * 그 경우 실패가 아니라 "미지원"이므로 조용히 넘어가는 것이 맞고,
 * 그 사실은 `isSupported()` 로 물어볼 수 있다.
 */

/** 이 환경이 진동을 지원하는가 (설정 무관 — 기기 능력) */
export function isSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** 햅틱 진동. 설정 OFF이거나 미지원/실패하면 조용히 아무 일도 없다. */
export function buzz(pattern: number | number[] = 15): void {
  if (!useSettingsStore.getState().haptics) return;
  if (!isSupported()) return;
  // 일부 브라우저는 패턴을 받으면 예외를 던진다 — 전체를 삼키되 기록한다
  attempt("haptics", () => navigator.vibrate(pattern));
}

/**
 * 판정 결과에 대응하는 진동 패턴.
 *
 * 미스일수록 길고 굵게 — 실수가 크게 느껴져야 다음을 조심하게 된다.
 */
export const hapticFor = {
  perfect: () => buzz(12),
  great: () => buzz(20),
  bad: () => buzz([30, 30, 30]),
  miss: () => buzz([60, 40, 60]),
} as const;
