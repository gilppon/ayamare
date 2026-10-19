/**
 * 키맵 → 표시용 라벨 변환 (순수함수).
 * `settingsStore.KeyMap` 의 { 키: 레인 } 맵에서 특정 레인에 바인딩된 키를 찾는다.
 */

export type KeyMap = Record<string, number>;

export function keyLabelFor(keyMap: KeyMap, lane: number, fallback: string): string {
  for (const [k, v] of Object.entries(keyMap)) {
    if (v === lane) return k === " " ? "SPACE" : k.toUpperCase();
  }
  return fallback;
}
