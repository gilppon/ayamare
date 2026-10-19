import { useSettingsStore } from "@/stores/settingsStore";
import { attempt } from "./effects";

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

/**
 * 발화 상태.
 *
 * E: 이전에는 모듈 최상위 `let` 이었고, 테스트가 상태를 리셋할 방법이
 * 없었다 — 테스트 순서에 따라 결과가 달라지는 순서 의존 테스트만 가능했다.
 * 이제 명시적으로 만들고 초기화할 수 있다.
 */
interface VoiceState {
  /** 마지막 발화 시각 (performance.now 기준 ms) */
  lastSpokeAt: number;
  /** 다음 대사 순번 */
  lineIndex: number;
}

let state: VoiceState = { lastSpokeAt: -Infinity, lineIndex: 0 };

/** 테스트용 상태 초기화 (모듈 전역 상태를 케이스 사이에 넘기지 않는다) */
export function resetVoiceState(): void {
  state = { lastSpokeAt: -Infinity, lineIndex: 0 };
}

/** 이 환경이 TTS 를 지원하는가 */
export function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 일본어 음성을 고른다. 없으면 null (발화는浏览器 기본음성으로 진행).
 *
 * 우선순위: Google 日本語 → Google 일본어 → 목록의 첫 Japanese.
 * 브라우저 기본음성(OS 기본)은 가나 발음이 불안정해 마지막으로 미룬다.
 *
 * 명시적으로 함수로 분리한 이유: 예전에는 `speakApology` 안에서 인라인으로
 * 호출돼 이 함수가 **한 번도 실행되지 않았다** (함수 커버리지 12.5%).
 */
export function pickJaVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ja = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
  if (ja.length === 0) return null;
  return (
    ja.find((v) => /google/i.test(v.name) && /日本語/i.test(v.name)) ??
    ja.find((v) => /google/i.test(v.name)) ??
    ja[0]
  );
}

/**
 * 일부 브라우저는 voiceschanged 이후에 목록이 채워진다.
 *
 * E: 이전에는 이것이 **모듈 최상위에서** 실행됐다. import 하는 순간
 * window.speechSynthesis 에 접근하므로 (1) 테스트에서 격리할 수 없고,
 * (2) speechSynthesis 가 아직 준비되지 않은 컨텍스트에서 import 가 실패할 수 있다.
 * 이제 명시적으로 호출한다 — 부수효과를 하는 함수는 이름이 있어야 찾을 수 있다.
 *
 * 실패해도 무해하므로 삼키되 기록한다 (브라우저가 speechSynthesis 를 막는 경우).
 */
export function primeVoices(): void {
  if (!isSupported()) return;
  attempt("voice", () => {
    const synth = window.speechSynthesis;
    synth.getVoices(); // 캐시를 강제로 채운다
    synth.onvoiceschanged = () => {
      // 콜백이 실패해도 앱이 죽으면 안 된다
      attempt("voice", () => window.speechSynthesis.getVoices());
    };
  });
}

/** 다음 순번 대사를 반환 (콤보 마일스톤용 로테이션) */
export function nextApologyLine(): string {
  const line = APOLOGY_LINES[state.lineIndex % APOLOGY_LINES.length];
  state.lineIndex++;
  return line;
}

/**
 * 사죄 대사를 발화한다.
 *
 * 스로틀: MIN_INTERVAL_MS 안에 다시 불렀으면 아무 것도 하지 않는다.
 * 실수하면 대사가 겹쳐 음질이 무너진다 — 콤보가 끊길 때는 오히려 침묵이 낫다.
 */
export function speakApology(text: string, force = false): void {
  if (!useSettingsStore.getState().voice) return;
  if (!isSupported()) return;
  const now = performance.now();
  if (!force && now - state.lastSpokeAt < MIN_INTERVAL_MS) return;

  attempt("voice", () => {
    state.lastSpokeAt = now;
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 1.08;
    u.pitch = 0.85;
    u.volume = 0.9;
    const voice = pickJaVoice(synth.getVoices());
    if (voice) u.voice = voice;
    synth.speak(u);
  });
}

/** 진행 중인 발화를 멈춘다 (재시작·언어 변경·종료 시) */
export function stopVoice(): void {
  if (!isSupported()) return;
  attempt("voice", () => window.speechSynthesis.cancel());
}
