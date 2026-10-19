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
  /** 언어별 초안 제목 (lang 를 무시하면 영어/일본어 사용자에게 한국어가 노출된다) */
const titles: Record<Lang, string> = {
    ko: "CUSTOM — 자동채보 초안",
    en: "CUSTOM — auto-chart draft",
    ja: "CUSTOM — 自動採譜の草案",
  };
  const subtitles: Record<Lang, string> = {
    ko: "오디오 분석으로 생성된 초안 (에디터에서 다듬기)",
    en: "Draft from audio analysis (polish in the editor)",
    ja: "音声解析で生成した草案（エディタで調整）",
  };
  return {
    title: opts.title ?? titles[lang],
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
    // B-12: 창마다 시작 위상(phase)을 돌려가며 샘플링한다.
    // hopSize(512)가 4의 배수라 `j += 4` 만 쓰면 모든 창이 같은 나머지 인덱스만
    // 보게 되고, 4로 나누어떨어지지 않는 위치의 트랜지언트가 통째로 누락된다.
    const phase = ((i / hopSize) | 0) % 4;
    let sum = 0;
    let n = 0;
    for (let j = i + phase; j < i + windowSize; j += 4) {
      const v = channelData[j];
      sum += v * v;
      n++;
    }
    energies.push(sum / Math.max(1, n));
  }

  const mean = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const threshold = mean * (opts.thresholdRatio ?? 1.8);
  const peaks: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    // 국소 최대 + 임계 초과만 통과 (평탄 구간도 1개만 기록)
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
