import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { writeFileSync } from "node:fs";
import NoteField from "./NoteField";
import { LANES, type LaneConfig } from "@/game/constants";
import { LEAD_TIME } from "@/game/visibility";
import type { Note } from "@/game/types";

/**
 * P-05 성능 프로브 (`npm run test:perf` 전용).
 *
 * jsdom 은 레이아웃/페인트를 하지 않으므로 **브라우저 프레임 비용이 아니라
 * React 조정( reconciliation ) 비용만** 잰다. 즉 "프레임마다 React 가 몇 개의
 * 요소를 다시 만들고 있는가" 를 정량화하는 용도.
 *
 * **절대 시간은 단정하지 않는다.** 공유 러너의 CPU 상태에 좌우되므로 스킵한다.
 * 대신 결과에서 확실히 성립하는 **구조 불변식**만 검증하고, 수치는 보고만 한다.
 * 회귀는 `state.md` 의 기준값과 사람이 비교한다(2026-10 기준 160노트 ≈ 2.9ms).
 *
 * 결과 내보내기: `PERF_OUT=perf.json npm run test:perf`
 */

const laneW = 120;
const laneH = 600;

function makeNotes(count: number, lead: number): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < count; i++) {
    // LEAD_TIME 창 안에 균등 분포 → 실제 화면에 보이는 노트 수와 동일
    const t = (i / count) * lead;
    out.push({
      id: i + 1,
      time: 10 + t,
      lane: i % 4,
      action: "bow15",
      hold: i % 7 === 0 ? 0.5 : 0,
      gimmick: i % 11 === 0 ? "fake" : null,
    } as Note);
  }
  return out;
}

interface Row {
  count: number;
  domNodes: number;
  msPerFrame: number;
}

function bench(count: number, frames = 60, reps = 5): Row {
  const notes = makeNotes(count, LEAD_TIME);
  const stateOf = () => undefined;
  const base = {
    lanes: LANES as unknown as LaneConfig[],
    notes,
    stateOf,
    now: 10,
    laneW,
    laneH,
    hitLineY: laneH - 60,
    beatPhase: 0,
    pressedLanes: [] as readonly number[],
    telegraphs: [] as never,
    popups: [] as never,
    sparks: [] as never,
    shockwaves: [] as never,
    solidRings: [] as never,
    lang: "ko" as const,
  };

  // 워밍업 1회 후 반복 측정 → 중앙값. jsdom 타이머는 노이즈가 커서 최소값보다
  // 중앙값이 안정적이다. (단일 실행 측정은 이 프로젝트에서 신뢰 불가 — state.md 21.1)
  const samples: number[] = [];
  let domNodes = 0;
  for (let r = 0; r < reps + 1; r++) {
    const { rerender, container, unmount } = render(<NoteField {...base} />);
    domNodes = container.querySelectorAll("div").length;
    const t0 = performance.now();
    for (let f = 1; f <= frames; f++) {
      rerender(
        <NoteField {...base} now={10 + (f * LEAD_TIME) / frames} beatPhase={f / 8} />
      );
    }
    if (r > 0) samples.push((performance.now() - t0) / frames);
    unmount();
  }
  samples.sort((a, b) => a - b);
  return { count, domNodes, msPerFrame: samples[Math.floor(samples.length / 2)] };
}

const DENSITIES = [20, 40, 80, 160];

describe("P-05 NoteField 조정 비용 프로브", () => {
  const rows = DENSITIES.map((n) => bench(n));

  it("DOM 크기는 노트 수에 선형으로 증가한다", () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].domNodes).toBeGreaterThan(rows[i - 1].domNodes);
    }
  });

  it("측정 결과를 보고한다 (절대값·비율 모두 단정 없음)", () => {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const noteFactor = last.count / first.count;
    const costFactor = last.msPerFrame / first.msPerFrame;

    const report = [
      ...rows.map(
        (r) =>
          `${String(r.count).padStart(3)}노트 · DOM ${String(r.domNodes).padStart(4)}개 · ${r.msPerFrame.toFixed(2)}ms/frame`
      ),
      `note x${noteFactor.toFixed(1)} -> cost x${costFactor.toFixed(2)} (ratio ${(costFactor / noteFactor).toFixed(2)})`,
      "기준값(2026-10, P-05 직후): 160노트 2.92ms · ratio 0.46",
    ].join("\n");
    // eslint-disable-next-line no-console
    console.log(`\n[NoteField perf]\n${report}`);

    const out = process.env.PERF_OUT;
    if (out) {
      writeFileSync(
        out,
        JSON.stringify(
          { at: new Date().toISOString(), noteFactor, costFactor, rows },
          null,
          2
        ),
        "utf8"
      );
    }

    // **구조 확인만** 한다 — 모든 행이 측정값을 냈는가
    for (const r of rows) {
      expect(Number.isFinite(r.msPerFrame)).toBe(true);
      expect(r.domNodes).toBeGreaterThan(0);
    }
  });
});