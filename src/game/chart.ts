/**
 * 채보 로직 — 데이터는 `src/game/charts/*.json` 에 있다.
 *
 * D: 스테이지 채보 5개가 코드에 하드코딩돼 있었다.
 * 이 파일은 1,104줄이었고 그중 실제 로직은 60줄, 나머지는 데이터였다.
 *  - 리뷰할 때 데이터와 로직이 뒤섞여 진짜 문제를 놓친다
 *  - 한 마디의 라벨이 틀어져도 아무도 모른다 (스키마 검증이 없었음)
 *  - 데이터 수정을 위해 코드 편집기를 열어야 한다
 *
 * 이제 데이터는 JSON 자산이고, 이 파일은 **변환 로직만** 갖는다.
 * 데이터 오류는 `chartData.validateChartData` 가 잡는다.
 */

import { ACTION_BY_LANE, bpmForStage } from "./constants";
import { buildDailyChart, getDailyKey } from "./daily";
import { assertChartData, chartFromData, type ChartData } from "./chartData";
import type { Chart } from "./types";
import type { Lang } from "@/i18n/ui";

import stage1 from "./charts/stage1.json";
import stage2 from "./charts/stage2.json";
import stage3 from "./charts/stage3.json";
import stage4 from "./charts/stage4.json";
import stage5 from "./charts/stage5.json";

/**
 * 스테이지별 데이터. 키가 곧 `stageId` 다.
 *
 * `resolveJsonModule` 로 JSON 을 그대로 import 하므로 빌드 단계에서
 * 파일이 없으면 **컴파일이 실패한다** — 런타임에 "데이터 없음" 으로 조용히
 * 진행되는 일이 없다.
 */
const DATA_BY_STAGE: Record<string, ChartData> = {
  stage1: stage1 as ChartData,
  stage2: stage2 as ChartData,
  stage3: stage3 as ChartData,
  stage4: stage4 as ChartData,
  stage5: stage5 as ChartData,
};

/** stageId 의 숫자 부분을 뽑는다 (stage3 → 3). 모르는 형식은 null. */
function stageOrdinal(stageId: string): number | null {
  const m = /^stage([1-5])$/.exec(stageId);
  return m ? Number(m[1]) : null;
}

/**
 * 스테이지 채보를 만든다.
 *
 * id 는 스테이지별로 분리된 범위를 쓴다 (한 자리수만으로 충분) —
 * 서로 다른 채보의 노트가 같은 id 를 갖지 않아야 저장/표시에서 구분이 된다.
 */
export function buildChart(stageId: string = "stage1", lang: Lang = "ko"): Chart {
  if (stageId === "daily" || stageId.startsWith("daily:")) {
    const key = stageId.includes(":") ? stageId.split(":")[1] : getDailyKey();
    return buildDailyChart(key, lang);
  }

  const data = DATA_BY_STAGE[stageId] ?? DATA_BY_STAGE.stage1;
  const bpm = bpmForStage(stageId);
  const ordinal = stageOrdinal(stageId) ?? 1;
  return chartFromData(assertChartData(stageId, data), lang, bpm, ACTION_BY_LANE, ordinal * 100000);
}

/** 스테이지 데이터 직접 접근 (테스트·툴용) */
export function chartDataFor(stageId: string): ChartData | null {
  return DATA_BY_STAGE[stageId] ?? null;
}

/** 정의된 스테이지 목록 */
export const CHART_STAGE_IDS = Object.keys(DATA_BY_STAGE);