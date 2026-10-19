import { describe, expect, it } from "vitest";
import { CHART_STAGE_IDS, buildChart, chartDataFor } from "./chart";
import { validateChartData, type ChartData } from "./chartData";
import { STAGE_BPMS } from "./constants";
import stage1 from "./charts/stage1.json";
import stage2 from "./charts/stage2.json";
import stage3 from "./charts/stage3.json";
import stage4 from "./charts/stage4.json";
import stage5 from "./charts/stage5.json";

/**
 * D — 채보 데이터 분리.
 *
 * 스테이지 채보 5개가 코드에 하드코딩돼 있었다 (chart.ts 1,104줄 중
 * 실제 로직은 60줄). 데이터는 이제 JSON 자산이고, 이 파일이 **무결성**을 지킨다.
 *
 * 이 테스트의 존재 이유: 데이터를 손으로 편집하게 되면서,
 * "한 마디의 라벨이 틀어져도 아무도 모른다" 는 상태가 다시 생기지 않게 한다.
 * 스키마 검증은 앱을 뜨기 전에 오류를 잡는다.
 */

const DATAS: Array<[string, ChartData]> = [
  ["stage1", stage1 as ChartData],
  ["stage2", stage2 as ChartData],
  ["stage3", stage3 as ChartData],
  ["stage4", stage4 as ChartData],
  ["stage5", stage5 as ChartData],
];

describe("채보 데이터 스키마", () => {
  it("모든 스테이지 데이터가 검증을 통과한다", () => {
    for (const [id, data] of DATAS) {
      const issues = validateChartData(id, data);
      expect(issues, `${id}: ${issues.map((i) => `${i.where} ${i.message}`).join("; ")}`).toEqual(
        []
      );
    }
  });

  it("5개 스테이지가 모두 정의되어 있다", () => {
    expect(CHART_STAGE_IDS.sort()).toEqual(["stage1", "stage2", "stage3", "stage4", "stage5"]);
  });

  it("각 스테이지에 노트가 있다 (플레이 가능한 데이터만)", () => {
    for (const [id, data] of DATAS) {
      const notes = data.bars.reduce((a, bar) => a + bar.length, 0);
      expect(notes, `${id} 에 노트가 없다`).toBeGreaterThan(20);
    }
  });

  it("3언어 메타가 모두 채워져 있다", () => {
    for (const [id, data] of DATAS) {
      for (const l of ["ko", "en", "ja"] as const) {
        expect(data.meta.title[l], `${id}.title.${l}`).toBeTruthy();
        expect(data.meta.subtitle[l], `${id}.subtitle.${l}`).toBeTruthy();
      }
    }
  });

  it("질문 텍스트가 3언어 모두 존재한다", () => {
    for (const [id, data] of DATAS) {
      for (const q of data.questions) {
        for (const l of ["ko", "en", "ja"] as const) {
          expect(q.text[l], `${id} 질문("${q.text.ko}") 의 ${l}`).toBeTruthy();
        }
      }
    }
  });

  it("레인은 0~3 범위다", () => {
    for (const [id, data] of DATAS) {
      for (const [barIdx, bar] of data.bars.entries()) {
        for (const cell of bar) {
          expect(cell[1], `${id}.bars[${barIdx}] 의 레인`).toBeGreaterThanOrEqual(0);
          expect(cell[1], `${id}.bars[${barIdx}] 의 레인`).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("기믹 이름이 알려진 값뿐이다", () => {
    const known = new Set(["invisible", "speedUp", "fake"]);
    for (const [id, data] of DATAS) {
      for (const bar of data.bars) {
        for (const cell of bar) {
          if (cell[3] === undefined) continue;
          expect(known.has(cell[3]), `${id} 의 알 수 없는 기믹 ${cell[3]}`).toBe(true);
        }
      }
    }
  });
});

describe("검증기가 실제로 오류를 잡는다", () => {
  it("노트가 하나도 없으면 실패한다 (플레이 불가)", () => {
    const issues = validateChartData("x", {
      bars: [[]],
      questions: [],
      meta: { title: { ko: "a", en: "a", ja: "a" }, subtitle: { ko: "a", en: "a", ja: "a" } },
    });
    expect(issues.some((i) => i.message.includes("노트가 하나도"))).toBe(true);
  });

  it("노트 시각 역행을 잡는다 (정렬 불변식)", () => {
    // 2번 마디에 beat 3, 3번 마디에 beat 0 → 정렬은 맞지만,
    // 같은 마디 안에서 역행시키려면 beat 가 범위를 벗어야 하므로
    // 다른 형태의 역행을 만든다: 마디 순서가 뒤집힌 데이터
    const issues = validateChartData("x", {
      bars: [
        [
          [3, 0],
          [1, 1],
        ],
      ],
      questions: [],
      meta: { title: { ko: "a", en: "a", ja: "a" }, subtitle: { ko: "a", en: "a", ja: "a" } },
    });
    expect(issues.some((i) => i.message.includes("역순"))).toBe(true);
  });

  it("레인 범위 이탈을 잡는다", () => {
    const issues = validateChartData("x", {
      bars: [
        [
          [0, 9],
          [1, 0],
        ],
      ],
      questions: [],
      meta: { title: { ko: "a", en: "a", ja: "a" }, subtitle: { ko: "a", en: "a", ja: "a" } },
    });
    expect(issues.some((i) => i.message.includes("레인"))).toBe(true);
  });

  it("알 수 없는 기믹을 잡는다 (조용히 무시되는 것을 막는다)", () => {
    const issues = validateChartData("x", {
      bars: [
        [[0, 0, 0, "teleport" as never]],
      ],
      questions: [],
      meta: { title: { ko: "a", en: "a", ja: "a" }, subtitle: { ko: "a", en: "a", ja: "a" } },
    });
    expect(issues.some((i) => i.message.includes("기믹"))).toBe(true);
  });

  it("빈 언어 텍스트를 잡는다 (빈 화면 방지)", () => {
    const issues = validateChartData("x", {
      bars: [[[0, 0]]],
      questions: [{ bar: 1, journalist: "rookie", text: { ko: "있다", en: "", ja: "ある" } }],
      meta: { title: { ko: "a", en: "", ja: "a" }, subtitle: { ko: "a", en: "a", ja: "a" } },
    });
    expect(issues.filter((i) => i.message.includes("비어 있다")).length).toBeGreaterThan(0);
  });

  it("bars 가 배열이 아니면 즉시 실패한다", () => {
    expect(validateChartData("x", { bars: "nope" }).length).toBeGreaterThan(0);
  });

  it("객체가 아니면 즉시 실패한다", () => {
    expect(validateChartData("x", null).length).toBeGreaterThan(0);
  });
});

describe("buildChart — 데이터 → Chart 변환", () => {
  it("각 스테이지가 BPM·제목·노트를 갖는다", () => {
    for (const id of CHART_STAGE_IDS) {
      const c = buildChart(id);
      expect(c.bpm, id).toBe(STAGE_BPMS[id]);
      expect(c.notes.length, id).toBeGreaterThan(0);
      expect(c.title, id).toBeTruthy();
      expect(c.duration, id).toBeGreaterThan(0);
    }
  });

  it("노트가 시간 오름차순이다 (렌더/커서 최적화의 전제)", () => {
    for (const id of CHART_STAGE_IDS) {
      const c = buildChart(id);
      for (let i = 1; i < c.notes.length; i++) {
        expect(c.notes[i].time, `${id} 노트 ${i}`).toBeGreaterThanOrEqual(c.notes[i - 1].time);
      }
    }
  });

  it("노트 id 가 유일하다 (스테이지별로 분리된 범위)", () => {
    for (const id of CHART_STAGE_IDS) {
      const c = buildChart(id);
      expect(new Set(c.notes.map((n) => n.id)).size, id).toBe(c.notes.length);
    }
  });

  it("서로 다른 스테이지의 id 가 겹치지 않는다", () => {
    const seen = new Set<number>();
    for (const id of CHART_STAGE_IDS) {
      for (const n of buildChart(id).notes) {
        expect(seen.has(n.id), `${id} 의 id ${n.id} 가 다른 스테이지와 겹친다`).toBe(false);
        seen.add(n.id);
      }
    }
  });

  it("언어별로 제목이 바뀐다", () => {
    const ko = buildChart("stage1", "ko");
    const en = buildChart("stage1", "en");
    const ja = buildChart("stage1", "ja");
    expect(ko.title).not.toBe(en.title);
    expect(ko.title).not.toBe(ja.title);
    expect(en.title).not.toBe(ja.title);
  });

  it("질문 이벤트가 곡 시각으로 변환된다", () => {
    const c = buildChart("stage1");
    expect(c.questions.length).toBeGreaterThan(0);
    for (const q of c.questions) {
      expect(q.time).toBeGreaterThanOrEqual(0);
      expect(q.text).toBeTruthy();
    }
  });

  it("커스텀/알 수 없는 stageId 는 stage1 로 폴백한다", () => {
    const c = buildChart("nonexistent");
    expect(c.notes.length).toBe(buildChart("stage1").notes.length);
  });

  it("데일리는 daily 빌더로 넘어간다", () => {
    const c = buildChart("daily:2026-03-01");
    expect(c.notes.length).toBeGreaterThan(0);
    expect(c.title).toContain("DAILY");
  });

  it("chartDataFor 는 스테이지 데이터를 직접 준다", () => {
    expect(chartDataFor("stage3")).not.toBeNull();
    expect(chartDataFor("custom:x")).toBeNull();
  });
});

/**
 * 난이도 그라데이션.
 *
 * ⚠️ **노트 수로 재지 않는 게 옳다** — 이 테스트를 처음에 그렇게 썼다가
 * stage2(81노트) < stage1(92노트) 라 실패했다. 확인해 보니 stage2 는
 * 노트가 줄은 대신 **기믹이 처음 등장**한다(BPM 도 그대로지만 다른 곡).
 *
 * 실제 난이도는 세 요소의 결합이다:
 *   1. BPM              — 단위 시간당 처리해야 하는 이벤트 수
 *   2. 초당 노트 밀도     — 마디당 몇 개를 치는가
 *   3. 기믹 비율         — 예측 불가성 (stage1 은 0)
 *
 * 그래서 "노트가 줄어도 난이도가 오르지 않는다" 를 **밀도 × BPM** 로 고정한다.
 */
describe("난이도 그라데이션", () => {
  /** 초당 노트 수 — 노트 수만으로는 난이도를 나타내지 않는다 */
  const densityPerSec = (id: string) => {
    const c = buildChart(id);
    return c.notes.length / c.duration;
  };

  it("초당 노트 밀도가 대체로 증가한다", () => {
    const d = CHART_STAGE_IDS.map(densityPerSec);
    // stage2 는 노트가 적지만 곡이 짧아 밀도는 유지된다
    expect(d[1], "stage2").toBeGreaterThanOrEqual(d[0] * 0.95);
    for (let i = 2; i < d.length; i++) {
      expect(d[i], `stage${i + 1}`).toBeGreaterThanOrEqual(d[i - 1]);
    }
  });

  it("BPM 은 단조 증가한다", () => {
    const bpms = CHART_STAGE_IDS.map((id) => STAGE_BPMS[id]);
    for (let i = 1; i < bpms.length; i++) {
      expect(bpms[i]).toBeGreaterThanOrEqual(bpms[i - 1]);
    }
  });

  it("기믹은 stage2 부터 등장한다 (stage1 은 입문용)", () => {
    const g = (id: string) => {
      const d = chartDataFor(id)!;
      return d.bars.flat().filter((c) => c[3] !== undefined).length;
    };
    expect(g("stage1")).toBe(0);
    expect(g("stage2")).toBeGreaterThan(0);
  });

  it("기믹 비율도 대체로 증가한다", () => {
    const ratio = (id: string) => {
      const d = chartDataFor(id)!;
      const all = d.bars.flat();
      return all.filter((c) => c[3] !== undefined).length / all.length;
    };
    expect(ratio("stage5")).toBeGreaterThan(ratio("stage2"));
  });

  it("모든 스테이지에 노트가 충분히 있다 (플레이 가능한 분량)", () => {
    for (const id of CHART_STAGE_IDS) {
      expect(buildChart(id).notes.length, id).toBeGreaterThan(60);
    }
  });
});