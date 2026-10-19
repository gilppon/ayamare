/**
 * 스테이지 진행 (해금) 규칙 — 순수함수.
 *
 * 스테이지 목록과 진행 상태를 **한곳에** 정의한다.
 * 화면(TitleScreen)과 저장(progressStore)이 같은 규칙을 참조해야
 * "화면에서는 잠겨 있는데 플레이는 된다" 같은 불일치가 생기지 않는다.
 */

import { STAGE_BPMS } from "./constants";
import type { JudgmentCounts } from "./types";

export type StageId = "stage1" | "stage2" | "stage3" | "stage4" | "stage5";

export interface StageDef {
  id: StageId;
  /** 정 순서 (선형 진행) */
  order: number;
  bpm: number;
  /**
   * 이 스테이지를 해금하는 데 필요한 **직전 스테이지**의 정확도 하한.
   * stage1 은 예외로 항상 열려 있다.
   */
  requiredAccuracy: number;
  /** 안NQ하면 콘텐츠가 생기는지 (결과 화면 연출) */
  color: string;
}

/**
 * 해금 기준.
 *
 * 너무 빡빡하면 플레이어가 막혀서 떠난다. 너무 느슨하면 의미가 없다.
 * 각 스테이지 BPM 이 120 → 150 으로 오르므로, 난이도가 실제로 올라간다.
 * 이 값을 올리면 그만큼 "해금까지의 벽" 도 함께 올라간다.
 */
export const STAGES: StageDef[] = [
  { id: "stage1", order: 1, bpm: STAGE_BPMS.stage1, requiredAccuracy: 0, color: "#f43f5e" },
  { id: "stage2", order: 2, bpm: STAGE_BPMS.stage2, requiredAccuracy: 0.8, color: "#a855f7" },
  { id: "stage3", order: 3, bpm: STAGE_BPMS.stage3, requiredAccuracy: 0.85, color: "#38bdf8" },
  { id: "stage4", order: 4, bpm: STAGE_BPMS.stage4, requiredAccuracy: 0.88, color: "#fb923c" },
  { id: "stage5", order: 5, bpm: STAGE_BPMS.stage5, requiredAccuracy: 0.9, color: "#f87171" },
];

export const FIRST_STAGE = STAGES[0];

/** 정규화 키 → StageId 매핑 (bestByStage 키가 정규화되어 있다는 전제) */
const STAGE_IDS = new Set(STAGES.map((s) => s.id));

export function isStageId(v: string): v is StageId {
  return STAGE_IDS.has(v as StageId);
}

/**
 * 스테이지 ID → i18n 키 (타입 레벨에서 안전).
 *
 * 템플릿 리터럴로 키를 만들면 `title.${string}` 이 되어 `tr` 의 키 유니온과
 * 맞지 않아 컴파일이 깨진다. `StageId` ↔ 키를 명시적으로 매핑해 이걸 막는다.
 * 스테이지가 늘어나면 여기도 함께 늘려야 한다 (컴파일러가 강제).
 */
export type StageTitleKey = "title.stage1" | "title.stage2" | "title.stage3" | "title.stage4" | "title.stage5";

const STAGE_TITLE_KEYS: Record<StageId, StageTitleKey> = {
  stage1: "title.stage1",
  stage2: "title.stage2",
  stage3: "title.stage3",
  stage4: "title.stage4",
  stage5: "title.stage5",
};

export function stageTitleKey(id: string): StageTitleKey {
  return STAGE_TITLE_KEYS[id as StageId] ?? "title.stage1";
}

/** 스테이지 ID → 정의. 모르는 값은 null (custom/daily 등) */
export function stageDef(id: string): StageDef | null {
  return isStageId(id) ? (STAGES.find((s) => s.id === id) ?? null) : null;
}

/** 직전 스테이지의 정의 (첫 스테이지는 null) */
export function prevStage(id: StageId): StageDef | null {
  const cur = stageDef(id);
  if (!cur || cur.order <= 1) return null;
  return STAGES.find((s) => s.order === cur.order - 1) ?? null;
}

export interface UnlockState {
  /** 스테이지 ID → 해금 여부 */
  unlocked: Record<string, boolean>;
}

/**
 * 현재 해금 상태를 계산한다.
 *
 * 규칙: `stageN` 은 `stage(N-1)` 을 **해금 기준 정확도 이상**으로 클리어하면 열린다.
 * 데일리/커스텀/미션은 진행에 영향 없다 — 별도 진입점 유지.
 *
 * @param bestByStage 정규화된 스테이지별 최고 기록 (progressStore.baseStageOf 결과 키)
 */
export function computeUnlocks(bestByStage: Record<string, { accuracy: number }>): UnlockState {
  const unlocked: Record<string, boolean> = {};
  for (const stage of STAGES) {
    const prev = prevStage(stage.id);
    if (!prev) {
      // 첫 스테이지는 항상 열려 있다
      unlocked[stage.id] = true;
      continue;
    }
    const prevBest = bestByStage[prev.id];
    unlocked[stage.id] = !!prevBest && prevBest.accuracy >= stage.requiredAccuracy;
  }
  return { unlocked };
}

export type StageStatus = "locked" | "unlocked";

/**
 * 스테이지 표시 상태.
 *
 * - `locked`   : 앞 스테이지를 아직 기준에 못 미쳤다
 * - `unlocked` : 진입 가능 (첫 스테이지는 처음부터)
 *
 * "클리어했는가" 는 별개 개념이므로 여기서 다루지 않는다.
 * 해금 여부만 판정한다 — 기준이 하나뿐이라 혼선을 막는다.
 */
export function stageStatus(
  id: StageId,
  bestByStage: Record<string, { accuracy: number }>
): StageStatus {
  return computeUnlocks(bestByStage).unlocked[id] ? "unlocked" : "locked";
}

/**
 * 잠긴 스테이지에서 요구 정확도까지의 진행도 (0~1).
 * 잠겼을 때 "조금만 더" 를 보여주기 위한 값.
 */
export function unlockProgress(
  id: StageId,
  bestByStage: Record<string, { accuracy: number }>
): number {
  const def = stageDef(id);
  if (!def || def.requiredAccuracy === 0) return 1;
  const prev = prevStage(id);
  const prevBest = prev ? bestByStage[prev.id] : undefined;
  if (!prevBest) return 0;
  return Math.min(1, prevBest.accuracy / def.requiredAccuracy);
}

/**
 * 이번 런으로 **새로** 열린 스테이지 목록.
 *
 * `unlockedBefore` 는 런 시작 시점의 해금 상태다. 비교가 없으면
 * "원래 열려 있던 것" 을 다시 띄워 버리므로 반드시 이전 상태를 받는다.
 *
 * ⚠️ **선형 규칙을 지켜야 한다.** 조건만 독립적으로 보면
 * "stage1 을 99% 로 클리어" 한 런이 stage2~5 를 한꺼번에 열어 버린다.
 * 플레이어가 실제로 순서대로 밟아간 느낌이 사라지고,
 * 낮은 난이도의 stage1 클리어가 나머지 벽을 한 번에 무너뜨린다.
 *
 * 그래서 **앞에서부터 순서대로** 확인하며, 조건을 만족하면 계속 진행하고
 * 아니면 즉시 멈춘다 (그 뒤는 앞 스테이지를 아직 못 넘었으므로 열 수 없다).
 *
 * 이 판정을 호출하는 시점은 `recordRun` **이전**이어야 한다.
 * (이미 갱신된 상태와 비교하면 영원히 "새로 열림" 이 없다)
 */
export function newlyUnlocked(
  accuracy: number,
  unlockedBefore: Record<string, boolean>
): StageId[] {
  const opened: StageId[] = [];
  for (const stage of STAGES) {
    if (unlockedBefore[stage.id]) continue; // 이미 열려 있으면 통과
    if (stage.requiredAccuracy === 0) continue; // 첫 스테이지는 대상 아님
    if (accuracy < stage.requiredAccuracy) break; // 여기서 멈추면 이후도 불가
    opened.push(stage.id);
  }
  return opened;
}

/** 런 결과가 "클리어 라인"(MISS/BAD 없음) 인지 — 결과 화면 표기용 */
export function clearLine(counts: JudgmentCounts): boolean {
  return counts.MISS === 0 && counts.BAD === 0;
}