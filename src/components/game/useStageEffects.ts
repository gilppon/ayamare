import { useCallback, useRef, useState } from "react";
import { JUDGMENTS, randomSns } from "@/game/constants";
import type { FeedbackPlan } from "@/game/feedback";
import type { Judgment, SnsItem } from "@/game/types";
import type { Lang } from "@/i18n/ui";
import type { Popup, Shockwave, Spark } from "@/components/game/NoteField";

/** 동시 표시 상한 — 고밀도 구간 DOM 폭증 방지 */
export const CAP_POPUPS = 24;
export const CAP_FRAMES = 12;
export const CAP_SPARKS = 60;
export const CAP_SHOCKWAVES = 5;

/** 연출 수명 (ms) */
export const TTL_POPUP = 720;
export const TTL_FRAME = 320;
export const TTL_SPARK = 450;
export const TTL_SHOCKWAVE = 450;
export const TTL_REACTION = 1700;
/** I-07: 정지 링 수명 (모션 없이 페이드만) */
export const TTL_SOLID_RING = 380;
export const CAP_SOLID_RINGS = 8;

export interface Flash {
  id: number;
  x: number;
  y: number;
}

/** I-07: 정지 링 — 위치 변화 없이 색/투명도만 바뀌는 대체 피드백 */
export interface SolidRing {
  id: number;
  lane: number;
  color: string;
}

export interface Reaction {
  id: number;
  text: string;
  tone: "bad" | "good";
}

export interface StageEffects {
  popups: Popup[];
  flashes: Flash[];
  sparks: Spark[];
  shockwaves: Shockwave[];
  solidRings: SolidRing[];
  reaction: Reaction | null;
  sns: SnsItem[];
  slowmo: { id: number; label: string } | null;
  zoomPunch: number;
  /** U-04: 스크린리더용 마지막 판정 announce */
  liveJudgment: string;

  /** I-07: 판정 → 피드백 계획을 그대로 실행하는 단일 진입점 */
  applyPlan: (plan: FeedbackPlan, lane: number, laneName: string, judgment: Judgment) => void;
  addPopup: (judgment: Judgment, lane: number, laneName: string) => void;
  addFlashes: (count: number) => void;
  addSparks: (lane: number, count: number, color: string) => void;
  addShockwave: (lane: number) => void;
  addSolidRing: (lane: number, color: string) => void;
  setReactionLine: (text: string, tone: "bad" | "good") => void;
  pushSns: (tone: SnsItem["tone"], lang: Lang) => void;
  triggerSlowmo: (label: string, ms?: number) => void;
  triggerZoom: (strength: number) => void;
  /** 타격 임팩트 hold — 감쇠를 멈춰 피크에 고정한다 */
  isHitstopped: () => boolean;
  triggerHitstop: (ms: number) => void;
  decayZoom: () => void;
  clearTransient: () => void;
}

/**
 * 연출(스테이지 이펙트) 전용 훅.
 *
 * Q-05: GameScreen 에서 일시적 시각 상태와 그 헬퍼를 분리한다.
 * 게임 상태(점수/분노/주가)와 무관하므로 단위 경계가 명확하고,
 * 상한·수명 같은 튜닝 값도 한곳에 모인다.
 *
 * `reduceMotion` 이 켜져 있으면 시각 이펙트는 전부 무음 처리된다.
 */
export function useStageEffects(reduceMotion: boolean): StageEffects {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [shockwaves, setShockwaves] = useState<Shockwave[]>([]);
  const [solidRings, setSolidRings] = useState<SolidRing[]>([]);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [sns, setSns] = useState<SnsItem[]>([]);
  const [slowmo, setSlowmo] = useState<{ id: number; label: string } | null>(null);
  const [zoomPunch, setZoomPunch] = useState(0);
  const [liveJudgment, setLiveJudgment] = useState("");

  const popupIdRef = useRef(0);
  const flashIdRef = useRef(0);
  const sparkIdRef = useRef(0);
  const shockIdRef = useRef(0);
  const ringIdRef = useRef(0);
  const slowmoIdRef = useRef(0);
  const reactionIdRef = useRef(0);
  const hitstopRef = useRef(0);

  const addPopup = useCallback((judgment: Judgment, lane: number, laneName: string) => {
    const id = popupIdRef.current++;
    setPopups((p) => [...p, { id, judgment, lane }].slice(-CAP_POPUPS));
    // U-04: 시각 팝업과 별개로 스크린리더용 문자열 갱신
    setLiveJudgment(`${JUDGMENTS[judgment].label} ${laneName}`);
    window.setTimeout(
      () => setPopups((p) => p.filter((x) => x.id !== id)),
      TTL_POPUP
    );
  }, []);

  const addFlashes = useCallback((count: number) => {
    if (reduceMotion) return;
    const batch: Flash[] = [];
    for (let i = 0; i < count; i++) {
      batch.push({
        id: flashIdRef.current++,
        x: 12 + Math.random() * 76,
        y: 10 + Math.random() * 70,
      });
    }
    const ids = new Set(batch.map((f) => f.id));
    // 이전 구현은 `slice(-12)` 로 자른 뒤 개수를 더해 상한이 잠시 18까지 찼다.
    setFlashes((f) => [...f, ...batch].slice(-CAP_FRAMES));
    window.setTimeout(
      () => setFlashes((f) => f.filter((x) => !ids.has(x.id))),
      TTL_FRAME
    );
  }, [reduceMotion]);

  const addSparks = useCallback((lane: number, count: number, color: string) => {
    if (reduceMotion) return;
    const batch: Spark[] = [];
    for (let i = 0; i < count; i++) {
      batch.push({
        id: sparkIdRef.current++,
        lane,
        tx: (Math.random() - 0.5) * 120 + "px",
        ty: (Math.random() - 0.5) * 120 + "px",
        color,
      });
    }
    const ids = new Set(batch.map((s) => s.id));
    setSparks((s) => [...s, ...batch].slice(-CAP_SPARKS));
    window.setTimeout(
      () => setSparks((s) => s.filter((x) => !ids.has(x.id))),
      TTL_SPARK
    );
  }, [reduceMotion]);

  const addShockwave = useCallback(
    (lane: number) => {
      if (reduceMotion) return;
      const id = shockIdRef.current++;
      setShockwaves((s) => [...s, { id, lane }].slice(-CAP_SHOCKWAVES));
      window.setTimeout(
        () => setShockwaves((s) => s.filter((x) => x.id !== id)),
        TTL_SHOCKWAVE
      );
    },
    [reduceMotion]
  );

  /**
   * I-07: 정지 링 — 위치가 변하지 않고 색·투명도만 바뀌는 대체 피드백.
   * 모션 감소 모드에서 파티클/셰이크/줌을 걷어냈을 때 "무언가 일어났다" 는
   * 신호를 남겨 정보 전달을 보존한다.
   */
  const addSolidRing = useCallback((lane: number, color: string) => {
    const id = ringIdRef.current++;
    setSolidRings((r) => [...r, { id, lane, color }].slice(-CAP_SOLID_RINGS));
    window.setTimeout(
      () => setSolidRings((r) => r.filter((x) => x.id !== id)),
      TTL_SOLID_RING
    );
  }, []);

  const setReactionLine = useCallback((text: string, tone: "bad" | "good") => {
    const id = reactionIdRef.current++;
    setReaction({ id, text, tone });
    window.setTimeout(
      () => setReaction((r) => (r && r.id === id ? null : r)),
      TTL_REACTION
    );
  }, []);

  const pushSns = useCallback((tone: SnsItem["tone"], lang: Lang) => {
    setSns((s) => [randomSns(tone, lang), ...s].slice(0, 5));
  }, []);

  const triggerSlowmo = useCallback(
    (label: string, ms = 600) => {
      if (reduceMotion) return;
      const id = slowmoIdRef.current++;
      setSlowmo({ id, label });
      window.setTimeout(() => {
        setSlowmo((s) => (s && s.id === id ? null : s));
      }, ms);
    },
    [reduceMotion]
  );

  const triggerZoom = useCallback(
    (strength: number) => {
      if (reduceMotion) return;
      setZoomPunch((z) => Math.min(1.5, z + strength));
    },
    [reduceMotion]
  );

  const triggerHitstop = useCallback(
    (ms: number) => {
      if (reduceMotion) return;
      hitstopRef.current = performance.now() + ms;
    },
    [reduceMotion]
  );

  const isHitstopped = useCallback(() => performance.now() < hitstopRef.current, []);

  const decayZoom = useCallback(() => {
    setZoomPunch((z) => (z > 0.01 ? z * 0.88 : 0));
  }, []);

  const clearTransient = useCallback(() => {
    setPopups([]);
    setFlashes([]);
    setSparks([]);
    setShockwaves([]);
    setSolidRings([]);
    setReaction(null);
    setSns([]);
    setSlowmo(null);
    setZoomPunch(0);
    hitstopRef.current = 0;
  }, []);

  /**
   * I-07: 판정 피드백의 단일 진입점.
   * 어느 채널을 켤지(플래시/스파크/링/셰이크/줌/히트스톱)를 `planFeedback` 이
   * 이미 결정했으므로 여기서는 실행만 한다. 판정별 분기가 사라져 규칙이 한 곳에 있다.
   */
  const applyPlan = useCallback(
    (plan: FeedbackPlan, lane: number, laneName: string, judgment: Judgment) => {
      if (plan.popup) addPopup(judgment, lane, laneName);
      if (plan.flashes > 0) addFlashes(plan.flashes);
      if (plan.sparks > 0) addSparks(lane, plan.sparks, plan.color);
      if (plan.shockwave) addShockwave(lane);
      if (plan.solidRing) addSolidRing(lane, plan.color);
      if (plan.zoom > 0) triggerZoom(plan.zoom);
      if (plan.hitstopMs > 0) triggerHitstop(plan.hitstopMs);
    },
    [addPopup, addFlashes, addSparks, addShockwave, addSolidRing, triggerZoom, triggerHitstop]
  );

  return {
    popups,
    flashes,
    sparks,
    shockwaves,
    solidRings,
    reaction,
    sns,
    slowmo,
    zoomPunch,
    liveJudgment,
    applyPlan,
    addPopup,
    addFlashes,
    addSparks,
    addShockwave,
    addSolidRing,
    setReactionLine,
    pushSns,
    triggerSlowmo,
    triggerZoom,
    isHitstopped,
    triggerHitstop,
    decayZoom,
    clearTransient,
  };
}
