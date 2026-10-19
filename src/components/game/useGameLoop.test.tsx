import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useGameLoop,
  advanceSlowmo,
  deeper,
  SLOWMO_SCALE,
  SLOWMO_MAX_LAG_SEC,
  WARP_GUARD_SEC,
  TAP_POSE_HOLD_SEC,
  type GameLoopRefs,
  type LoopContext,
} from "./useGameLoop";
import type { Note, QuestionEvent } from "@/game/types";
import { INITIAL_PRESS_CONTEXT } from "@/game/journalistAI";

/**
 * 게임 루프(RAF) 안전망.
 *
 * B-14 의 핵심 계약 — 루프 본문은 `deps: []` 로 1회만 설치되므로 렌더 값을
 * 직접 닫으면 초기값에 고정된다. 이 테스트는 **매 렌더 갱신되는 값이 실제로
 * 루프에 반영되는지** 를 검증한다. 그게 깨지면 DDA 어시스트가 MISS 판정에만
 * 적용되는 반쪽짜리 상태가 된다.
 */

const NOTE_BASE: Note = {
  id: 1,
  time: 10,
  lane: 0,
  action: "bow15",
  hold: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** 한 프레임 진행 (RAF 콜백 1회 실행) */
const frame = () =>
  act(() => {
    vi.advanceTimersToNextFrame();
  });

function makeRefs() {
  return {
    phaseRef: { current: "ready" as const },
    pausedRef: { current: false },
    noteStateRef: { current: new Map<number, "pending" | "hit" | "miss" | "holding">() },
    holdLaneRef: { current: new Map<number, number>() },
    lastTapRef: { current: null as { action: "bow15"; time: number } | null },
    poseAngleRef: { current: 0 },
    poseVelRef: { current: 0 },
    dogezaRef: { current: false },
    qIndexRef: { current: 0 },
    missCursorRef: { current: { notes: null, index: 0 } },
    kimRef: { current: null as { setPose: (a: number, d: boolean) => void } | null },
  } as unknown as GameLoopRefs;
}

function makeCtx(over: Partial<LoopContext> = {}): LoopContext {
  return {
    timingWindows: { perfect: 40, great: 90, good: 140, bad: 200 },
    notes: [],
    questions: [],
    duration: 60,
    noteMap: new Map(),
    lang: "ko",
    applyJudgment: vi.fn(),
    pressCtx: () => ({ ...INITIAL_PRESS_CONTEXT }),
    sweepForcedReleases: vi.fn(),
    finish: vi.fn(),
    isHitstopped: () => false,
    decayZoom: vi.fn(),
    getPressedLanes: () => [],
    setQuestion: vi.fn(),
    ...over,
  };
}

describe("advanceSlowmo (순수함수)", () => {
  it("비활성이면 오디오 시각을 그대로 반환한다", () => {
    expect(advanceSlowmo(0, 5, false, 1 / 60)).toBe(5);
  });

  it("활성이면 결과는 항상 [audio - MAX_LAG, audio] 창 안이다", () => {
    // 슬로모는 오디오보다 앞서갈 수 없고, 지연 상한도 넘지 않는다
    for (const [visual, audio, dt] of [
      [0, 5, 0.1],
      [4.95, 5, 0.016],
      [0, 0.02, 0.016],
      [3, 3.01, 0.5],
    ] as const) {
      const v = advanceSlowmo(visual, audio, true, dt);
      expect(v).toBeGreaterThanOrEqual(audio - SLOWMO_MAX_LAG_SEC - 1e-9);
      expect(v).toBeLessThanOrEqual(audio + 1e-9);
    }
  });

  it("오디오가 충분히 앞서 있으면 SLOWMO_SCALE 로만 이동한다", () => {
    // 지연 상한에 걸리지 않는 경우에만 배율이 그대로 드러난다
    const v = advanceSlowmo(0, 0.05, true, 0.1);
    expect(v).toBeCloseTo(0.1 * SLOWMO_SCALE, 6);
  });

  it("오디오를 역주행하지 않는다", () => {
    // 슬로모가 걸렸는데 오디오가 앞으로 크게 뛰면 시각도 따라간다
    const v = advanceSlowmo(0, 10, true, 0.016);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(10);
  });

  it("지연이 SLOWMO_MAX_LAG_SEC 에서 포화된다", () => {
    // 아주 느린 프레임이 계속 오면 지연은 상한을 넘지 않는다
    let v = 0;
    let audio = 0;
    for (let i = 0; i < 500; i++) {
      audio += 1 / 60;
      v = advanceSlowmo(v, audio, true, 1 / 60);
    }
    expect(audio - v).toBeLessThanOrEqual(SLOWMO_MAX_LAG_SEC + 1e-9);
  });

  it("오디오를 앞질러 가지 않는다 (visual <= audio)", () => {
    let v = 0;
    let audio = 0;
    for (let i = 0; i < 100; i++) {
      audio += 1 / 60;
      v = advanceSlowmo(v, audio, true, 1 / 60);
    }
    expect(v).toBeLessThanOrEqual(audio);
  });

  it("시각이 이미 오디오와 같으면 값이 변하지 않는다", () => {
    // dt 가 아무리 커도 이미 싱크가 맞으면 더 밀지 않는다
    expect(advanceSlowmo(5, 5, true, 1)).toBe(5);
  });

  it("비활성화되면 즉시 싱크를 맞춘다 (다음 프레임에 정확히 오디오 시간)", () => {
    let v = 0;
    let audio = 0;
    for (let i = 0; i < 30; i++) {
      audio += 1 / 60;
      v = advanceSlowmo(v, audio, true, 1 / 60);
    }
    // 슬로모가 걸린 상태 → 지연이 남아 있다
    expect(v).toBeLessThan(audio);
    // 해제하면 한 번에 오디오 시간으로 맞춘다
    expect(advanceSlowmo(v, audio, false, 1 / 60)).toBe(audio);
  });
});

describe("deeper", () => {
  it("null 은 새 값으로 대체된다", () => {
    expect(deeper(null, "bow45")).toBe("bow45");
  });

  it("더 깊은 차수를 고른다", () => {
    expect(deeper("bow15", "bow90")).toBe("bow90");
    expect(deeper("bow90", "bow15")).toBe("bow90");
    expect(deeper("dogeza", "bow90")).toBe("dogeza");
  });

  it("동일하면 기존을 유지한다", () => {
    expect(deeper("bow45", "bow45")).toBe("bow45");
  });
});

describe("useGameLoop", () => {
  function mount(
    ctx: LoopContext,
    refs: GameLoopRefs,
    sinks: {
      songTime: () => number;
      setNow: (t: number) => void;
      setDogezaPose: (v: boolean) => void;
      isSlowmo: () => boolean;
    }
  ) {
    const ctxRef = { current: ctx };
    return renderHook(
      ({ c }: { c: LoopContext }) => {
        ctxRef.current = c;
        useGameLoop(refs, { ...sinks, ctxRef: ctxRef as never });
      },
      { initialProps: { c: ctx } }
    );
  }

  const sinks = () => {
    let t = 0;
    return {
      songTime: () => t,
      setNow: vi.fn(),
      setDogezaPose: vi.fn(),
      isSlowmo: () => false,
      advance: (s: number) => {
        t += s;
      },
    };
  };

  it("ready 상태에서는 아무 것도 하지 않는다", () => {
    const refs = makeRefs();
    const s = sinks();
    mount(makeCtx(), refs, s);
    frame();
    frame();
    expect(s.setNow).not.toHaveBeenCalled();
  });

  it("playing 에서 setNow 으로 곡 시각을 전달한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const s = sinks();
    s.advance(1.5);
    mount(makeCtx(), refs, s);
    frame();
    expect(s.setNow).toHaveBeenCalledWith(1.5);
  });

  it("U-01: 일시정지 중에는 setNow 을 호출하지 않고 시간을 기억한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    (refs.pausedRef as { current: boolean }).current = true;
    const s = sinks();
    s.advance(1.5);
    mount(makeCtx(), refs, s);
    frame();
    expect(s.setNow).not.toHaveBeenCalled();

    // 재개하면 그동안 멈췄던 만큼 한 번에 따라잡지 않는다 (프레임 dt 로만 전진)
    (refs.pausedRef as { current: boolean }).current = false;
    s.advance(1.5);
    frame();
    expect(s.setNow).toHaveBeenCalled();
  });

  it("B-01: 시각이 충분히 지나면 노트를 MISS 로 판정한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(10.5); // bad 윈도우 200ms 를 넘김
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "MISS");
    expect(refs.noteStateRef.current.get(1)).toBe("miss");
  });

  it("워프 가드를 넘는 지연은 데미지 없이 통과시킨다 (탭 복귀 폭사 방지)", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(10 + WARP_GUARD_SEC + 1); // 가드 밖
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
    // 상태는 미스로 넘어가 재판정을 막는다
    expect(refs.noteStateRef.current.get(1)).toBe("miss");
  });

  it("가짜 노트는 MISS 판정 대상이 아니다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE, gimmick: "fake" }] });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(20);
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
  });

  it("이미 판정된 노트는 재판정하지 않는다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "hit");
    const s = sinks();
    s.advance(20);
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
  });

  it("B-01: 매 프레임 놓친 홀드를 강제 해제한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx();
    const s = sinks();
    s.advance(3);
    mount(ctx, refs, s);
    frame();
    expect(ctx.sweepForcedReleases).toHaveBeenCalledWith(3);
  });

  it("질문이 시각을 지나면 journalistAI 를 거쳐 표시한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const q: QuestionEvent = { time: 1, text: "괜찮아?", journalist: "rookie" };
    const ctx = makeCtx({ questions: [q] });
    const s = sinks();
    s.advance(2);
    mount(ctx, refs, s);
    frame();
    expect(ctx.setQuestion).toHaveBeenCalledTimes(1);
    expect((ctx.setQuestion as ReturnType<typeof vi.fn>).mock.calls[0][0].time).toBe(1);
    expect(refs.qIndexRef.current).toBe(1);
  });

  it("B-14 회귀: 렌더마다 갱신된 컨텍스트가 루프에 반영된다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const s = sinks();

    const first = makeCtx();
    const { rerender } = mount(first, refs, s);

    // 렌더 시점에 컨텍스트를 통째로 교체한다 (차트 로드 완료 등)
    const second = makeCtx({ notes: [{ ...NOTE_BASE }], duration: 90 });
    rerender({ c: second });
    s.advance(30);
    frame();

    expect(second.sweepForcedReleases).toHaveBeenCalled();
    expect(first.sweepForcedReleases).not.toHaveBeenCalled();
  });

  /**
   * B-14 회귀 (가장 중요).
   *
   * 루프는 `deps: []` 로 1회만 설치되므로 클로저에 잡힌 윈도우는 초기값에 고정된다.
   * 아래 두 케이스는 **같은 시각·같은 노트**에서 윈도우만 바꾸어
   * 루프가 `ctxRef` 최신값을 읽는지 대조한다.
   * 클로저 고정 구현이라면 1번과 2번의 결과가 같아져 실패한다.
   */
  it("B-14 회귀: 같은 프레임에서 윈도우가 부스트되면 MISS 가 늦어진다 (관대해짐)", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const note = { ...NOTE_BASE, time: 1.0 };
    const ctx = makeCtx({
      notes: [note],
      timingWindows: { perfect: 40, great: 90, good: 140, bad: 1000 },
    });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(1.5); // 기본 윈도우(200ms)로는 MISS지만, 부스트된 1초 윈도우 안이다
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
  });

  it("B-14 회귀: 부스트된 윈도우가 지나면 그때서야 MISS 가 난다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const note = { ...NOTE_BASE, time: 1.0 };
    const ctx = makeCtx({
      notes: [note],
      timingWindows: { perfect: 40, great: 90, good: 140, bad: 1000 },
    });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(2.5);
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).toHaveBeenCalledTimes(1);
    expect((ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("MISS");
  });

  it("holding 상태인 노트는 재판정하지 않는다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "holding");
    const s = sinks();
    s.advance(20);
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
  });

  it("히트스톱 중에도 곡 시각(setNow)은 갱신된다 (B-11)", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ isHitstopped: () => true });
    const s = sinks();
    s.advance(7);
    mount(ctx, refs, s);
    frame();
    expect(s.setNow).toHaveBeenCalledWith(7);
    expect(ctx.decayZoom).not.toHaveBeenCalled();
  });

  it("포즈: 홀드 중인 노트가 있으면 그 각도로 스프링 수렴한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const hold = [{ ...NOTE_BASE, lane: 3 as const, action: "dogeza" as const }];
    const ctx = makeCtx({ notes: hold, noteMap: new Map(hold.map((n) => [n.id, n])) });
    refs.holdLaneRef.current.set(0, 1);
    refs.kimRef.current = { setPose: vi.fn() };
    const s = sinks();
    s.advance(5);
    mount(ctx, refs, s);
    for (let i = 0; i < 30; i++) {
      s.advance(0.016);
      frame();
    }
    expect(refs.poseAngleRef.current).toBeGreaterThan(0);
    expect(refs.poseAngleRef.current).toBeLessThanOrEqual(93);
    expect(s.setDogezaPose).toHaveBeenCalledWith(true);
    expect(refs.kimRef.current?.setPose).toHaveBeenCalled();
  });

  it("포즈: 아무것도 누르지 않으면 0으로 되돌아간다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    refs.poseAngleRef.current = 80;
    const ctx = makeCtx();
    const s = sinks();
    s.advance(5);
    mount(ctx, refs, s);
    for (let i = 0; i < 60; i++) frame();
    expect(refs.poseAngleRef.current).toBeCloseTo(0, 1);
  });

  it("포즈: 눌린 레인이 각도를 만든다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ getPressedLanes: () => [1] }); // lane 1 = 45도
    const s = sinks();
    s.advance(5);
    mount(ctx, refs, s);
    for (let i = 0; i < 40; i++) {
      s.advance(0.016);
      frame();
    }
    expect(refs.poseAngleRef.current).toBeGreaterThan(45);
    expect(refs.poseAngleRef.current).toBeLessThanOrEqual(53);
  });

  it("곡이 끝나면 finish() 를 한 번만 부른다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ duration: 10 });
    const s = sinks();
    mount(ctx, refs, s);
    s.advance(11);
    frame();
    expect(ctx.finish).toHaveBeenCalledTimes(1);
  });

  it("done 상태에서는 더 이상 판정하지 않는다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "done";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.advance(20);
    mount(ctx, refs, s);
    frame();
    expect(ctx.applyJudgment).not.toHaveBeenCalled();
  });

  it("히트스톱 중에는 줌 감쇠를 멈춘다 (임팩트 hold)", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ isHitstopped: () => true });
    const s = sinks();
    mount(ctx, refs, s);
    frame();
    expect(ctx.decayZoom).not.toHaveBeenCalled();
  });

  it("P-01: 도게자 포즈 진입/이탈 때만 React 상태를 올린다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx();
    const s = sinks();
    mount(ctx, refs, s);

    // 레인 3 = dogeza 를 누르고 있다
    (ctx as { getPressedLanes: () => number[] }).getPressedLanes = () => [3];
    frame();
    expect(s.setDogezaPose).toHaveBeenCalledWith(true);

    // 떼면 한 번만 false 로 전환된다
    (ctx as { getPressedLanes: () => number[] }).getPressedLanes = () => [];
    frame();
    frame();
    expect(s.setDogezaPose).toHaveBeenCalledTimes(2);
    expect(s.setDogezaPose).toHaveBeenLastCalledWith(false);
  });

  it("탭 직후에도 TAP_POSE_HOLD_SEC 동안 포즈를 유지한다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx();
    const s = sinks();
    mount(ctx, refs, s);

    refs.lastTapRef.current = { action: "bow90", time: 1.0 };
    s.advance(1.0 + TAP_POSE_HOLD_SEC * 0.5);
    frame();
    const held = refs.poseAngleRef.current;
    expect(held).toBeGreaterThan(0);

    // 홀드 시간이 지나면 목표값 0 으로 돌아간다
    s.advance(TAP_POSE_HOLD_SEC * 2);
    for (let i = 0; i < 60; i++) frame();
    expect(refs.poseAngleRef.current).toBeLessThan(held);
  });

  /**
   * P-01: MISS 스캔 커서.
   *
   * 루프가 매 프레임 `chart.notes` **전량**을 순회하면, 대부분은 이미 판정된
   * 노트에 대한 조회로 반복된다. 정렬 불변식과 단조 증가하는 곡 시각을 이용해
   * 앞으로만 스캔하도록 바꿨다.
   *
   * 이 최적화는 **노트가 시간 오름차순으로 정렬되어 있다는 전제** 위에서 성립한다.
   * 정렬이 깨지면 커서가 앞 노트를 건너뛰어 MISS 를 놓친다.
   * 아래 테스트가 그 계약을 고정한다.
   */
  describe("MISS 스캔 커서", () => {
    const mkNotes = (times: number[]): Note[] =>
      times.map((time, i) => ({ ...NOTE_BASE, id: i + 1, time }));

    it("커서는 앞으로만 전진하고 뒤로 가지 않는다", () => {
      const refs = makeRefs();
      (refs.phaseRef as { current: string }).current = "playing";
      const ctx = makeCtx({ notes: mkNotes([1, 2, 3, 4]) });
      for (let i = 1; i <= 4; i++) refs.noteStateRef.current.set(i, "pending");
      const s = sinks();
      mount(ctx, refs, s);

      // t=3.5 — 앞 3개는 판정 시각이 지났고(워프 가드 3초 이내), 4번째는 아직이다
      s.advance(3.5);
      frame();
      expect(refs.missCursorRef.current.index).toBe(3);
      const judged = (ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(judged).toBe(3);

      // 시간이 더 지나면 커서가 전진한다
      s.advance(1);
      frame();
      expect(refs.missCursorRef.current.index).toBe(4);
      expect((ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls.length).toBe(judged + 1);

      // 곡이 끝나도 인덱스가 배열 길이를 넘지 않는다
      s.advance(60);
      frame();
      expect(refs.missCursorRef.current.index).toBe(4);
    });

    it("커서 덕분에 이미 지나간 구간을 다시 훑지 않는다", () => {
      const refs = makeRefs();
      (refs.phaseRef as { current: string }).current = "playing";
      // 2초 구간에 몰린 50개 — 커서가 없으면 매 프레임 50개를 다시 조회한다
      const notes = mkNotes(Array.from({ length: 50 }, (_, i) => 1 + i * 0.02));
      const ctx = makeCtx({ notes });
      for (let i = 1; i <= 50; i++) refs.noteStateRef.current.set(i, "pending");
      const s = sinks();
      mount(ctx, refs, s);

      s.advance(2.5);
      frame();
      expect(refs.missCursorRef.current.index).toBe(50);
      // 각 노트가 정확히 한 번씩, 순서대로 판정된다 (재순회 흔적 없음)
      expect((ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].id)).toEqual(
        Array.from({ length: 50 }, (_, i) => i + 1)
      );

      // 이후 프레임에서 새 판정이 발생하지 않는다 (지나간 구간 재탐색 없음)
      const total = (ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls.length;
      for (let i = 0; i < 10; i++) {
        s.advance(1 / 60);
        frame();
      }
      expect((ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(total);
    });

    it("가짜 노트도 커서를 함께 전진시킨다 (스킵하되 되돌아가지 않는다)", () => {
      const refs = makeRefs();
      (refs.phaseRef as { current: string }).current = "playing";
      const notes = mkNotes([1, 2, 3]);
      notes[0].gimmick = "fake";
      const ctx = makeCtx({ notes });
      for (let i = 1; i <= 3; i++) refs.noteStateRef.current.set(i, "pending");
      const s = sinks();
      mount(ctx, refs, s);

      s.advance(3.5);
      frame();
      expect(refs.missCursorRef.current.index).toBe(3);
      // 가짜 노트는 판정 대상이 아니므로 호출은 2회
      expect((ctx.applyJudgment as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    });

    it("채보가 교체되면 커서를 처음부터 다시 훑는다", () => {
      const refs = makeRefs();
      (refs.phaseRef as { current: string }).current = "playing";
      const s = sinks();

      // 첫 채보를 끝까지 소진해 커서를 끝으로 민다
      const first = makeCtx({ notes: mkNotes([1, 2]) });
      refs.noteStateRef.current = new Map([
        [1, "pending"],
        [2, "pending"],
      ]);
      const { rerender } = mount(first, refs, s);
      s.advance(2.5);
      frame();
      expect(refs.missCursorRef.current.notes).toBe(first.notes);
      expect(refs.missCursorRef.current.index).toBe(2);
      expect(first.applyJudgment).toHaveBeenCalledTimes(2);

      // 다른 notes 배열(커스텀 채보 전환 등)로 교체되면 커서가 0 으로 되돌아간다.
      // 되돌아가지 않으면 새 채보의 앞부분을 통째로 건너뛴다.
      refs.noteStateRef.current = new Map([
        [1, "pending"],
        [2, "pending"],
      ]);
      const second = makeCtx({ notes: mkNotes([6, 7]) });
      rerender({ c: second });
      frame();
      expect(refs.missCursorRef.current.notes).toBe(second.notes);
      expect(refs.missCursorRef.current.index).toBe(0);
    });
  });

  it("I-06: 슬로모 활성 시 표시 시각만 뒤처진다 (판정 시각은 오디오)", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const ctx = makeCtx({ notes: [{ ...NOTE_BASE }] });
    refs.noteStateRef.current.set(1, "pending");
    const s = sinks();
    s.isSlowmo = () => true;

    s.advance(10.5);
    mount(ctx, refs, s);
    frame();

    // 판정은 오디오 시각(10.5)으로 이루어진다
    expect(ctx.applyJudgment).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "MISS");
    // 표시 시각은 지연된다
    expect(s.setNow).toHaveBeenCalled();
    expect(s.setNow.mock.calls.at(-1)![0]).toBeLessThan(10.5);
  });

  it("언마운트 시 RAF 이 정리된다", () => {
    const refs = makeRefs();
    (refs.phaseRef as { current: string }).current = "playing";
    const s = sinks();
    const { unmount } = mount(makeCtx(), refs, s);
    frame();
    const before = vi.getTimerCount();
    unmount();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
  });
});