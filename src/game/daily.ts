import { ACTION_BY_LANE, STAGE_BPMS } from "./constants";
import type { Chart, JournalistType, Note, QuestionEvent } from "./types";
import type { Lang } from "@/i18n/ui";

/** 데일리 실측 BPM (daily.mp3 온셋 분석값) */
const DAILY_BPM = STAGE_BPMS.daily;
const BEAT = 60 / DAILY_BPM;

function xfnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDailyKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 60초 데일리 차트. 같은 키면 항상 같은 차트. */
export function buildDailyChart(dailyKey: string, lang: Lang = "ko"): Chart {
  const rng = mulberry32(xfnv1a(`sumimasen-daily-${dailyKey}`));
  const notes: Note[] = [];
  let id = 100000 + xfnv1a(dailyKey) % 10000;

  const totalBars = 18; // 2 카운트인 + 16 플레이 ≈ 60초 @130bpm
  for (let bar = 2; bar < totalBars; bar++) {
    const density = bar < 6 ? 3 : bar < 12 ? 4 : 5;
    const usedBeats = new Set<number>();
    for (let k = 0; k < density; k++) {
      // 0,1,2,3 + 0.5 단위 8분박자 중 택1 (후반부는 8분박자 비중↑)
      const eighth = bar >= 10 && rng() < 0.35;
      const beat = eighth
        ? Math.floor(rng() * 8) * 0.5
        : Math.floor(rng() * 4);
      if (usedBeats.has(beat)) continue;
      usedBeats.add(beat);
      const lane = Math.floor(rng() * 4) as 0 | 1 | 2 | 3;
      // 도게자는 마디당 1개 이하로 제한 (밸런스)
      const hold = rng() < 0.12 ? 1 : 0;
      let gimmick: Note["gimmick"] | undefined;
      const gr = rng();
      if (bar >= 6 && gr < 0.07) gimmick = "invisible";
      else if (bar >= 8 && gr < 0.13) gimmick = "speedUp";
      else if (bar >= 10 && gr < 0.17) gimmick = "fake";
      notes.push({
        id: id++,
        time: (bar * 4 + beat) * BEAT,
        lane,
        action: ACTION_BY_LANE[lane],
        hold: hold * BEAT,
        gimmick,
      });
    }
    // 4마디마다 홀드 1개 보장
    if (bar % 4 === 0) {
      const lane = Math.floor(rng() * 3) as 0 | 1 | 2;
      notes.push({
        id: id++,
        time: (bar * 4 + 2) * BEAT,
        lane,
        action: ACTION_BY_LANE[lane],
        hold: BEAT,
      });
    }
  }

  notes.sort((a, b) => a.time - b.time);

  const pool: Array<{ journalist: JournalistType; text: Record<Lang, string> }> = [
    {
      journalist: "rookie",
      text: {
        ko: "데일리 속보입니다! 오늘의 사과, 준비되셨습니까?",
        en: "Daily bulletin! Ready for today's apology?",
        ja: "デイリー速報です！今日の謝罪、準備はいいですか？",
      },
    },
    {
      journalist: "economy",
      text: {
        ko: "주주들이 오늘 차트를 주시하고 있습니다. 한마디 부탁드립니다.",
        en: "Shareholders are watching today's chart. A few words?",
        ja: "株主が今日のチャートを注視しています。一言お願いします。",
      },
    },
    {
      journalist: "investigative",
      text: {
        ko: "어제의 사과가 진심이었는지, 오늘 증명해주십시오.",
        en: "Prove today's sincerity — was yesterday's apology real?",
        ja: "昨日の謝罪が本物だったか、今日証明してください。",
      },
    },
    {
      journalist: "veteran",
      text: {
        ko: "매일 같은 사과는 통하지 않습니다. 각도를 보여주세요.",
        en: "The same apology won't work daily. Show us the angle.",
        ja: "毎日同じ謝罪は通用しません。角度を見せてください。",
      },
    },
    {
      journalist: "boss",
      text: {
        ko: "자, 데일리 최종 질문입니다. 인류는… 아니, 당신은 반성했습니까?",
        en: "Final daily question. Has humanity— I mean, have YOU reflected?",
        ja: "さあデイリー最終質問です。人類は…いえ、あなたは反省しましたか？",
      },
    },
  ];
  const questions: QuestionEvent[] = [0, 1, 2].map((i) => {
    const q = pool[(xfnv1a(dailyKey) + i * 2) % pool.length];
    return { journalist: q.journalist, text: q.text[lang], time: ((2 + i * 5) * 4) * BEAT };
  });

  const last = notes[notes.length - 1];
  const subtitle =
    lang === "ko"
      ? "오늘만 열리는 60초 속죄"
      : lang === "en"
      ? "A 60-second atonement, today only"
      : "今日だけの60秒の贖罪";
  return {
    title: `DAILY — ${dailyKey}`,
    subtitle,
    bpm: DAILY_BPM,
    notes,
    questions,
    duration: last ? last.time + Math.max(last.hold, 0) + 2.4 : 60,
    version: 2,
  };
}

export const DAILY_POINTS_MULT = 1.5;
