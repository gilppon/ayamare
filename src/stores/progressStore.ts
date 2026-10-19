import { useMemo } from "react";
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
import { computeUnlocks, isStageId, newlyUnlocked } from "@/game/progression";
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
  /**
   * 방금 기록한 런이 **갱신 전** 최고점을 실제로 넘었는가.
   *
   * 결과 화면이 `bestByStage` 를 비교하면 갱신 *후* 값만 보게 되어,
   * 최고점과 **동점**이어도 "신기록" 으로 표시된다. 비교의 기준이 되는
   * "갱신 전 값" 은 여기서만 존재하므로 기록 시점에 판정해 둔다.
   */
  lastRunNewRecord: boolean;
  /** 이번 런으로 새로 열린 스테이지 (결과 화면 표기용) */
  lastNewlyUnlocked: string[];
  recordRun: (result: GameResult, stageId: string) => string[];
  claim: (missionId: string) => number;
}

/**
 * 스테이지 식별자 정규화.
 *
 * daily 런은 `daily:2026-10-19` 같은 날짜 키로 저장되므로,
 * 정규화하지 않으면 `bestByStage` 에 날짜마다 항목이 하나씩 쌓이고
 * 기록 탭이 내부 ID로 뒤덮인다. 베스트 집계는 날짜와 무관한 "daily" 로 묶는다.
 */
export function baseStageOf(stageId: string): string {
  if (stageId.startsWith("custom:")) return "custom";
  if (stageId.startsWith("daily:")) return "daily";
  return stageId;
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
      lastRunNewRecord: false,
      lastNewlyUnlocked: [],
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

        const baseStage = baseStageOf(stageId);
        const prevBest = prev.bestByStage[baseStage];
        const isNewRecord = !prevBest || result.score > prevBest.score;

        /**
         * C: 해금 판정은 **갱신 전** 상태와 비교해야 한다.
         *
         * 이미 갱신된 `bestByStage` 로 비교하면 이번 런이 연 스테이지가
         * "원래 열려 있던 것" 으로 보여 새로 열렸다고 표시할 수 없다.
         * 그래서 `recordRun` 진입 시점의 해금 상태를 먼저 계산해 둔다.
         *
         * 커스텀/데일리 런은 진행에 영향이 없다 (스테이지 최고 기록을 갱신하지 않음).
         */
        const unlockedBefore = computeUnlocks(prev.bestByStage).unlocked;

        const bestByStage = { ...prev.bestByStage };
        if (isNewRecord && isStageId(baseStage)) {
          bestByStage[baseStage] = {
            score: result.score,
            accuracy: result.accuracy,
            grade: result.grade,
          };
        }
        const unlockedIds = newlyUnlocked(result.accuracy, unlockedBefore);
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
          lastRunNewRecord: isNewRecord,
          lastNewlyUnlocked: unlockedIds,
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
        // lastNewlyUnlocked 는 UI 전용 순간값이라 영속화하지 않는다.
      }),
    }
  )
);

/**
 * 현재 해금 상태 (파생 상태).
 *
 * 저장하지 않는다. `bestByStage` 가 유일한 원본이고 해금 여부는 그 값에서
 * **계산**된다 — 두 값을 따로 저장하면 언젠가는 반드시 어긋난다.
 * (예: 정확도 하향을 바꿨는데 저장된 해금 플래그만 남아 있는 상황)
 */
export function useUnlocks() {
  const bestByStage = useProgressStore((s) => s.bestByStage);
  return useMemo(() => computeUnlocks(bestByStage), [bestByStage]);
}
