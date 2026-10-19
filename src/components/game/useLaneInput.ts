import { useCallback, useEffect, useRef, useState } from "react";
import { LANES, laneFromKeyboardEvent } from "@/game/constants";
import type { ApologyAction } from "@/game/types";
import type { KeyMap } from "@/stores/settingsStore";

/** 마운트 직후 0.5초간의 입력을 무시한다 (의도치 않은 자동 시작 차단) */
export const INPUT_GRACE_MS = 500;

export interface LaneInputHandlers {
  /** 현재 곡 시각(초) 조회 */
  now: () => number;
  /** 플레이 가능 상태인가 (false 면 대기 화면) */
  isPlaying: () => boolean;
  /**
   * 일시정지 토글이 가능한 상태인가.
   *
   * `isPlaying` 과 **반드시 구분**해야 한다. 일시정지 중에는 `isPlaying` 이 false 다.
   * 구분하지 않으면 Escape 가 재개 대신 종료를 호출한다.
   */
  canTogglePause: () => boolean;
  /** 대기 상태에서 시작을 트리거 */
  start: () => void;
  press: (lane: number, time: number) => void;
  release: (lane: number, time: number) => void;
  togglePause: () => void;
  quit: () => void;
  /** 레인이 이미 홀드 중인지 (중복 입력 차단) */
  isLaneHeld: (lane: number) => boolean;
  /** 마지막 탭의 (각도, 시각) 기록 — 포즈 스프링이 읽는다 */
  recordTap: (action: ApologyAction, time: number) => void;
}

export interface LaneInput {
  /** 화면에 표시할 눌린 레인 목록 (중복 제거) */
  pressedLanes: number[];
  /** LaneKeys 에 전달할 핸들러 (포인터 ID 포함) */
  onPress: (lane: number, pointerId?: number) => void;
  onRelease: (lane: number, pointerId?: number) => void;
  /** 레인 상태를 즉시 비운다 (일시정지 전환 시) */
  clearPressed: () => void;
  /** RAF hot path 에서 현재 눌린 레인들을 읽는다 (포즈 스프링용) */
  getPressedLanes: () => number[];
}

/** B-07: pointerId → lane 맵에서 중복을 제거한 레인 목록 */
function uniqueLanes(m: Map<number, number>): number[] {
  return Array.from(new Set(m.values()));
}

/**
 * 레인 입력(키보드 + 포인터) 전용 훅.
 *
 * Q-05: GameScreen 에서 입력 계층을 분리한다.
 *
 * - B-07: 포인터 ID 로 레인 상태를 추적 (같은 레인에 손가락 2개가 닿아도 안전)
 * - B-04/B-15: `keyMap` 에서만 갱신되는 리스너가 낡은 클로저를 잡지 않도록,
 *   항상 최신 핸들러를 담은 ref 를 통해 디스패치한다
 * - IME: 한글 조합 중 `e.key` 가 음절일 수 있어 `e.code` 폴백은 `laneFromKeyboardEvent` 가 담당
 */
export function useLaneInput(keyMap: KeyMap, handlers: LaneInputHandlers): LaneInput {
  const [pressedLanes, setPressedLanes] = useState<number[]>([]);
  const activePressLanesRef = useRef<Map<number, number>>(new Map());
  const mountTimeRef = useRef(Date.now());
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const syncPressed = useCallback(() => {
    setPressedLanes(uniqueLanes(activePressLanesRef.current));
  }, []);

  const clearPressed = useCallback(() => {
    activePressLanesRef.current.clear();
    setPressedLanes([]);
  }, []);

  // RAF 루프는 state 를 읽지 않고 ref 를 읽는다 (리렌더 없이 최신값)
  const getPressedLanes = useCallback(
    () => Array.from(new Set(activePressLanesRef.current.values())),
    []
  );

  const onPress = useCallback(
    (lane: number, pointerId?: number) => {
      const h = handlersRef.current;
      if (Date.now() - mountTimeRef.current < INPUT_GRACE_MS) return;
      if (!h.isPlaying()) {
        h.start();
        return;
      }

      // B-07: 레인이 아니라 pointerId 를 키로 삼는다.
      if (pointerId !== undefined) activePressLanesRef.current.set(pointerId, lane);
      else activePressLanesRef.current.set(-1, lane);
      syncPressed();

      const t = h.now();
      const laneConfig = LANES[lane];
      if (laneConfig) h.recordTap(laneConfig.action, t);
      if (h.isLaneHeld(lane)) return;
      h.press(lane, t);
    },
    [syncPressed]
  );

  const onRelease = useCallback(
    (lane: number, pointerId?: number) => {
      if (pointerId !== undefined) {
        activePressLanesRef.current.delete(pointerId);
      } else {
        for (const [pid, l] of activePressLanesRef.current) {
          if (l === lane) activePressLanesRef.current.delete(pid);
        }
      }
      syncPressed();
      const h = handlersRef.current;
      if (!h.isPlaying()) return;
      h.release(lane, h.now());
    },
    [syncPressed]
  );

  // 키보드: Escape + 커스텀 키맵
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const h = handlersRef.current;
        // B-16: 일시정지 중에도 Escape 는 **재개**여야 한다.
        // `isPlaying` 은 일시정지 중 false 이므로 판정에 쓰면 종료가 되어 버린다.
        if (h.canTogglePause()) h.togglePause();
        else h.quit();
        return;
      }
      const lane = laneFromKeyboardEvent(e, keyMap);
      if (lane === undefined) return;
      e.preventDefault();
      if (e.repeat) return;
      onPress(lane);
    };
    const up = (e: KeyboardEvent) => {
      const lane = laneFromKeyboardEvent(e, keyMap);
      if (lane === undefined) return;
      onRelease(lane);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [keyMap, onPress, onRelease]);

  return { pressedLanes, onPress, onRelease, clearPressed, getPressedLanes };
}
