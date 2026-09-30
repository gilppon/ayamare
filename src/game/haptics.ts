import { useSettingsStore } from "@/stores/settingsStore";

/** 햅틱 진동 헬퍼. 설정 OFF거나 미지원이면 no-op. */
export function buzz(pattern: number | number[] = 15): void {
  try {
    const enabled = useSettingsStore.getState().haptics;
    if (!enabled) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export const hapticFor = {
  perfect: () => buzz(12),
  great: () => buzz(20),
  bad: () => buzz([30, 30, 30]),
  miss: () => buzz([60, 40, 60]),
} as const;
