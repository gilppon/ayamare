import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import NoteField from "./NoteField";
import type { Note } from "@/game/types";
import { LANES } from "@/game/constants";

/**
 * NoteField 회귀 안전망.
 *
 * Q-02 로 GameScreen 에서 분리하면서 "노트가 어디에 그려지는가" 를 그대로 옮겼다.
 * 순수 계산은 `game/noteLayout` 가 담당하고 여기서는 **배치와 채널** 만 확인한다.
 */

const HIT_LINE_Y = 400;
const LANE_H = 460;
const LANE_W = 100;

const ACTIONS = ["bow15", "bow45", "bow90", "dogeza"] as const;
const note = (over: Partial<Note> = {}): Note => ({
  id: 1,
  time: 10,
  lane: 0,
  action: "bow15",
  hold: 0,
  ...over,
});

const baseProps = {
  lanes: LANES,
  notes: [] as Note[],
  stateOf: () => undefined,
  now: 9.5,
  laneW: LANE_W,
  laneH: LANE_H,
  hitLineY: HIT_LINE_Y,
  beatPhase: 0,
  pressedLanes: [] as number[],
  telegraphs: [] as never[],
  popups: [] as never[],
  sparks: [] as never[],
  shockwaves: [] as never[],
  solidRings: [] as never[],
  lang: "ko" as const,
};

describe("NoteField", () => {
  it("레인 4개의 배경이 모두 그려진다", () => {
    const { container } = render(<NoteField {...baseProps} />);
    // 레인 배경 4 + 리시버 4 = 8개 (상대 % 위치 div)
    expect(container.querySelectorAll('[style*="width: 25%"]').length).toBeGreaterThanOrEqual(8);
  });

  it("노트 라벨이 레인 라벨로 렌더된다", () => {
    const { getByText } = render(
      <NoteField {...baseProps} notes={[note({ lane: 1, action: "bow45" })]} />
    );
    expect(getByText("45°")).toBeTruthy();
  });

  it("I-04: 배경 휘도에 따라 라벨 색이 정해진다", () => {
    // lane 3 = DOGEZA(분홍) → 어두운 글자
    const { getByText } = render(
      <NoteField {...baseProps} notes={[note({ lane: 3, action: "dogeza" })]} />
    );
    const el = getByText("DOGEZA");
    expect(el.style.color).toBe("rgb(11, 15, 25)");
  });

  it("fake 노트는 '???' 로 렌더되고 글로우가 없다", () => {
    const { getByText } = render(
      <NoteField {...baseProps} notes={[note({ gimmick: "fake", hold: 2 })]} />
    );
    const el = getByText("???");
    expect(el.style.boxShadow).toBe("none");
  });

  it("invisible 노트는 점선 테두리를 갖는다 (기믹 표시)", () => {
    const { getByText } = render(
      <NoteField {...baseProps} notes={[note({ gimmick: "invisible" })]} />
    );
    expect(getByText("주의!").style.border).toContain("dashed");
  });

  it("speedUp 노트는 가속 라벨을 쓴다", () => {
    const { getByText } = render(
      <NoteField {...baseProps} notes={[note({ gimmick: "speedUp" })]} />
    );
    expect(getByText("가속!")).toBeTruthy();
  });

  it("miss 상태의 노트는 포인터 영역에서 사라지지 않는다 (흘러가는 연출)", () => {
    const { getByText } = render(
      <NoteField
        {...baseProps}
        notes={[note()]}
        stateOf={() => "miss"}
        now={10.5}
      />
    );
    expect(getByText("15°")).toBeTruthy();
  });

  it("hit 상태의 노트는 렌더 대상이 아니다 (상위에서 필터링)", () => {
    // NoteField 는 상태를 직접 판단하지 않는다 — visibleNotes 로 필터링된 입력을 받는다
    const { queryByText } = render(
      <NoteField {...baseProps} notes={[]} stateOf={() => "hit"} />
    );
    expect(queryByText("15°")).toBeNull();
  });

  it("홀드 노트는 테일을 그린다", () => {
    const { container } = render(
      <NoteField {...baseProps} notes={[note({ hold: 1 })]} />
    );
    // 테일은 명시적 data 속성 대신 리시버 래퍼와 구분되는 inline 높이 를 갖는다
    const withTail = Array.from(container.querySelectorAll(".rounded-full")).filter(
      (el) => Number.parseFloat((el as HTMLElement).style.height) > 0
    );
    expect(withTail.length).toBe(1);
  });

  it("가짜 노트는 테일을 그리지 않는다", () => {
    const { container } = render(
      <NoteField {...baseProps} notes={[note({ gimmick: "fake", hold: 2 })]} />
    );
    const tails = Array.from(container.querySelectorAll(".rounded-full")).filter(
      (el) => Number.parseFloat((el as HTMLElement).style.height) > 0
    );
    expect(tails.length).toBe(0);
  });

  it("I-05: 레인마다 리시버 바가 있다", () => {
    const { container } = render(<NoteField {...baseProps} />);
    const receivers = container.querySelectorAll(".rounded-b-lg");
    expect(receivers.length).toBe(4);
  });

  it("눌린 레인의 리시버는 불투명도가 올라간다", () => {
    const { container } = render(<NoteField {...baseProps} pressedLanes={[2]} />);
    const receivers = container.querySelectorAll(".rounded-b-lg");
    const pressed = Array.from(receivers).find(
      (el) => Number.parseFloat((el as HTMLElement).style.opacity) > 0.5
    );
    expect(pressed).toBeTruthy();
  });

  it("홀드 노트가 잡힌 레인은 진행 표시가 붙는다", () => {
    const { container } = render(
      <NoteField {...baseProps} notes={[note({ lane: 1, hold: 1 })]} />
    );
    expect(container.querySelectorAll(".h-1.rounded-full").length).toBeGreaterThan(0);
  });

  it("U-03: 기믹 예고 마커가 레인 상단에 뜬다", () => {
    const { getByText } = render(
      <NoteField
        {...baseProps}
        telegraphs={[{ lane: 1, kind: "invisible", urgency: 0.8 }]}
      />
    );
    expect(getByText("투명 노트")).toBeTruthy();
    expect(getByText("▲")).toBeTruthy();
  });

  it("U-03: 가짜 예고는 다른 라벨을 쓴다", () => {
    const { getByText } = render(
      <NoteField {...baseProps} telegraphs={[{ lane: 3, kind: "fake", urgency: 1 }]} />
    );
    expect(getByText("가짜 — 치지 마세요")).toBeTruthy();
  });

  it("I-07: 정지 링이 모션 없이 색으로만 표시된다", () => {
    const { container } = render(
      <NoteField
        {...baseProps}
        solidRings={[{ id: 1, lane: 0, color: "#fbbf24" }]}
      />
    );
    // 정지 링은 테두리 + 배경 두 겹으로, transform 없이 색만 쓴다
    const ring = container.querySelector('[style*="border-color"]') as HTMLElement | null;
    expect(ring).toBeTruthy();
    expect(ring?.style.borderColor).toBe("rgb(251, 191, 36)");
  });

  it("판정 팝업이 색과 라벨로 렌더된다", () => {
    const { getByText } = render(
      <NoteField {...baseProps} popups={[{ id: 1, judgment: "PERFECT", lane: 2 }]} />
    );
    expect(getByText("PERFECT")).toBeTruthy();
  });

  it("스파크는 CSS 변수로 이동 벡터를 전달한다", () => {
    const { container } = render(
      <NoteField
        {...baseProps}
        sparks={[{ id: 1, lane: 0, tx: "10px", ty: "-20px", color: "#fbbf24" }]}
      />
    );
    const spark = container.querySelector(".hit-spark") as HTMLElement | null;
    expect(spark).toBeTruthy();
    expect(spark?.style.getPropertyValue("--tx")).toBe("10px");
    expect(spark?.style.getPropertyValue("--ty")).toBe("-20px");
  });

  it("쇼크웨이브 링이 레인 색을 따른다", () => {
    const { container } = render(
      <NoteField {...baseProps} shockwaves={[{ id: 1, lane: 3 }]} />
    );
    const wave = container.querySelector('[style*="animation: shockwave"]') as HTMLElement;
    expect(wave.style.borderColor).toContain("251");
  });

  it("en 언어로도 예고 라벨이 번역된다", () => {
    const { getByText } = render(
      <NoteField
        {...baseProps}
        lang="en"
        telegraphs={[{ lane: 0, kind: "speedUp", urgency: 1 }]}
      />
    );
    expect(getByText("Rush note")).toBeTruthy();
  });

  it("색맹 모드 레인 팔레트도 정상 렌더된다", () => {
    const colorblindLanes = LANES.map((l, i) => ({
      ...l,
      color: ["#00e5ff", "#ffb020", "#b388ff", "#ff5c7a"][i],
    }));
    const { getByText } = render(
      <NoteField {...baseProps} lanes={colorblindLanes} notes={[note({ lane: 2 })]} />
    );
    expect(getByText("90°")).toBeTruthy();
  });
});

describe("NoteField stateOf", () => {
  it("노트 id 로 상태를 조회한다", () => {
    const stateOf = vi.fn(() => "miss" as const);
    render(<NoteField {...baseProps} notes={[note({ id: 7 })]} stateOf={stateOf} />);
    expect(stateOf).toHaveBeenCalledWith(7);
  });

  it("ACTIONS 매핑이 차수와 일치한다", () => {
    // lane index → action index 가 성립하는지 (상수 정합성 가드)
    for (let lane = 0; lane < 4; lane++) {
      expect(ACTIONS[lane]).toBe(LANES[lane].action);
    }
  });

  // --- P-04 / P-05 성능 계약 ------------------------------------------------
  // 이 두 테스트가 깨지면 성능 개편이 되돌아간 것이다.
  describe("P-04/P-05 위치 갱신 계약", () => {
    /** 라벨 텍스트를 담은 *가장 깊은* div = 노트 헤드 (바깥 래퍼는 제외) */
    const headOf = (root: HTMLElement, label: string) =>
      Array.from(root.querySelectorAll<HTMLElement>("div")).find(
        (el) => el.textContent === label && el.querySelector("div") === null
      )!;

    it("세로 위치는 top 이 아니라 transform 으로 표현된다 (P-04: 레이아웃 무효화 제거)", () => {
      const { container } = render(
        <NoteField {...baseProps} notes={[note({ id: 1, time: 10.4 })]} />
      );
      const head = headOf(container, LANES[0].label);
      expect(head.style.top).toBe("");
      expect(head.style.transform).toMatch(/^translate3d\(0,/);
    });

    it("시간이 흘러도 노트 DOM 은 재사용되고 transform 만 갱신된다 (P-05: 조정 제거)", () => {
      const notes = [note({ id: 1, time: 10.4 }), note({ id: 2, lane: 1, time: 10.6 })];
      const { container, rerender } = render(
        <NoteField {...baseProps} notes={notes} now={9.5} />
      );
      const head1 = headOf(container, LANES[0].label);
      const t1 = head1.style.transform;
      expect(t1).not.toBe("");

      rerender(<NoteField {...baseProps} notes={notes} now={9.9} />);

      const head1b = headOf(container, LANES[0].label);
      // 같은 DOM 노드가 재사용되어야 React 가 노트를 다시 조정하지 않은 것
      expect(head1b).toBe(head1);
      // 그리고 위치는 transform 으로 갱신되어야 한다
      expect(head1b.style.transform).not.toBe(t1);
      const px = (t: string) => {
        const m = t.match(/translate3d\(0,\s*(-?[\d.]+)px/);
        return m ? Number.parseFloat(m[1]) : NaN;
      };
      expect(px(head1b.style.transform)).toBeGreaterThan(px(t1));
    });

    it("노트가 화면에서 사라지면 핸들이 정리된다 (메모리 누수 가드)", () => {
      const notes = [note({ id: 1, time: 10.4 })];
      const { rerender, container } = render(
        <NoteField {...baseProps} notes={notes} now={9.5} />
      );
      expect(container.textContent).toContain(LANES[0].label);
      rerender(<NoteField {...baseProps} notes={[]} now={9.5} />);
      expect(container.textContent).not.toContain(LANES[0].label);
    });
  });
});
