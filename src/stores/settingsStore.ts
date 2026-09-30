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

interface SettingsState {
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      timingScale: readInitial<number>("apolo_timing_scale", 1),
      reduceMotion:
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? true
          : readInitial<boolean>("apolo_reduce_motion", false),
      colorblind: readInitial<boolean>("apolo_colorblind", false),
      haptics: readInitial<boolean>("apolo_haptics", true),
      keyMap: readInitial<KeyMap>("apolo_keymap", DEFAULT_KEY_MAP),
      lang: readInitial<Lang>("apolo_lang", typeof window !== "undefined" ? detectLang() : "ko"),
      voice: readInitial<boolean>("apolo_voice", true),
      setTimingScale: (v) =>
        set({ timingScale: Math.min(1.5, Math.max(0.8, v)) }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
      setColorblind: (v) => set({ colorblind: v }),
      setHaptics: (v) => set({ haptics: v }),
      setKeyBinding: (key, lane) =>
        set((s) => {
          const next: KeyMap = { ...s.keyMap };
          // 같은 레인에 이미 바인딩된 키 제거 후 재할당 (중복 방지)
          for (const k of Object.keys(next)) {
            if (next[k] === lane) delete next[k];
          }
          next[key.toLowerCase()] = lane;
          return { keyMap: next };
        }),
      resetKeys: () => set({ keyMap: DEFAULT_KEY_MAP }),
      setLang: (v) => set({ lang: v }),
      setVoice: (v) => set({ voice: v }),
    }),
    {
      name: "apolo_settings",
      partialize: (s) => ({
        timingScale: s.timingScale,
        reduceMotion: s.reduceMotion,
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
      localStorage.setItem("apolo_colorblind", JSON.stringify(s.colorblind));
      localStorage.setItem("apolo_haptics", JSON.stringify(s.haptics));
      localStorage.setItem("apolo_keymap", JSON.stringify(s.keyMap));
      localStorage.setItem("apolo_lang", JSON.stringify(s.lang));
      localStorage.setItem("apolo_voice", JSON.stringify(s.voice));
    } catch {
      /* ignore */
    }
  });
}

export const DEFAULT_KEYS = DEFAULT_KEY_MAP;
