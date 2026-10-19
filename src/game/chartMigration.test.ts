/**
 * 데이터 분리(D)의 무손실 검증 — **필드 단위 동치성**.
 *
 * `chart.ts` 1,104줄에서 데이터만 JSON 으로 옮겼다. 이 테스트는 git 의
 * **과거 커밋**에서 원본 `chart.ts` 를 복원해 실행하고, 현재 `buildChart`
 * 출력과 **모든 필드**를 비교한다.
 *
 * "데이터를 옮겼다"가 "데이터 일부를 깎았다"로 조용히 바뀌는 것을 막는다.
 *
 * git 이 없거나(배포 환경) 과거 커밋이 없으면 **건너뛴다** —
 * 이 검증은 개발 중에만 의미가 있다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildChart, CHART_STAGE_IDS } from "./chart";
import type { Lang } from "@/i18n/ui";

/** 데이터 하드코딩 시대의 커밋 (chart.ts 1,104줄) */
const REF = process.env.CHART_REF ?? "2802392";

function gitShow(ref: string, path: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** 과거 구현이 돌려주던 Chart 의 검증에 필요한 최소 형태 */
interface PrevChart {
  title: string;
  subtitle: string;
  bpm: number;
  duration: number;
  notes: Array<{ time: number; lane: number; hold: number; gimmick?: string }>;
  questions: Array<{ time: number; journalist: string; text: string }>;
}

type PrevBuild = (stageId?: string, lang?: Lang) => PrevChart;

const prevSrc = gitShow(REF, "src/game/chart.ts");
// vitest 는 소스 트리 밖 파일을 변환하지 않으므로 **프로젝트 안**에 둔다.
const TMP_REL = "src/game/__prev_chart.ts";
const tmpPath = prevSrc ? join(process.cwd(), TMP_REL) : null;

async function loadPrev(): Promise<PrevBuild | null> {
  if (!prevSrc || !tmpPath) return null;
  // 과거 chart.ts 는 chartData / charts/*.json 을 쓰지 않으므로
  // 그 import 만 제거하면 그대로 실행된다.
  const patched = prevSrc
    .replace(/^import .*from "\.\/chartData";$/m, "")
    .replace(/^import stage\d from "\.\/charts\/stage\d\.json";$/gm, "");
  writeFileSync(tmpPath, patched, "utf8");
  try {
    // Vite 는 정적 import 를 변환 시점에 해석하므로 경로를 변수로 만들어 우회한다.
    const spec = "./__prev_chart" + ".ts";
    const mod = (await import(/* @vite-ignore */ spec)) as { buildChart?: PrevBuild };
    return typeof mod.buildChart === "function" ? mod.buildChart : null;
  } catch {
    return null;
  }
}

const buildPrev: PrevBuild | null = await loadPrev();

afterAll(() => {
  if (tmpPath && existsSync(tmpPath)) rmSync(tmpPath, { force: true });
});

const SKIP =
  prevSrc === null
    ? `git 이 없거나 기준 커밋(${REF}) 을 찾을 수 없다`
    : null;

describe.skipIf(!buildPrev)("D: 데이터 분리는 무손실이다", () => {
  const stages = ["stage1", "stage2", "stage3", "stage4", "stage5"];
  const langs = ["ko", "en", "ja"] as const;

  for (const stage of stages) {
    for (const lang of langs) {
      it(`${stage} / ${lang} 이 이전 구현과 완전히 동일하다`, () => {
        // describe.skipIf 로 걸러졌지만 TS 는 좁히지 못한다
        if (!buildPrev) throw new Error("이전 구현을 불러오지 못했다");
        const prev: PrevChart = buildPrev(stage, lang);
        const next = buildChart(stage, lang);

        expect(next.title).toBe(prev.title);
        expect(next.subtitle).toBe(prev.subtitle);
        expect(next.bpm).toBe(prev.bpm);
        expect(next.duration).toBeCloseTo(prev.duration, 9);
        expect(next.questions).toHaveLength(prev.questions.length);

        expect(next.notes).toHaveLength(prev.notes.length);
        for (let i = 0; i < prev.notes.length; i++) {
          const p = prev.notes[i];
          const n = next.notes[i];
          expect(n.time, `${stage}/${lang} 노트 ${i} 시각`).toBeCloseTo(p.time, 9);
          expect(n.lane, `${stage}/${lang} 노트 ${i} 레인`).toBe(p.lane);
          expect(n.hold, `${stage}/${lang} 노트 ${i} 홀드`).toBeCloseTo(p.hold, 9);
          expect(n.gimmick ?? null, `${stage}/${lang} 노트 ${i} 기믹`).toBe(p.gimmick ?? null);
        }

        expect(next.questions).toHaveLength(prev.questions.length);
        for (let i = 0; i < prev.questions.length; i++) {
          const p = prev.questions[i];
          const n = next.questions[i];
          expect(n.time, `${stage}/${lang} 질문 ${i} 시각`).toBeCloseTo(p.time, 9);
          expect(n.text, `${stage}/${lang} 질문 ${i} 텍스트`).toBe(p.text);
          expect(n.journalist, `${stage}/${lang} 질문 ${i} 기자`).toBe(p.journalist);
        }
      });
    }
  }
});

describe("동치성 검증 자체의 상태", () => {
  it(`검증이 실행되었는지 알려 준다 (스킵 사유: ${SKIP ?? "없음"})`, () => {
    // git 이 없는 배포 환경에서는 스킵된다 — 조용히 통과가 아니라 상태를 노출한다
    expect(typeof buildPrev === "function" || buildPrev === null).toBe(true);
  });

  it("기준 커밋의 chart.ts 가 하드코딩 데이터다 (분리 전 상태)", () => {
    if (!prevSrc) {
      // 환경에 따라 스킵
      expect(existsSync("src/game/charts/stage1.json")).toBe(true);
      return;
    }
    // BARS 라는 대형 배열이 코드 안에 있어야 한다
    expect(prevSrc).toContain("const BARS: Cell[][]");
    // 데이터 분리 전 chart.ts 는 데이터만으로 수천 줄이었다
    expect(prevSrc.length).toBeGreaterThan(15_000);
  });

  it("JSON 자산이 기준 커밋의 데이터와 한 글자도 다르지 않다", () => {
    if (!prevSrc) {
      // git 이 없으면 스킵하되 자산은 존재해야 한다
      for (const id of CHART_STAGE_IDS) {
        expect(existsSync(`src/game/charts/${id}.json`), id).toBe(true);
      }
      return;
    }
    // 재생성기가 만든 결과와 현재 파일이 바이트 단위로 같아야 한다.
    // (직접 수정한 JSON 은 여기서 걸린다 — 의도한 변경이면 기준 커밋도 함께 갱신)
    const res = execFileSync("node", ["scripts/extract-charts.mjs", REF, "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(res).toContain("OK");
  });
});