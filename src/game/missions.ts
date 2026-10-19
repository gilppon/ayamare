import type { GameResult } from "./types";
import type { Lang } from "@/i18n/ui";

export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  /** 목표치 (누적 또는 단일런) */
  target: number;
  reward: number;
  kind: "totalRuns" | "bestCombo" | "totalDogeza" | "totalPerfect" | "bestAccuracy" | "dailyRuns" | "singlePerfect";
}

export const MISSIONS: MissionDef[] = [
  { id: "play3", name: "첫 출근", desc: "누적 3판 플레이", target: 3, reward: 150, kind: "totalRuns" },
  { id: "play10", name: "상근직", desc: "누적 10판 플레이", target: 10, reward: 350, kind: "totalRuns" },
  { id: "combo30", name: "사죄 체인", desc: "최대 콤보 30 달성", target: 30, reward: 300, kind: "bestCombo" },
  { id: "combo60", name: "국가적 사죄", desc: "최대 콤보 60 달성", target: 60, reward: 600, kind: "bestCombo" },
  { id: "dogeza5", name: "무릎 꿇기", desc: "도게자 히트 누적 5회", target: 5, reward: 250, kind: "totalDogeza" },
  { id: "perfect100", name: "완벽주의", desc: "PERFECT 누적 100개", target: 100, reward: 400, kind: "totalPerfect" },
  { id: "acc90", name: "진심 전달", desc: "단일 런 정확도 90%+", target: 0.9, reward: 350, kind: "bestAccuracy" },
  { id: "daily1", name: "일간 속죄", desc: "데일리 챌린지 1회 완주", target: 1, reward: 300, kind: "dailyRuns" },
  { id: "runAllPerfect", name: "흠 없는 사죄", desc: "단일 런에서 PERFECT 30개", target: 30, reward: 500, kind: "singlePerfect" },
];

const MISSION_TEXT_OVERRIDE: Record<"en" | "ja", Record<string, { name: string; desc: string }>> = {
  en: {
    play3: { name: "First Day", desc: "Play 3 runs total" },
    play10: { name: "Full-timer", desc: "Play 10 runs total" },
    combo30: { name: "Apology Chain", desc: "Reach 30 max combo" },
    combo60: { name: "National Apology", desc: "Reach 60 max combo" },
    dogeza5: { name: "On Your Knees", desc: "5 total dogeza hits" },
    perfect100: { name: "Perfectionist", desc: "100 total PERFECTs" },
    acc90: { name: "Sincerity Delivered", desc: "90%+ accuracy in one run" },
    daily1: { name: "Daily Atonement", desc: "Clear a daily challenge" },
    runAllPerfect: { name: "Flawless", desc: "30 PERFECTs in a single run" },
  },
  ja: {
    play3: { name: "初出勤", desc: "累計3プレイ" },
    play10: { name: "正社員", desc: "累計10プレイ" },
    combo30: { name: "謝罪チェーン", desc: "最大コンボ30達成" },
    combo60: { name: "国家的謝罪", desc: "最大コンボ60達成" },
    dogeza5: { name: "土下座", desc: "土下座ヒット累計5回" },
    perfect100: { name: "完璧主義", desc: "PERFECT累計100個" },
    acc90: { name: "真心伝達", desc: "単一プレイ精度90%+" },
    daily1: { name: "日課の贖罪", desc: "デイリーチャレンジ1回完走" },
    runAllPerfect: { name: "完璧な謝罪", desc: "単一プレイでPERFECT 30個" },
  },
};

export function missionText(m: MissionDef, lang: Lang): { name: string; desc: string } {
  if (lang === "ko") return { name: m.name, desc: m.desc };
  return MISSION_TEXT_OVERRIDE[lang][m.id] ?? { name: m.name, desc: m.desc };
}

export interface ProgressSnapshot {
  totalRuns: number;
  bestCombo: number;
  totalDogeza: number;
  totalPerfect: number;
  bestAccuracy: number;
  dailyRuns: number;
  singlePerfectBest: number;
}

export function missionProgress(m: MissionDef, s: ProgressSnapshot): number {
  switch (m.kind) {
    case "totalRuns": return s.totalRuns;
    case "bestCombo": return s.bestCombo;
    case "totalDogeza": return s.totalDogeza;
    case "totalPerfect": return s.totalPerfect;
    case "bestAccuracy": return s.bestAccuracy;
    case "dailyRuns": return s.dailyRuns;
    case "singlePerfect": return s.singlePerfectBest;
    default: return 0;
  }
}

export function isMissionComplete(m: MissionDef, s: ProgressSnapshot): boolean {
  return missionProgress(m, s) >= m.target;
}

/** 단일 런 결과를 스냅샷에 합산 */
export function applyRunToSnapshot(
  s: ProgressSnapshot,
  r: GameResult,
  isDaily: boolean
): ProgressSnapshot {
  return {
    totalRuns: s.totalRuns + 1,
    bestCombo: Math.max(s.bestCombo, r.maxCombo),
    totalDogeza: s.totalDogeza + r.dogezaHits,
    totalPerfect: s.totalPerfect + r.counts.PERFECT,
    bestAccuracy: Math.max(s.bestAccuracy, r.accuracy),
    dailyRuns: s.dailyRuns + (isDaily ? 1 : 0),
    singlePerfectBest: Math.max(s.singlePerfectBest, r.counts.PERFECT),
  };
}
