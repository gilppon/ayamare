import { create } from "zustand";
import { persist } from "zustand/middleware";
import { detectLang, type Lang } from "@/i18n/ui";

export type KeyMap = Record<string, number>;

const DEFAULT_KEY_MAP: KeyMap = {
  a: 0,
  s: 1,
  d: 2,
  " ": 3,
};

export const LANE_COUNT = 4;
/** 기본 키 (리셋/라벨 폴백용으로 공개) */
export const DEFAULT_KEYS = { ...DEFAULT_KEY_MAP };

/**
 * 키를 다른 레인으로 옮길 때 "고아 레인" 이 생기지 않게 한다.
 *
 * 기존 구현은 "이 레인의 기존 키" 만 지웠다. 어떤 키가 이미 다른 레인에
 * 묶여 있으면 그 레인의 키를 빼앗기만 하고 다시 배정하지 않아,
 * 그 레인은 키를 잃어 **게임 내내 눌러지지 않았다** (초기화 전까지).
 *
 * 규칙: 키를 빼앗긴 레인은 그 레인의 이전 기본 키로 되돌린다.
 */
export function rebindKey(map: KeyMap, key: string, lane: number): KeyMap {
  const k = key.toLowerCase();
  const next: KeyMap = { ...map };

  // 이 레인이 쓰던 키는 정리한다 (같은 레인 재지정 케이스)
  for (const existing of Object.keys(next)) {
    if (next[existing] === lane) delete next[existing];
  }

  const displacedLane = next[k];
  next[k] = lane;

  if (displacedLane !== undefined && displacedLane !== lane) {
    // 빼앗긴 레인에 기본 키가 비어 있으면 되돌려 준다
    for (const [dk, dl] of Object.entries(DEFAULT_KEY_MAP)) {
      if (dl !== displacedLane) continue;
      const taken = Object.entries(next).some(([nk, nl]) => nl === displacedLane && nk !== dk);
      if (!taken) next[dk] = displacedLane;
      break;
    }
  }
  return next;
}

interface SettingsState {
  reduceMotionUserSet: boolean;
  timingScale: number;
  reduceMotion: boolean;
  colorblind: boolean;
  haptics: boolean;
  keyMap: KeyMap;
  lang: Lang;
  voice: boolean;
  setTimingScale: (v: number) => void;
  setReduceMotion: (v: boolean) => void;
  setColorblind: (v: boolean) => void;
  setHaptics: (v: boolean) => void;
  setKeyBinding: (key: string, lane: number) => void;
  resetKeys: () => void;
  setLang: (v: Lang) => void;
  setVoice: (v: boolean) => void;
  /** 사용자가 모션 감소 설정을 직접 조작했는지 (OS 설정 따르기를 중단) */
  setReduceMotionUserSet: (v: boolean) => void;
}

function readInitial<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 저장된 언어 값 검증.
 *
 * `readInitial<Lang>` 은 캐스팅만 하므로 깨진 값이 그대로 통과하고,
 * `tr()` 안의 `DICT[lang][key]` 에서 예외가 난다(화면 전체 흰 화면).
 * 저장은 사용자가 손댈 수 없지만 구버전/수기 편집에 대비해 막는다.
 */
function readLang(fallback: Lang): Lang {
  const v = readInitial<string>("apolo_lang", fallback);
  return v === "ko" || v === "en" || v === "ja" ? v : fallback;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      timingScale: readInitial<number>("apolo_timing_scale", 1),
      /**
       * OS 의 `prefers-reduced-motion` 를 **초기값**으로만 따른다.
       * (매번 읽으면 사용자가 끄고 저장해도 다음 부팅에서 다시 켜져 사용자 선택이 무력화된다)
       * 사용자가 직접 조작하면 `reduceMotionUserSet` 이 OS 추적을 끊는다.
       */
      reduceMotionUserSet: readInitial<boolean>("apolo_reduce_motion_set", false),
      reduceMotion:
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? true
          : readInitial<boolean>("apolo_reduce_motion", false),
      colorblind: readInitial<boolean>("apolo_colorblind", false),
      haptics: readInitial<boolean>("apolo_haptics", true),
      keyMap: readInitial<KeyMap>("apolo_keymap", { ...DEFAULT_KEY_MAP }),
      lang: readLang(typeof window !== "undefined" ? detectLang() : "ko"),
      voice: readInitial<boolean>("apolo_voice", true),
      setTimingScale: (v) =>
        set({ timingScale: Math.min(1.5, Math.max(0.8, v)) }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
      setColorblind: (v) => set({ colorblind: v }),
      setHaptics: (v) => set({ haptics: v }),
      setKeyBinding: (key, lane) =>
        set((s) => ({ keyMap: rebindKey(s.keyMap, key, lane) })),
      resetKeys: () => set({ keyMap: { ...DEFAULT_KEY_MAP } }),
      setLang: (v) => set({ lang: v }),
      setVoice: (v) => set({ voice: v }),
      /** 사용자가 직접 껐다/켰다 — 이후 OS 설정을 따르지 않는다 */
      setReduceMotionUserSet: (v) => set({ reduceMotionUserSet: v }),
    }),
    {
      name: "apolo_settings",
      partialize: (s) => ({
        timingScale: s.timingScale,
        reduceMotion: s.reduceMotion,
        reduceMotionUserSet: s.reduceMotionUserSet,
        colorblind: s.colorblind,
        haptics: s.haptics,
        keyMap: s.keyMap,
        lang: s.lang,
        voice: s.voice,
      }),
    }
  )
);

// 구버전 키(apolo_timing_scale 등)와 동기화 — GameScreen 직접 읽기 호환용
if (typeof window !== "undefined") {
  useSettingsStore.subscribe((s) => {
    try {
      localStorage.setItem("apolo_timing_scale", String(s.timingScale));
      localStorage.setItem("apolo_reduce_motion", JSON.stringify(s.reduceMotion));
      localStorage.setItem("apolo_reduce_motion_set", JSON.stringify(s.reduceMotionUserSet));
      localStorage.setItem("apolo_colorblind", JSON.stringify(s.colorblind));
      localStorage.setItem("apolo_haptics", JSON.stringify(s.haptics));
      localStorage.setItem("apolo_keymap", JSON.stringify(s.keyMap));
      localStorage.setItem("apolo_lang", JSON.stringify(s.lang));
      localStorage.setItem("apolo_voice", JSON.stringify(s.voice));
    } catch {
      /* ignore */
    }
  });

  // OS 의 모션 감소 설정이 바뀌면 따라간다 (사용자가 직접 조작하기 전까지).
  // 기존에는 부팅 시 1회만 읽어서 OS 설정을 바꿔도 앱이 반응하지 않았다.
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener?.("change", (e) => {
      if (useSettingsStore.getState().reduceMotionUserSet) return;
      useSettingsStore.setState({ reduceMotion: e.matches });
    });
  }
}
