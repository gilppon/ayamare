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

export interface GameResult {
  score: number;
  maxCombo: number;
  counts: JudgmentCounts;
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
  ending: {
    title: string;
    text: string;
    tone: "good" | "normal" | "bad" | "disaster" | "secret";
  };
}
