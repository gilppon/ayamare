export type ApologyAction = "bow15" | "bow45" | "bow90" | "dogeza";

export type Judgment = "PERFECT" | "GREAT" | "GOOD" | "BAD" | "MISS";

export type SkillType =
  | "none"
  | "teardrops"
  | "steady_hands"
  | "wide_heart"
  | "bulletproof"
  | "combo_chain"
  | "opening_cheer"
  | "media_control"
  | "calm_voice"
  | "safe_asset";

export type JournalistType =
  | "rookie"
  | "economy"
  | "investigative"
  | "internet"
  | "veteran"
  | "boss";

export interface Note {
  id: number;
  /** Seconds from song start (t = 0). */
  time: number;
  lane: 0 | 1 | 2 | 3;
  action: ApologyAction;
  /** Hold duration in seconds. 0 = tap note. */
  hold: number;
  gimmick?: "speedUp" | "invisible" | "fake";
}

export interface QuestionEvent {
  time: number;
  journalist: JournalistType;
  text: string;
}

export interface Chart {
  title: string;
  subtitle: string;
  bpm: number;
  notes: Note[];
  questions: QuestionEvent[];
  /** Total song length in seconds. */
  duration: number;
  /** 차트 스키마 버전 */
  version?: number;
}

export interface SnsItem {
  id: number;
  user: string;
  text: string;
  tone: "positive" | "negative" | "neutral";
}

export interface JudgmentCounts {
  PERFECT: number;
  GREAT: number;
  GOOD: number;
  BAD: number;
  MISS: number;
}

/**
 * 타이밍 통계 (진단용).
 *
 * 점수만으로는 "PERFECT 가 왜 안 나오지" 를 설명할 수 없다.
 * 이 값은 사용자가 자기 오디오 지연(유선/블루투스)을 스스로 보정하게 한다.
 * `game/timing.ts` 의 순수함수(`timingStats`)가 생성한다.
 */
export interface TimingStats {
  /** 히스토그램 버킷별 개수 */
  buckets: number[];
  /** 표본 수 */
  count: number;
  /** 평균 오차(ms). 음수 = 빠름, 양수 = 늦음 */
  meanMs: number;
  /** 중앙값 오차(ms) — 아웃라이어에 강함 */
  medianMs: number;
  /** 표준편차(ms) */
  stdDevMs: number;
  /** 절대 오차 평균(ms) */
  meanAbsMs: number;
  /**
   * 추천 오프셋(ms). 이 값을 설정에 넣으면 판정이 환경에 맞춰진다.
   * 표본이 적거나 흔들리는 플레이어는 자동 적용하지 않는다 — 신뢰 구간 밖.
   */
  suggestedOffsetMs: number;
  /** 추천값을 그대로 적용해도 되는지 (표본 수 · 산포 기준) */
  suggestionReliable: boolean;
}

export interface GameResult {
  score: number;
  maxCombo: number;
  counts: JudgmentCounts;
  /**
   * 홀드 노트 "릴리즈" 판정 집계. 탭 판정(counts)과 분리해 두어
   * accuracy 분모(= 탭 노트 수 = notes.length) 불변식을 깨지 않는다. (B-08)
   */
  releaseCounts?: JudgmentCounts;
  /** 강제 해제(타임아웃)로 종료된 홀드 수. 놓친 손똉이 지표. (B-01) */
  forcedReleases?: number;
  accuracy: number;
  grade: string;
  allPerfect: boolean;
  stock: number;
  anger: number;
  stageId: string;
  /** 이번 런에서 친 도게자 PERFECT/GREAT 수 */
  dogezaHits: number;
  /** 반성포인트 획득량 */
  points: number;
  /** A: 타이밍 진단 — 지연 보정 가이드 (없으면 구버전 기록) */
  timing?: TimingStats;
  ending: {
    title: string;
    text: string;
    tone: "good" | "normal" | "bad" | "disaster" | "secret";
  };
}
