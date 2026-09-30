import { ACTION_BY_LANE } from "./constants";
import type { Chart, JournalistType } from "./types";
import type { Lang } from "@/i18n/ui";

/** 에너지 피크 → 8분박자 양자화 채보 초안 (순수함수, 테스트 가능) */
export function peaksToChart(
  peaks: number[],
  opts: { title?: string; bpm?: number; maxNotes?: number; lang?: Lang } = {}
): Chart {
  const bpm = opts.bpm ?? 130;
  const lang = opts.lang ?? "ko";
  const beat = 60 / bpm;
  const step = beat / 2; // 8분박자
  const maxNotes = opts.maxNotes ?? 120;

  // 시간 양자화 + 중복 제거
  const quantized = Array.from(
    new Set(peaks.map((t) => Math.max(0, Math.round(t / step) * step)))
  )
    .sort((a, b) => a - b)
    .slice(0, maxNotes);

  const notes = quantized.map((time, i) => {
    const lane = (i * 7 + Math.floor(time / beat)) % 4 as 0 | 1 | 2 | 3;
    return {
      id: 500000 + i,
      time,
      lane,
      action: ACTION_BY_LANE[lane],
      hold: 0,
    };
  });

  // 카운트인 2마디 확보
  const offset = 2 * 4 * beat;
  for (const n of notes) n.time += offset;

  const last = notes[notes.length - 1];
  const questionsByLang: Record<Lang, string> = {
    ko: "커스텀 스테이지입니다! 채팅이 지켜보고 있습니다!",
    en: "Custom stage! The chat is watching!",
    ja: "カスタムステージです！チャットが見ています！",
  };
  const subtitles: Record<Lang, string> = {
    ko: "오디오 분석으로 생성된 초안 (에디터에서 다듬기)",
    en: "Draft from audio analysis (polish in the editor)",
    ja: "音声解析で生成した草案（エディタで調整）",
  };
  return {
    title: opts.title ?? "CUSTOM — 자동채보 초안",
    subtitle: subtitles[lang],
    bpm,
    notes,
    questions: [
      { time: offset, journalist: "internet" as JournalistType, text: questionsByLang[lang] },
    ],
    duration: last ? last.time + 2.4 : 30,
    version: 2,
  };
}

/** AudioBuffer → 모노 에너지 엔벨로프 → 피크 검출 */
export function detectPeaks(
  channelData: Float32Array,
  sampleRate: number,
  opts: { windowSize?: number; hopSize?: number; thresholdRatio?: number; maxPeaks?: number } = {}
): number[] {
  const windowSize = opts.windowSize ?? 1024;
  const hopSize = opts.hopSize ?? 512;
  const maxPeaks = opts.maxPeaks ?? 120;
  const energies: number[] = [];

  for (let i = 0; i + windowSize < channelData.length; i += hopSize) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j += 4) {
      const v = channelData[j];
      sum += v * v;
    }
    energies.push(sum / (windowSize / 4));
  }

  const mean = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const threshold = mean * (opts.thresholdRatio ?? 1.8);
  const peaks: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] >= energies[i - 1] && energies[i] > energies[i + 1]) {
      peaks.push((i * hopSize) / sampleRate);
      if (peaks.length >= maxPeaks) break;
    }
  }
  return peaks;
}

/** 오디오 파일 → 채보 초안 (브라우저 전용) */
export async function fileToChart(file: File, bpm = 130, lang: Lang = "ko"): Promise<Chart> {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const peaks = detectPeaks(ch, audio.sampleRate);
    return peaksToChart(peaks, { title: `CUSTOM — ${file.name}`, bpm, lang });
  } finally {
    ctx.close().catch(() => undefined);
  }
}
