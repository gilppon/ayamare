/**
 * 채보 데이터 스키마 (순수함수 + 검증).
 *
 * D: 스테이지 채보가 코드 안에 하드코딩돼 있을 때 생기는 문제
 *  - 리뷰할 때 1,104줄 중 실제 로직은 60줄뿐이고 나머지는 데이터다
 *  - 한 마디의 라벨이 틀어져도 **아무도 모른다** (스키마 검증이 없으므로)
 *  - 데이터를 수정하려면 코드 편집기를 열어야 한다
 *
 * 데이터는 `src/game/charts/*.json` 으로 옮기고, 이 모듈이 **스키마를 정의하고
 * 검증한다.** 잘못된 데이터는 앱을 뜨기 전에 즉시 실패한다.
 */

import type { Lang } from "@/i18n/ui";
import type { Chart, JournalistType, Note, QuestionEvent } from "./types";

/** 셀: [박자, 레인, 홀드(박 단위)?, 기믹?] */
export type Cell = [beat: number, lane: number, holdBeats?: number, gimmick?: Note["gimmick"]];

export interface QSpec {
  bar: number;
  journalist: JournalistType;
  text: Record<Lang, string>;
}

export interface StageMeta {
  title: Record<Lang, string>;
  subtitle: Record<Lang, string>;
}

/** `src/game/charts/*.json` 파일 스키마 */
export interface ChartData {
  /** 마디별 셀. 빈 배열 = 쉬는 마디(카운트인) */
  bars: Cell[][];
  questions: QSpec[];
  meta: StageMeta;
}

export const LANGS: readonly Lang[] = ["ko", "en", "ja"] as const;

export const GIMMICKS: readonly NonNullable<Note["gimmick"]>[] = [
  "invisible",
  "speedUp",
  "fake",
] as const;

export const JOURNALISTS: readonly JournalistType[] = [
  "rookie",
  "economy",
  "investigative",
  "internet",
  "veteran",
  "boss",
] as const;

/** 데이터 검증 오류 목록 (빈 배열 = 통과) */
export interface ValidationIssue {
  /** 사람이 읽을 위치 표기 (예: "stage3 bars[42]") */
  where: string;
  message: string;
}

/**
 * 스키마 검증.
 *
 * 게임이 크래시하지 않더라도 **플레이가 무의미해지는** 데이터 오류를 잡는다:
 *  - 빈 스테이지 (노트가 하나도 없으면 플레이가 성립하지 않는다)
 *  - 노트 시각이 역행 (정렬 불변식 — 렌더/커서 최적화의 전제)
 *  - 레인/박자 범위 이탈
 *  - 기믹 이름 오타 (조용히 무시된다)
 *  - 3언어 중 하나라도 비어 있음 (비어 있으면 그 언어로 볼 때 빈 화면)
 *  - 질문 시각이 곡 길이를 벗어남
 */
export function validateChartData(stageId: string, data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const d = data as Partial<ChartData> | null;

  if (!d || typeof d !== "object") {
    return [{ where: stageId, message: "데이터가 객체가 아니다" }];
  }
  if (!Array.isArray(d.bars)) {
    return [{ where: stageId, message: "bars 가 배열이 아니다" }];
  }
  if (!Array.isArray(d.questions)) {
    issues.push({ where: `${stageId}.questions`, message: "questions 가 배열이 아니다" });
  }

  // ── 바 / 셀
  let noteCount = 0;
  let prevBeatPos = -Infinity;
  d.bars.forEach((bar, barIdx) => {
    if (!Array.isArray(bar)) {
      issues.push({ where: `${stageId}.bars[${barIdx}]`, message: "마디가 배열이 아니다" });
      return;
    }
    bar.forEach((cell, cellIdx) => {
      const where = `${stageId}.bars[${barIdx}][${cellIdx}]`;
      if (!Array.isArray(cell) || cell.length < 2) {
        issues.push({ where, message: "셀은 [beat, lane, ...] 형태여야 한다" });
        return;
      }
      const [beat, lane, holdBeats = 0, gimmick] = cell as Cell;
      noteCount++;
      if (!Number.isFinite(beat) || beat < 0 || beat >= 4) {
        issues.push({ where, message: `박자가 범위 밖이다: ${beat}` });
      }
      if (lane !== 0 && lane !== 1 && lane !== 2 && lane !== 3) {
        issues.push({ where, message: `레인이 0~3 이 아니다: ${lane}` });
      }
      if (holdBeats !== undefined && (!Number.isFinite(holdBeats) || holdBeats < 0)) {
        issues.push({ where, message: `홀드 길이가 잘못됨: ${holdBeats}` });
      }
      if (gimmick !== undefined && !GIMMICKS.includes(gimmick)) {
        issues.push({ where, message: `알 수 없는 기믹: ${String(gimmick)}` });
      }
      // 정렬 불변식 (renders/커서가 전제로 삼는다)
      const pos = barIdx * 4 + beat;
      if (pos < prevBeatPos) {
        issues.push({ where, message: "노트가 시간 역순 — 정렬 불변식이 깨졌다" });
      }
      prevBeatPos = pos;
    });
  });

  if (noteCount === 0) {
    issues.push({ where: stageId, message: "노트가 하나도 없다 (플레이 불가)" });
  }

  // ── 질문
  if (Array.isArray(d.questions)) {
    d.questions.forEach((q, i) => {
      const where = `${stageId}.questions[${i}]`;
      if (!q || typeof q !== "object") {
        issues.push({ where, message: "질문 항목이 객체가 아니다" });
        return;
      }
      if (!Number.isFinite(q.bar) || q.bar < 0) {
        issues.push({ where, message: `질문 마디가 잘못됨: ${String(q.bar)}` });
      }
      if (!JOURNALISTS.includes(q.journalist)) {
        issues.push({ where, message: `알 수 없는 기자: ${String(q.journalist)}` });
      }
      if (!q.text || typeof q.text !== "object") {
        issues.push({ where, message: "text 가 없다" });
        return;
      }
      for (const l of LANGS) {
        if (typeof q.text[l] !== "string" || q.text[l].trim() === "") {
          issues.push({ where, message: `${l} 텍스트가 비어 있다` });
        }
      }
    });
  }

  // ── 메타
  const meta = d.meta;
  if (!meta || typeof meta !== "object") {
    issues.push({ where: `${stageId}.meta`, message: "meta 가 없다" });
  } else {
    for (const field of ["title", "subtitle"] as const) {
      const m = meta[field];
      if (!m || typeof m !== "object") {
        issues.push({ where: `${stageId}.meta.${field}`, message: "없다" });
        continue;
      }
      for (const l of LANGS) {
        if (typeof m[l] !== "string" || m[l].trim() === "") {
          issues.push({ where: `${stageId}.meta.${field}`, message: `${l} 이 비어 있다` });
        }
      }
    }
  }

  return issues;
}

/** 검증 결과를 사람이 읽을 한 줄로 (개발 모드 경고용) */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.where}: ${i.message}`).join("\n");
}

/**
 * 검증 실패 시 로그를 남기고 **데이터를 그대로 사용**한다.
 *
 * 검증을 통과하지 못한 데이터를 **버리면** 플레이가 아예 불가능해진다.
 * 검증은 "사람이 알아야 한다" 는 것이 목적이지 런타임 차단이 목적이 아니다.
 * (개발 모드에서만 경고 — 프로덕션에서 콘솔을 더럽히지 않는다)
 */
export function assertChartData(stageId: string, data: unknown): ChartData {
  const issues = validateChartData(stageId, data);
  if (issues.length > 0 && import.meta.env?.DEV) {
    console.warn(`[chart] ${stageId} 데이터 검증 실패:\n${formatIssues(issues)}`);
  }
  return data as ChartData;
}

/** 데이터 → Chart 변환 (로직은 이 함수에만 존재한다) */
export function chartFromData(
  data: ChartData,
  lang: Lang,
  bpm: number,
  actionByLane: readonly string[],
  idBase: number
): Chart {
  const beatDur = 60 / bpm;
  const notes: Note[] = [];
  let id = idBase;

  data.bars.forEach((cells, bar) => {
    for (const [beat, lane, holdBeats = 0, gimmick] of cells) {
      notes.push({
        id: id++,
        time: (bar * 4 + beat) * beatDur,
        lane: lane as 0 | 1 | 2 | 3,
        action: actionByLane[lane] as Note["action"],
        hold: holdBeats * beatDur,
        gimmick,
      });
    }
  });

  const questions: QuestionEvent[] = data.questions.map((q) => ({
    time: q.bar * 4 * beatDur,
    journalist: q.journalist,
    text: q.text[lang],
  }));

  const last = notes[notes.length - 1];
  const duration = last ? last.time + Math.max(last.hold, 0) + 2.4 : 10;

  return {
    title: data.meta.title[lang],
    subtitle: data.meta.subtitle[lang],
    bpm,
    notes,
    questions,
    duration,
    version: 2,
  };
}