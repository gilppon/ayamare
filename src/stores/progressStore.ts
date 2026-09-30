import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { del, get, set } from "idb-keyval";
import {
  MISSIONS,
  applyRunToSnapshot,
  isMissionComplete,
  type ProgressSnapshot,
} from "@/game/missions";
import { getDailyKey } from "@/game/daily";
import type { GameResult } from "@/game/types";

const idbStorage = createJSONStorage(() => ({
  getItem: async (key: string) => {
    try {
      const v = await get<string>(key);
      return v ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await set(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: async (key: string) => {
    try {
      await del(key);
    } catch {
      /* ignore */
    }
  },
}));

interface ProgressState extends ProgressSnapshot {
  lastPlayDate: string | null;
  streak: number;
  claimed: Record<string, boolean>;
  /** 최근 런에서 새로 달성한 미션 id 목록 */
  lastNewlyCompleted: string[];
  /** 최근 20런 기록 (로컬 분석용) */
  runHistory: Array<{
    date: string;
    stageId: string;
    score: number;
    accuracy: number;
    grade: string;
    maxCombo: number;
  }>;
  /** 스테이지별 베스트 */
  bestByStage: Record<string, { score: number; accuracy: number; grade: string }>;
  recordRun: (result: GameResult, stageId: string) => string[];
  claim: (missionId: string) => number;
}

const initialSnapshot: ProgressSnapshot = {
  totalRuns: 0,
  bestCombo: 0,
  totalDogeza: 0,
  totalPerfect: 0,
  bestAccuracy: 0,
  dailyRuns: 0,
  singlePerfectBest: 0,
};

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initialSnapshot,
      lastPlayDate: null,
      streak: 0,
      claimed: {},
      lastNewlyCompleted: [],
      runHistory: [],
      bestByStage: {},
      recordRun: (result, stageId) => {
        const prev = get();
        const prevSnapshot: ProgressSnapshot = {
          totalRuns: prev.totalRuns,
          bestCombo: prev.bestCombo,
          totalDogeza: prev.totalDogeza,
          totalPerfect: prev.totalPerfect,
          bestAccuracy: prev.bestAccuracy,
          dailyRuns: prev.dailyRuns,
          singlePerfectBest: prev.singlePerfectBest,
        };
        const isDaily = stageId === "daily" || stageId.startsWith("daily:");
        const next = applyRunToSnapshot(prevSnapshot, result, isDaily);

        const today = getDailyKey();
        let streak = prev.streak;
        if (prev.lastPlayDate !== today) {
          if (prev.lastPlayDate) {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            streak = prev.lastPlayDate === getDailyKey(y) ? prev.streak + 1 : 1;
          } else {
            streak = 1;
          }
        }

        const newly: string[] = [];
        for (const m of MISSIONS) {
          const wasComplete =
            prev.claimed[m.id] ||
            isMissionComplete(m, prevSnapshot);
          if (!wasComplete && isMissionComplete(m, next)) newly.push(m.id);
        }

        const baseStage = stageId.startsWith("custom:") ? "custom" : stageId;
        const prevBest = prev.bestByStage[baseStage];
        const bestByStage = { ...prev.bestByStage };
        if (!prevBest || result.score > prevBest.score) {
          bestByStage[baseStage] = {
            score: result.score,
            accuracy: result.accuracy,
            grade: result.grade,
          };
        }
        const runHistory = [
          ...prev.runHistory,
          {
            date: today,
            stageId: baseStage,
            score: result.score,
            accuracy: result.accuracy,
            grade: result.grade,
            maxCombo: result.maxCombo,
          },
        ].slice(-20);

        set({
          ...next,
          lastPlayDate: today,
          streak,
          lastNewlyCompleted: newly,
          runHistory,
          bestByStage,
        });
        return newly;
      },
      claim: (missionId) => {
        const m = MISSIONS.find((x) => x.id === missionId);
        if (!m) return 0;
        const s = get();
        if (s.claimed[missionId]) return 0;
        const snapshot: ProgressSnapshot = {
          totalRuns: s.totalRuns,
          bestCombo: s.bestCombo,
          totalDogeza: s.totalDogeza,
          totalPerfect: s.totalPerfect,
          bestAccuracy: s.bestAccuracy,
          dailyRuns: s.dailyRuns,
          singlePerfectBest: s.singlePerfectBest,
        };
        if (!isMissionComplete(m, snapshot)) return 0;
        set((prev) => ({
          claimed: { ...prev.claimed, [missionId]: true },
        }));
        return m.reward;
      },
    }),
    {
      name: "apolo_progress",
      storage: idbStorage,
      partialize: (s) => ({
        totalRuns: s.totalRuns,
        bestCombo: s.bestCombo,
        totalDogeza: s.totalDogeza,
        totalPerfect: s.totalPerfect,
        bestAccuracy: s.bestAccuracy,
        dailyRuns: s.dailyRuns,
        singlePerfectBest: s.singlePerfectBest,
        lastPlayDate: s.lastPlayDate,
        streak: s.streak,
        claimed: s.claimed,
        runHistory: s.runHistory,
        bestByStage: s.bestByStage,
      }),
    }
  )
);
