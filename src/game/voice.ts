import { useSettingsStore } from "@/stores/settingsStore";

/** 사죄 음성 대사 (가나 표기 — 발음 안정용) */
export const APOLOGY_LINES = [
  "すみません！",
  "ごめんなさい！",
  "もうしわけありません！",
  "ほんとうにすみませんでした！",
  "ゆるしてください！",
] as const;

export const DOGEZA_LINE = "もうしわけございません！";

const MIN_INTERVAL_MS = 800;
let lastSpokeAt = 0;
let lineIndex = 0;

function pickJaVoice(): SpeechSynthesisVoice | null {
  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const ja = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
    if (ja.length === 0) return null;
    return (
      ja.find((v) => /google/i.test(v.name) && /日本語/i.test(v.name)) ??
      ja.find((v) => /google/i.test(v.name)) ??
      ja[0]
    );
  } catch {
    return null;
  }
}

// 일부 브라우저는 voiceschanged 이후에 목록이 채워진다
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  } catch {
    /* ignore */
  }
}

/** 다음 순번 대사를 반환 (콤보 마일스톤용 로테이션) */
export function nextApologyLine(): string {
  const line = APOLOGY_LINES[lineIndex % APOLOGY_LINES.length];
  lineIndex++;
  return line;
}

export function speakApology(text: string, force = false): void {
  try {
    if (!useSettingsStore.getState().voice) return;
    if (!("speechSynthesis" in window)) return;
    const now = performance.now();
    if (!force && now - lastSpokeAt < MIN_INTERVAL_MS) return;
    lastSpokeAt = now;
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 1.08;
    u.pitch = 0.85;
    u.volume = 0.9;
    const voice = pickJaVoice();
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopVoice(): void {
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
