import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLaneInput, INPUT_GRACE_MS, type LaneInputHandlers } from "./useLaneInput";
import { DEFAULT_KEYS, type KeyMap } from "@/stores/settingsStore";

/**
 * 레인 입력 안전망.
 *
 * B-07(포인터 multitouch) · B-16(Escape 재개) · B-04(플레이 중 설정 차단과 같은
 * "클로저가 낡으면 안 된다" 계열) 를 검증한다. 키보드 리스너는 `keyMap` 을
 * dependency 로 잡으므로, `keyMap` 이 바뀌면 최신 핸들러로 갈아끼워야 한다.
 */

function makeHandlers(over: Partial<LaneInputHandlers> = {}): LaneInputHandlers {
  return {
    now: () => 1.5,
    isPlaying: () => true,
    canTogglePause: () => true,
    start: vi.fn(),
    press: vi.fn(),
    release: vi.fn(),
    togglePause: vi.fn(),
    quit: vi.fn(),
    isLaneHeld: () => false,
    recordTap: vi.fn(),
    ...over,
  };
}

/** 마운트 유예(500ms)를 넘긴 뒤 입력할 수 있게 만든다 */
const pastGrace = () =>
  act(() => {
    vi.setSystemTime(Date.now() + INPUT_GRACE_MS + 1);
  });

const key = (k: string, code?: string, extra: Partial<KeyboardEvent> = {}) =>
  new KeyboardEvent("keydown", { key: k, code: code ?? `Key${k.toUpperCase()}`, ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const KEY_MAP: KeyMap = DEFAULT_KEYS;

describe("입력 유예", () => {
  it("마운트 직후 INPUT_GRACE_MS 안의 입력은 무시된다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    act(() => {
      result.current.onPress(0);
      result.current.onPress(1);
    });
    expect(h.press).not.toHaveBeenCalled();
    expect(result.current.pressedLanes).toHaveLength(0);
  });

  it("유예가 지나면 입력이 동작한다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => result.current.onPress(0));
    expect(h.press).toHaveBeenCalledWith(0, 1.5);
  });
});

describe("대기 상태 시작", () => {
  it("플레이 중이 아니면 start() 로 시작한다", () => {
    const h = makeHandlers({ isPlaying: () => false });
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => result.current.onPress(2));
    expect(h.start).toHaveBeenCalledTimes(1);
    // 시작 트리거는 판정을 울리지 않는다
    expect(h.press).not.toHaveBeenCalled();
  });
});

describe("레인 상태와 판정", () => {
  it("플레이 중에는 탭 판정을 현재 곡 시각으로 호출한다", () => {
    const h = makeHandlers({ isLaneHeld: vi.fn(() => false) });
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();

    act(() => result.current.onPress(2, 7));

    expect(h.press).toHaveBeenCalledWith(2, 1.5);
    expect(h.recordTap).toHaveBeenCalledWith("bow90", 1.5);
    expect(h.isLaneHeld).toHaveBeenCalledWith(2);
  });

  it("pointerId 없이 release 하면 해당 레인의 모든 포인터를 정리한다 (키보드 경로)", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();

    act(() => result.current.onPress(1, 11));
    act(() => result.current.onPress(1, 22));
    act(() => result.current.onRelease(1));

    expect(result.current.pressedLanes).toEqual([]);
    expect(h.release).toHaveBeenCalledWith(1, 1.5);
  });

  it("재생 중이 아니면 release 로 판정을 만들지 않는다 (단 레인 표시는 해제)", () => {
    let playing = true;
    const h = makeHandlers({ isPlaying: () => playing });
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();

    act(() => result.current.onPress(0, 1));
    playing = false; // 일시정지 등으로 재생이 멈춘 상태
    act(() => result.current.onRelease(0, 1));

    expect(h.release).not.toHaveBeenCalled();
    expect(result.current.pressedLanes).toEqual([]);
  });

  it("getPressedLanes 는 RAF hot path 용으로 ref 값 그대로 읽는다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();

    act(() => result.current.onPress(1, 1));
    act(() => result.current.onPress(3, 2));

    expect(result.current.getPressedLanes().sort()).toEqual([1, 3]);
  });

  it("clearPressed 는 레인 상태만 비우고 판정은 발생시키지 않는다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();

    act(() => result.current.onPress(0, 1));
    act(() => result.current.clearPressed());

    expect(result.current.pressedLanes).toEqual([]);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.press).toHaveBeenCalledTimes(1);
  });
});

describe("B-07 포인터 multitouch", () => {
  it("같은 레인에 손가락 2개 — 하나를 떼도 레인은 눌려 있다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));

    pastGrace();
    act(() => {
      result.current.onPress(1, 100);
      result.current.onPress(1, 101);
    });
    expect(result.current.pressedLanes).toEqual([1]);

    // 한 손가락만 뗀다 — 다른 손가락이 아직 잡고 있다
    act(() => result.current.onRelease(1, 100));
    expect(result.current.pressedLanes).toEqual([1]);

    // 마지막 손가락이 떨어지면 해제된다
    act(() => result.current.onRelease(1, 101));
    expect(result.current.pressedLanes).toEqual([]);
  });

  it("서로 다른 레인을 동시에 누른다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      result.current.onPress(0, 1);
      result.current.onPress(2, 2);
      result.current.onPress(3, 3);
    });
    expect(result.current.getPressedLanes().sort()).toEqual([0, 2, 3]);

    act(() => result.current.onRelease(2, 2));
    expect(result.current.getPressedLanes().sort()).toEqual([0, 3]);
  });

  it("포인터 ID 없이 누르면 키보드 슬롯(-1) 을 쓴다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => result.current.onPress(0));
    act(() => result.current.onPress(0));
    // 키보드 슬롯은 하나뿐이라 중복으로 쌓이지 않는다
    expect(result.current.pressedLanes).toEqual([0]);
    act(() => result.current.onRelease(0));
    expect(result.current.pressedLanes).toEqual([]);
  });

  it("포인터 ID 로 해제하면 같은 레인의 다른 포인터는 남는다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      result.current.onPress(3, 7);
      result.current.onPress(3, 8);
    });
    act(() => result.current.onRelease(3, 7));
    expect(result.current.pressedLanes).toEqual([3]);
  });
});

describe("홀드 중복 입력 차단", () => {
  it("레인이 이미 홀드 중이면 press 를 다시 부르지 않는다 (recordTap 은 유지)", () => {
    const h = makeHandlers({ isLaneHeld: () => true });
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => result.current.onPress(1));
    expect(h.recordTap).toHaveBeenCalled();
    expect(h.press).not.toHaveBeenCalled();
  });
});

describe("clearPressed", () => {
  it("일시정지 전환 시 레인 상태를 비운다", () => {
    const h = makeHandlers();
    const { result } = renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      result.current.onPress(0, 1);
      result.current.onPress(1, 2);
    });
    expect(result.current.pressedLanes).toHaveLength(2);
    act(() => result.current.clearPressed());
    expect(result.current.pressedLanes).toHaveLength(0);
    expect(result.current.getPressedLanes()).toHaveLength(0);
  });
});

describe("B-16 Escape", () => {
  const escape = () =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    });

  it("일시정지 가능한 상태에서 Escape 는 togglePause 를 부른다 (종료 아님)", () => {
    const h = makeHandlers({ canTogglePause: () => true });
    renderHook(() => useLaneInput(KEY_MAP, h));
    escape();
    expect(h.togglePause).toHaveBeenCalledTimes(1);
    expect(h.quit).not.toHaveBeenCalled();
  });

  it("일시정지 불가(대기) 상태에서 Escape 는 quit 을 부른다", () => {
    const h = makeHandlers({ canTogglePause: () => false });
    renderHook(() => useLaneInput(KEY_MAP, h));
    escape();
    expect(h.quit).toHaveBeenCalledTimes(1);
    expect(h.togglePause).not.toHaveBeenCalled();
  });

  it("B-16 회귀: isPlaying 이 false 여도 canTogglePause 가 true 면 재개다", () => {
    // 일시정지 중 = isPlaying false 이지만 Escape 는 quit 이 아니다
    const h = makeHandlers({ isPlaying: () => false, canTogglePause: () => true });
    renderHook(() => useLaneInput(KEY_MAP, h));
    escape();
    expect(h.togglePause).toHaveBeenCalledTimes(1);
    expect(h.quit).not.toHaveBeenCalled();
  });
});

describe("B-04 최신 핸들러 디스패치", () => {
  it("keyMap 이 바뀌면 최신 핸들러로 디스패치한다", () => {
    const first = makeHandlers();
    const second = makeHandlers();
    const { result, rerender } = renderHook(
      ({ map, h }) => useLaneInput(map, h),
      { initialProps: { map: KEY_MAP, h: first } }
    );

    pastGrace();
    rerender({ map: KEY_MAP, h: second });

    act(() => {
      window.dispatchEvent(key("a"));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
    });

    expect(second.press).toHaveBeenCalled();
    expect(first.press).not.toHaveBeenCalled();
    void result;
  });

  it("매핑에 없는 키는 아무 것도 하지 않는다", () => {
    const h = makeHandlers();
    renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      window.dispatchEvent(key("Q"));
    });
    expect(h.press).not.toHaveBeenCalled();
  });

  it("키 반복(e.repeat) 은 재입력으로 취급하지 않는다", () => {
    const h = makeHandlers();
    renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      window.dispatchEvent(key("a", "KeyA", { repeat: true }));
    });
    expect(h.press).not.toHaveBeenCalled();
  });

  it("한 레인의 키를 누르고 떼면 press/release 가 한 쌍이다", () => {
    const h = makeHandlers();
    renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      window.dispatchEvent(key("a"));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
    });
    expect(h.press).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it("IME 조합 중에도 e.code 로 폴백한다", () => {
    const h = makeHandlers();
    renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    // 조합 중이라 key 가 음절/한글이지만 code 는 동일
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: String.fromCharCode(0xac00), code: "KeyA" }));
    });
    expect(h.press).toHaveBeenCalledTimes(1);
  });

  it("대기 상태에서 키를 떼면 release 를 부르지 않는다", () => {
    const h = makeHandlers({ isPlaying: () => false });
    renderHook(() => useLaneInput(KEY_MAP, h));
    pastGrace();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
    });
    expect(h.release).not.toHaveBeenCalled();
  });
});

describe("언마운트", () => {
  it("키보드 리스너를 제거한다", () => {
    const h = makeHandlers();
    const { unmount } = renderHook(() => useLaneInput(KEY_MAP, h));
    unmount();
    act(() => {
      window.dispatchEvent(key("a"));
    });
    expect(h.press).not.toHaveBeenCalled();
  });
});