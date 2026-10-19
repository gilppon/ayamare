import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine, offsetForStage, trackForStage } from "@/game/audio";
import { ensureVoiceBank } from "@/game/voiceBank";
import { buildChart } from "@/game/chart";
import {
  ACTION_BY_LANE,
  ANGER_DELTA,
  INITIAL_ANGER,
  INITIAL_STOCK,
  JUDGMENTS,
  LANES,
  LANE_NAMES,
  STOCK_DELTA,
  comboToTier,
  computeEnding,
  computeGrade,
  goodLines,
  missLines,
  themeForStage,
} from "@/game/constants";
import {
  INITIAL_PRESS_CONTEXT,
  praiseForHit,
  tauntForMiss,
  type PressContext,
} from "@/game/journalistAI";
import { ddaTimingScale, initialDda, updateDda } from "@/game/dda";
import { timingStats, withReliability } from "@/game/timing";
import { planFeedback } from "@/game/feedback";
import {
  calculateAccuracy,
  comboMultiplier,
  getTimingWindows,
  judgeRelease,
  judgeTap,
} from "@/game/judgment";
import { hapticFor } from "@/game/haptics";
import { DOGEZA_LINE, nextApologyLine, speakApology, stopVoice } from "@/game/voice";
import { tr } from "@/i18n/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMetaStore } from "@/stores/metaStore";
import {
  activeSkills,
  comboGain,
  earnPoints,
  effectiveTimingScale,
  initialAngerBonus,
  initialStockMultiplier,
  scaleAngerDelta,
  scaleStockMultiplier,
  shouldProtectCombo,
  upgradeReleaseJudgment,
  upgradeTapJudgment,
} from "@/game/skills";
import { DAILY_POINTS_MULT } from "@/game/daily";
import type {
  ApologyAction,
  Chart,
  GameResult,
  Judgment,
  JudgmentCounts,
  Note,
  QuestionEvent,
  SkillType,
  SnsItem,
} from "@/game/types";
import Journalist from "./Journalist";
import NoteField from "./game/NoteField";
import type { TelegraphItem } from "./game/NoteField";
import { useLaneInput } from "./game/useLaneInput";
import { useGameLoop, type LoopContext } from "./game/useGameLoop";
import { useStageEffects } from "./game/useStageEffects";
import {
  CameraFlashes,
  LaneKeys,
  ReactionLine,
  ReporterSlot,
  SidePanels,
  TopHud,
} from "./game/GameHud";
import {
  CountdownOverlay,
  DoneOverlay,
  LiveJudgment,
  PauseOverlay,
  ReadyOverlay,
} from "./game/Overlays";
import PlayerCharacter from "./PlayerCharacter";
import type { ManagerKimHandle } from "./ManagerKim";
import { telegraphsFor } from "@/game/noteLayout";
import {
  SPAWN_AHEAD,
  isNoteVisible,
  selectPressTarget,
  visibleNoteWindow,
} from "@/game/visibility";



function pickLine(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function emptyCounts(): JudgmentCounts {
  return { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
}

interface GameScreenProps {
  stageId: string;
  equippedSkill: SkillType;
  chartOverride?: Chart;
  onFinish: (result: GameResult) => void;
  onQuit: () => void;
  /** U-01: 실제 플레이 중(ready/paused 아님)인지 상위에게 통지 — 설정 패널 잠금용 */
  onRunActiveChange?: (active: boolean) => void;
}

export default function GameScreen({
  stageId,
  equippedSkill,
  chartOverride,
  onFinish,
  onQuit,
  onRunActiveChange,
}: GameScreenProps) {
  const timingScale = useSettingsStore((s) => s.timingScale);
  const audioOffsetMs = useSettingsStore((s) => s.audioOffsetMs);
  const keyMap = useSettingsStore((s) => s.keyMap);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const colorblind = useSettingsStore((s) => s.colorblind);
  const lang = useSettingsStore((s) => s.lang);
  const chart = useMemo(() => chartOverride ?? buildChart(stageId, lang), [chartOverride, stageId, lang]);
  const ownedSkills = useMetaStore((s) => s.ownedSkills);
  const skills = useMemo(
    () => activeSkills(ownedSkills, equippedSkill),
    [ownedSkills, equippedSkill]
  );
  const [dda, setDda] = useState(initialDda);
  const ddaRef = useRef(dda);
  const pressRef = useRef<PressContext>({ ...INITIAL_PRESS_CONTEXT });
  // DDA 윈도우 부스트를 반영한다. `dda` state 는 `ddaRef` 와 lock-step 으로 갱신되므로
  // 렌더 시점 값이 곧 최신 값이다 (ref 를 직접 읽으면 deps 추적이 불가능해진다).
  const timingWindows = useMemo(
    () => getTimingWindows(ddaTimingScale(effectiveTimingScale(timingScale, skills), dda)),
    [timingScale, skills, dda]
  );
  const startAnger = useMemo(
    () => Math.max(0, INITIAL_ANGER + initialAngerBonus(skills)),
    [skills]
  );
  const startStock = useMemo(
    () => INITIAL_STOCK * initialStockMultiplier(skills),
    [skills]
  );
  const noteMap = useMemo(
    () => new Map(chart.notes.map((n) => [n.id, n])),
    [chart]
  );

  // ── mutable refs
  const audioRef = useRef<AudioEngine | null>(null);
  const startTimeRef = useRef(0);
  const phaseRef = useRef<"ready" | "playing" | "done">("ready");
  const noteStateRef = useRef<Map<number, "pending" | "hit" | "miss" | "holding">>(
    new Map(chart.notes.map((n) => [n.id, "pending"]))
  );
  const holdLaneRef = useRef<Map<number, number>>(new Map());
  const holdPressRef = useRef<Map<number, number>>(new Map());
  // B-01: 홀드 노트 강제 해제 기한(song time). lane -> noteId 맵 대신
  // noteId -> deadline 을 따로 들고 있어 lane 정리를 역추적 없이 수행한다.
  const holdDeadlineRef = useRef<Map<number, number>>(new Map());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const dogezaHitsRef = useRef(0);
  const angerRef = useRef(startAnger);
  const stockRef = useRef(startStock);
  const countsRef = useRef<JudgmentCounts>(emptyCounts());
  // B-08: 릴리즈 판정은 탭 판정과 분리 집계 (정확도 분모 불변 유지)
  const releaseCountsRef = useRef<JudgmentCounts>(emptyCounts());
  const forcedReleaseRef = useRef(0);
  const qIndexRef = useRef(0);
  /** A: 탭 판정 오차(ms). 양수 = 늦게 침. 결과 화면의 타이밍 히스토그램 원본 */
  const timingErrorsRef = useRef<number[]>([]);
  /** P-01: MISS 판정 커서 (정렬된 노트 배열에서 앞으로만 스캔) */
  const missCursorRef = useRef<{ notes: Note[] | null; index: number }>({ notes: null, index: 0 });
  const finishedRef = useRef(false);
  /** B-06: 언마운트/비동기 대기의 취소를 감지하기 위한 플래그 */
  const unmountedRef = useRef(false);
  const lastTapRef = useRef<{ action: ApologyAction; time: number } | null>(null);
  const poseAngleRef = useRef(0);
  const dogezaRef = useRef(false);
  /** P-01: 렌더에 실제로 쓰이는 도게자 상태 (_ref 는 RAF hot path 비교용) */
  const [dogezaPose, setDogezaPose] = useState(false);
  /** U-01: 일시정지 상태 (RAF hot path 에서 직접 읽음) */
  const pausedRef = useRef(false);
  /** 일시정지 전환 시 레인 상태를 비우는 동작 (useLaneInput 결과로 채워진다) */
  const clearPressedRef = useRef<() => void>(() => {});
  /** B-14: RAF 루프(1회 설치)가 읽을 가변 컨텍스트 (초깃값 — 아래 effect 가 매 렌더 갱신) */
  const loopCtxRef = useRef<LoopContext>({
    timingWindows: getTimingWindows(),
    notes: chart.notes,
    questions: chart.questions,
    duration: chart.duration,
    noteMap: noteMap as ReadonlyMap<number, Note>,
    lang,
    applyJudgment: () => {},
    pressCtx: (): PressContext => INITIAL_PRESS_CONTEXT,
    sweepForcedReleases: () => {},
    finish: () => {},
    isHitstopped: (): boolean => false,
    decayZoom: () => {},
    getPressedLanes: (): number[] => [],
    setQuestion: () => {},
  });
  // ── game feel refs
  const poseVelRef = useRef(0);

  // ── state
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [anger, setAnger] = useState(startAnger);
  const [stock, setStock] = useState(startStock);
  const [stockHistory, setStockHistory] = useState<number[]>([startStock]);
  /** Q-05: 연출 상태는 useStageEffects 훅으로 분리 */
  const fx = useStageEffects(reduceMotion);
  const {
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
    setReactionLine,
    pushSns: pushSnsFx,
    isHitstopped,
    decayZoom,
    applyPlan,
    triggerSlowmo,
    clearTransient,
  } = fx;

  // A-01: chart 재생성(lang 변경) 시 판정 ref 리셋 — 소프트락 방지
  useEffect(() => {
    noteStateRef.current = new Map(chart.notes.map((n) => [n.id, "pending"]));
    qIndexRef.current = 0;
    countsRef.current = emptyCounts();
    releaseCountsRef.current = emptyCounts();
    forcedReleaseRef.current = 0;
    missCursorRef.current = { notes: null, index: 0 };
    holdLaneRef.current.clear();
    holdPressRef.current.clear();
    holdDeadlineRef.current.clear();
    clearPressedRef.current();
    // 채보 교체 시 이전 런의 팝업/슬로모/링이 화면에 남지 않게 한다
    clearTransient();
    setQuestion(chart.questions[0]);
  }, [chart, clearTransient]);

  /** U-04 announce 용으로 레인 이름을 함께 넘긴다 */
  const laneName = useCallback(
    (lane: number) => LANE_NAMES[lang][ACTION_BY_LANE[lane]],
    [lang]
  );

  /** SNS 는 현재 언어를 함께 전달한다 (i18n) */
  const pushSns = useCallback(
    (tone: SnsItem["tone"]) => pushSnsFx(tone, lang),
    [pushSnsFx, lang]
  );

  const [question, setQuestion] = useState<QuestionEvent | undefined>(chart.questions[0]);
  const [laneSize, setLaneSize] = useState({ w: 0, h: 0 });
  const laneRef = useRef<HTMLDivElement>(null);
  /** 캐릭터 회전 직접 제어 핸들 */
  const kimRef = useRef<ManagerKimHandle>(null);
  /** NoteField 메모이제이션을 유지하기 위한 안정적 콜백 (ref 를 읽기만 한다) */
  const noteStateOf = useCallback(
    (id: number) => noteStateRef.current.get(id),
    []
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // U-01/B-04: 실제 플레이 중일 때만 상위에게 알려 설정 패널을 잠근다.
  // (플레이 중 언어 변경 시 chart 재생성으로 런 상태가 붕괴되던 버그의 차단 지점)
  useEffect(() => {
    onRunActiveChange?.(phase === "playing" && !paused);
    return () => onRunActiveChange?.(false);
  }, [phase, paused, onRunActiveChange]);


  /**
 * 입력 시각에만 적용되는 지연 보정 (판정 전용).
 *
 * 렌더(노트 위치)에는 적용하지 않는다. 노트는 실제 오디오를 따라 움직이고,
 * 입력 시각에서 이 값을 빼서 **판정만** 앞당긴다. 그래야 "소리로 듣고, 눈으로
 * 보고, 보정된 손맛으로 치는" 플레이가 유지된다.
 *
 * 양수 = 오디오가 늦게 들린 환경(블루투스) → 판정을 그만큼 뒤로 당겨
 * 실제로 들린 소리를 따라치는 손이 PERFECT 을 맞히게 한다.
 */
const inputOffsetSec = audioOffsetMs / 1000;

const songTime = () => {
    const a = audioRef.current;
    if (!a || startTimeRef.current === 0) return 0;
    return Math.max(0, a.now() - startTimeRef.current);
  };

  const updateAnger = (j: Judgment) => {
    const scaled = scaleAngerDelta(ANGER_DELTA[j], skills);
    // DDA: 데미지(증가분)만 완화, 회복은 그대로
    const dmg = ddaRef.current.damageScale;
    const applied = scaled > 0 ? scaled * dmg : scaled;
    const next = Math.max(0, Math.min(100, angerRef.current + applied));
    angerRef.current = next;
    setAnger(next);
  };

  const updateStock = (j: Judgment) => {
    const baseMult = scaleStockMultiplier(1 + STOCK_DELTA[j], skills);
    // DDA: 손실만 완화
    const dmg = ddaRef.current.damageScale;
    const mult = baseMult < 1 ? 1 - (1 - baseMult) * dmg : baseMult;
    const next = Math.max(
      500,
      Math.min(40000, stockRef.current * mult)
    );
    stockRef.current = next;
    setStock(next);
    setStockHistory((h) => [...h.slice(-59), next]);
  };

  const pressCtx = (): PressContext => {
    const c = countsRef.current;
    const total = c.PERFECT + c.GREAT + c.GOOD + c.BAD + c.MISS;
    const acc = total > 0 ? calculateAccuracy(c, total) : 1;
    return {
      ...pressRef.current,
      combo: comboRef.current,
      anger: angerRef.current,
      stockDelta: (stockRef.current - startStock) / startStock,
      accuracy: acc,
      dogezaHits: dogezaHitsRef.current,
      // B-13: 표본 수를 함께 넘겨 "근거 없는 칭찬" 을 막는다
      judged: total + releaseCountsRef.current.PERFECT + releaseCountsRef.current.GREAT,
    };
  };

  const applyJudgment = (note: Note, judgment: Judgment) => {
    countsRef.current[judgment]++;
    const mult = comboMultiplier(comboRef.current);
    scoreRef.current += Math.round(JUDGMENTS[judgment].score * mult);
    setScore(scoreRef.current);

    // DDA 갱신
    const nextDda = updateDda(ddaRef.current, judgment);
    ddaRef.current = nextDda;
    setDda(nextDda);

    // 기자 AI 컨텍스트 갱신
    const pr = pressRef.current;
    if (judgment === "MISS" || judgment === "BAD") {
      pr.missStreak += 1;
      pr.perfectStreak = 0;
    } else if (judgment === "PERFECT") {
      pr.missStreak = 0;
      pr.perfectStreak += 1;
    } else {
      pr.missStreak = 0;
      pr.perfectStreak = 0;
    }

    if (judgment === "MISS") {
      if (!shouldProtectCombo(judgment, skills)) {
        comboRef.current = 0;
      }
      hapticFor.miss();
    } else {
      comboRef.current += comboGain(judgment, skills);
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
      // 사죄 음성: MP3 절규 우선, 파일 없으면 TTS 폴백
      const isDogezaHit =
        note.action === "dogeza" && (judgment === "PERFECT" || judgment === "GREAT");
      if (isDogezaHit) {
        if (!audioRef.current?.playApology(true)) speakApology(DOGEZA_LINE);
      } else if (judgment === "PERFECT") {
        if (!audioRef.current?.playApology(false)) speakApology(nextApologyLine());
      }
      if (note.action === "dogeza" && (judgment === "PERFECT" || judgment === "GREAT")) {
        dogezaHitsRef.current += 1;
      }
      if (judgment === "PERFECT") hapticFor.perfect();
      else if (judgment === "GREAT") hapticFor.great();
      else hapticFor.bad();
    }
    setCombo(comboRef.current);

    // 오디오: 인텐시티 갱신 + A-01 타격 SFX (펜타토닉 상승/덕킹)
    const c = comboRef.current;
    audioRef.current?.setIntensity(c >= 50 ? 3 : c >= 30 ? 2 : c >= 10 ? 1 : 0);
    // playHit 가 judgment 에 맞는 타격음과 덕킹을 함께 처리하므로 별도 duck 을 두지 않는다
    audioRef.current?.playHit(judgment, c);

    updateAnger(judgment);
    
    if (judgment === "MISS" && equippedSkill === "bulletproof") {
      // 주가 하락 완전 방어
    } else {
      updateStock(judgment);
    }

    const isDogeza = note.action === "dogeza";
    const ctx = pressCtx();
    const seed = countsRef.current.PERFECT + countsRef.current.MISS;

    // I-07: 연출 채널 선택은 순수함수 planFeedback 가 담당한다.
    // 여기서는 (1) 판정 상태 (점수/분노/주가) (2) 소셜 반응 (3) 연출 실행만 한다.
    applyPlan(planFeedback(judgment, isDogeza, reduceMotion), note.lane, laneName(note.lane), judgment);

    // I-06: 도게자 클라이맥스는 실제로 시간을 늦춘다 (비주얼 전용).
    // 판정·MISS 판정은 계속 오디오 시간을 쓰므로 채보 싱크는 흔들리지 않는다.
    if (isDogeza && judgment === "PERFECT" && !reduceMotion) {
      triggerSlowmo("DOGEZA!!", 650);
    }

    if (judgment === "MISS") {
      // 70% 기자 AI 추궁, 30% 기존 랜덤
      setReactionLine(Math.random() < 0.7 ? tauntForMiss(ctx, seed, lang) : pickLine(missLines(lang)), "bad");
      if (Math.random() < 0.6) pushSns("negative");
    } else if (judgment === "BAD") {
      if (Math.random() < 0.5) setReactionLine(Math.random() < 0.6 ? tauntForMiss(ctx, seed, lang) : pickLine(missLines(lang)), "bad");
      if (Math.random() < 0.4) pushSns("negative");
    } else if (judgment === "PERFECT") {
      if (Math.random() < 0.4) setReactionLine(Math.random() < 0.6 ? praiseForHit(ctx, seed, lang) : pickLine(goodLines(lang)), "good");
      if (Math.random() < 0.5) pushSns("positive");
    } else if (judgment === "GREAT") {
      if (Math.random() < 0.3) pushSns("positive");
    } else if (Math.random() < 0.15) {
      pushSns("neutral");
    }
  };

  const handlePress = (lane: number, rawTime: number) => {
    // 지연 보정: 입력 시각에서만 빼서 판정한다 (렌더는 실제 오디오를 따른다).
    const time = rawTime - inputOffsetSec;
    // 실효 BAD 윈도우(DDA·스킬 반영)로 후보 탐색 + 가장 빠른 노트 우선.
    // 구규칙(가장 가까운 노트)은 8분박자 구간에서 뒷노트를 먼저 먹어
    // 앞노트가 MISS 처리되는 문제를 일으켰다.
    const badWindowSec = timingWindows.bad / 1000;
    const best = selectPressTarget(
      chart.notes,
      (id) => noteStateRef.current.get(id),
      lane,
      time,
      badWindowSec
    );
    if (!best) return;

    const abs = Math.abs(best.time - time);
    const raw = judgeTap(abs, equippedSkill, timingWindows);
    const judgment = upgradeTapJudgment(raw, skills);

    // 타이밍 진단: **보정 후** 오차를 기록한다.
    // (보정 전 오차를 기록하면 설정값이 self-feedback 루프를 만든다)
    //
    // 부호 규약: **양수 = 늦게 침, 음수 = 빨리 침.**
    //   error = 입력시각 - 노트시각
    // 이 규약이 결과 화면 히스토그램(x축 방향)과 설정 슬라이더 방향을 모두 결정한다.
    timingErrorsRef.current.push((time - best.time) * 1000);

    noteStateRef.current.set(best.id, best.hold > 0 ? "holding" : "hit");
    lastTapRef.current = { action: best.action, time };
    if (best.hold > 0) {
      holdLaneRef.current.set(lane, best.id);
      holdPressRef.current.set(best.id, time);
      // B-01: 이 노트가 언제까지 유지되어야 하는지 기록해 스윕이 역추적한다
      holdDeadlineRef.current.set(best.id, best.time + best.hold);
    }
    applyJudgment(best, judgment);
  };

  /**
   * B-08: 홀드 릴리즈의 유일한 진입점.
   * `handleRelease`(정상 놓기)와 `sweepForcedReleases`(놓침) 둘 다 여기를 지난다.
   * 탭 판정(countsRef)에는 넣지 않아 `total = notes.length` 불변식을 보존한다.
   * 대신 DDA·분노·주가·피드백은 갱신해 스팟 익스플로잇을 막는다.
   */
  const applyRelease = (note: Note, judgment: Judgment, forced = false) => {
    releaseCountsRef.current[judgment] += 1;
    if (forced) forcedReleaseRef.current += 1;

    const mult = comboMultiplier(comboRef.current);
    scoreRef.current += Math.round(JUDGMENTS[judgment].score * 0.5 * mult);
    setScore(scoreRef.current);

    // DDA 갱신 — 연속 BAD 릴리즈도 조준 난이도를 올린다
    ddaRef.current = updateDda(ddaRef.current, judgment);
    setDda(ddaRef.current);

    const pr = pressRef.current;
    if (judgment === "BAD" || judgment === "MISS") {
      pr.missStreak += 1;
      pr.perfectStreak = 0;
    } else {
      pr.missStreak = 0;
      pr.perfectStreak = judgment === "PERFECT" ? pr.perfectStreak + 1 : 0;
    }

    updateAnger(judgment);
    updateStock(judgment);

    // I-07: 릴리즈도 같은 플래너를 쓴다 (탭보다 약한 등급).
    const releasePlan = planFeedback(judgment, false, reduceMotion);
    // 절반 강도로 깎는다 — 릴리즈는 탭의 "보조" 판정이기 때문이다
    applyPlan(
      {
        ...releasePlan,
        sparks: Math.round(releasePlan.sparks * 0.5),
        flashes: Math.round(releasePlan.flashes * 0.5),
        zoom: releasePlan.zoom * 0.5,
        shockwave: false,
        hitstopMs: 0,
      },
      note.lane,
      laneName(note.lane),
      judgment
    );
    hapticFor[releasePlan.haptic === "none" ? "bad" : releasePlan.haptic]();
    audioRef.current?.playHit(judgment, comboRef.current);

    if (judgment === "PERFECT" || judgment === "GREAT") {
      if (judgment === "PERFECT" && Math.random() < 0.4) pushSns("positive");
    } else {
      // B-08: BAD 릴리즈도 화폐/분노 페널티 + 타격음이 붙는다 (기존엔 무벌점)
      setReactionLine(tr(lang, "game.holdEarly"), "bad");
      if (Math.random() < 0.5) pushSns("negative");
    }
  };

  /**
   * B-01: 기한을 넘긴 홀드 노트를 강제 해제한다.
   * 놓치면 `"holding"` 상태로 영구 잔존해 레인이 잠기고 정확도가 오염되던 버그의 해법.
   * 기한은 judgeRelease이 GOOD을 허용하는 최대 오차(bad*2)보다 항상 커야 한다.
   */
  const sweepForcedReleases = (t: number) => {
    if (holdDeadlineRef.current.size === 0) return;
    const grace = Math.max(0.35, (timingWindows.bad * 2) / 1000 + 0.05);
    for (const [noteId, deadline] of holdDeadlineRef.current) {
      if (t < deadline + grace) continue;
      holdDeadlineRef.current.delete(noteId);
      holdPressRef.current.delete(noteId);
      for (const [lane, id] of holdLaneRef.current) {
        if (id === noteId) holdLaneRef.current.delete(lane);
      }
      const note = noteMap.get(noteId);
      if (!note) continue;
      noteStateRef.current.set(noteId, "hit");
      applyRelease(note, "BAD", true);
    }
  };

  const handleRelease = (lane: number, time: number) => {
    const noteId = holdLaneRef.current.get(lane);
    if (noteId === undefined) return;
    holdLaneRef.current.delete(lane);
    const note = noteMap.get(noteId);
    if (!note) return;
    noteStateRef.current.set(noteId, "hit");
    holdDeadlineRef.current.delete(noteId);

    const pressTime = holdPressRef.current.get(noteId) ?? note.time;
    holdPressRef.current.delete(noteId);
    const heldFor = time - pressTime;
    const ideal = note.time + note.hold;
    const diff = time - ideal;

    const rawRelease = judgeRelease(diff, equippedSkill, timingWindows);
    const release = upgradeReleaseJudgment(rawRelease, skills);
    applyRelease(note, release);

    if (heldFor < note.hold * 0.5) {
      setReactionLine(tr(lang, "game.holdEarly"), "bad");
      if (Math.random() < 0.5) pushSns("negative");
    }
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    stopVoice();
    audioRef.current?.stop();
    const total = chart.notes.length;
    const c = countsRef.current;
    const accuracy = calculateAccuracy(c, total);
    const grade = computeGrade(accuracy);
    const allPerfect = total > 0 && c.PERFECT === total;
    const dogezaHits = dogezaHitsRef.current;
    const isDaily = stageId === "daily" || stageId.startsWith("daily:");
    const points = Math.round(
      earnPoints(scoreRef.current, accuracy, maxComboRef.current, dogezaHits) *
        (isDaily ? DAILY_POINTS_MULT : 1)
    );
    // A: 타이밍 진단 — 사용자가 자기 오디오 지연을 스스로 보정하게 한다
    const timing = withReliability(timingStats(timingErrorsRef.current));
    const result: GameResult = {
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      counts: c,
      releaseCounts: releaseCountsRef.current,
      forcedReleases: forcedReleaseRef.current,
      accuracy,
      grade,
      allPerfect,
      stock: stockRef.current,
      anger: angerRef.current,
      stageId,
      dogezaHits,
      points,
      timing,
      ending: computeEnding(grade, allPerfect, lang),
    };
    setPhase("done");
    window.setTimeout(() => onFinish(result), 1500);
  };

  const startGame = async () => {
    if (phaseRef.current !== "ready") return;
    phaseRef.current = "playing";
    // 음성 뱅크가 아직이면 기다렸다 시작 (캐시되면 즉시)
    await ensureVoiceBank().catch(() => undefined);
    // B-06: 대기 중 quit/언마운트가 끼면 컨텍스트를 만들지 않는다.
    // (이전에는 quit 이후에 AudioContext + 스케줄러가 생성돼 아무도 stop 하지 않았다)
    if (unmountedRef.current) return;
    const audio = new AudioEngine(chart.bpm, trackForStage(stageId), offsetForStage(stageId));
    audioRef.current = audio;
    const start = await audio.start();
    if (unmountedRef.current) {
      audio.stop();
      return;
    }
    startTimeRef.current = start;
    setPhase("playing");
  };

  /**
   * U-01 일시정지 토글. `AudioContext.suspend()` 로 곡 타임라인을 정확히 멈춘다.
   * 언마운트 후 예약된 호출이 no-op 되도록 unmountedRef 로 가드한다.
   */
  const togglePause = useCallback(() => {
    if (phaseRef.current !== "playing" && !pausedRef.current) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      stopVoice();
      // 일시정지 중 눌린 키는 풀어둔다 (복귀 직후 포즈가 끼어 있지 않도록)
      clearPressedRef.current();
      void audioRef.current?.pause();
    } else {
      void audioRef.current?.resume();
    }
  }, []);

  // U-02: 탭/창 포커스 상실 시 자동 일시정지.
  // 백그라운드 탭에서는 setInterval 이 스로틀되고 currentTime 이 튀어 복귀 시 대량 MISS 가 난다.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && phaseRef.current === "playing" && !pausedRef.current) {
        togglePause();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [togglePause]);

  const quit = () => {
    stopVoice();
    audioRef.current?.stop();
    audioRef.current = null;
    clearTransient();
    onQuit();
  };

  // B-06: 언마운트 정리. StrictMode 더블 마운트와 예외 경로에서
  // AudioContext / 25ms 스케줄러 / TTS 가 잔존하지 않게 한다.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopVoice();
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  /**
   * Q-05: 입력 계층은 useLaneInput 훅이 소유한다.
   * B-07: 포인터 ID 로 레인 상태 추적 · B-04/B-15: 항상 최신 핸들러로 디스패치.
   * `startGame`/`togglePause`/`quit` 는 아래에서 선언되므로 ref 로 우회해 순환을 피한다.
   */
  const inputReadyRef = useRef<() => void>(() => {});
  const inputNowRef = useRef<() => number>(() => 0);
  const inputPlayingRef = useRef<() => boolean>(() => false);
  /** B-16: 일시정지 중에도 true (Escape 가 재개로 가도록) */
  const inputCanPauseRef = useRef<() => boolean>(() => false);
  const inputTapRef = useRef<(a: ApologyAction, t: number) => void>(() => {});
  const inputPressRef = useRef<(lane: number, t: number) => void>(() => {});
  const inputReleaseRef = useRef<(lane: number, t: number) => void>(() => {});
  const inputHeldRef = useRef<(lane: number) => boolean>(() => false);
  const inputPauseRef = useRef<() => void>(() => {});
  const inputQuitRef = useRef<() => void>(() => {});

  const { pressedLanes, onPress: onLanePress, onRelease: onLaneRelease, clearPressed, getPressedLanes } =
    useLaneInput(keyMap, {
      now: () => inputNowRef.current(),
      isPlaying: () => inputPlayingRef.current(),
      canTogglePause: () => inputCanPauseRef.current(),
      start: () => inputReadyRef.current(),
      press: (lane, t) => inputPressRef.current(lane, t),
      release: (lane, t) => inputReleaseRef.current(lane, t),
      togglePause: () => inputPauseRef.current(),
      quit: () => inputQuitRef.current(),
      isLaneHeld: (lane) => inputHeldRef.current(lane),
      recordTap: (action, t) => inputTapRef.current(action, t),
    });
  clearPressedRef.current = clearPressed;

  // 위 훅이 사용하는 핸들러들을 실제 구현에 연결한다.
  // (선언 순서상 startGame/togglePause/quit 이 훅 호출보다 뒤에 있으므로 ref 로 우회)
  useEffect(() => {
    inputNowRef.current = songTime;
    inputPlayingRef.current = () => phaseRef.current === "playing" && !pausedRef.current;
    inputCanPauseRef.current = () => phaseRef.current === "playing";
    inputReadyRef.current = startGame;
    inputPressRef.current = handlePress;
    inputReleaseRef.current = handleRelease;
    inputTapRef.current = (action, t) => {
      lastTapRef.current = { action, time: t };
    };
    inputHeldRef.current = (lane) => holdLaneRef.current.has(lane);
    inputPauseRef.current = togglePause;
    inputQuitRef.current = quit;
  });

  // ── measure lane area
  useEffect(() => {
    const measure = () => {
      if (laneRef.current) {
        const r = laneRef.current.getBoundingClientRect();
        setLaneSize({ w: r.width, h: r.height });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /**
   * 루프가 질문 이벤트를 반영할 때 쓰는 **안정적 콜백**.
   * 상태 세터 그 자체를 ref 에 넘기지 않아 루프 컨텍스트가
   * 렌더 트리 업데이트와 분리된다 (루프는 프레임마다 setState 를 유발하지 않는다).
   */
  const applyQuestionFromLoop = useCallback((q: QuestionEvent) => {
    setQuestion(q);
  }, []);

  /**
   * B-14: RAF 루프가 `deps: []` 로 **1회만** 설치되므로, 루프가 닫는
   * `timingWindows` 는 게임 시작 시점 값으로 고정이 된다.
   * 결과적으로 DDA 가 탭 판정(`handlePress`)에는 반영되어도
   * MISS 판정(`missWindowSec`)과 강제 해제(`sweepForcedReleases`)에는 반영되지 않았다.
   *
   * 해법: 렌더마다 컨텍스트를 ref 에 담고 루프 본문은 오직 ref 만 읽는다.
   * deps 는 `[]` 로 유지되지만 값은 항상 최신이며 stale closure 도 없다.
   */
  useEffect(() => {
    loopCtxRef.current = {
      timingWindows,
      notes: chart.notes,
      questions: chart.questions,
      duration: chart.duration,
      noteMap,
      lang,
      applyJudgment,
      pressCtx,
      sweepForcedReleases,
      finish,
      isHitstopped,
      decayZoom,
      getPressedLanes,
      setQuestion: applyQuestionFromLoop,
    };
  });

  // Q-05: 프레임 드리빙은 useGameLoop 이 소유한다 (B-14: 값과 콜백을 ref 로만 읽는다)
  useGameLoop(
    {
      phaseRef,
      pausedRef,
      noteStateRef,
      holdLaneRef,
      lastTapRef,
      poseAngleRef,
      poseVelRef,
      dogezaRef,
      qIndexRef,
      missCursorRef,
      kimRef,
    },
    { songTime, setNow, setDogezaPose, isSlowmo: () => fx.slowmo !== null, ctxRef: loopCtxRef }
  );

  // ── derived
  const laneW = laneSize.w / 4;
  const hitLineY = laneSize.h - 4;
  const tier = comboToTier(combo);
  const beatDur = 60 / chart.bpm;
  const beatPhase = now > 0 ? (now % beatDur) / beatDur : 0;
  const firstNoteTime = chart.notes[0]?.time ?? Infinity;
  const remaining = firstNoteTime - now;
  let countCode: string | null = null;
  if (phase === "playing") {
    if (remaining > 3) countCode = "ready";
    else if (remaining > 2) countCode = "3";
    else if (remaining > 1) countCode = "2";
    else if (remaining > 0.1) countCode = "1";
    else if (remaining > -0.6) countCode = "GO!";
  }
  const countLabel = countCode === "ready" ? tr(lang, "game.countReady") : countCode;

  const visibleNotes = useMemo(() => {
    if (laneSize.w <= 0) return [];
    // P-01: 정렬 불변식을 이용해 윈도우만 훑는다 (이전엔 매 프레임 전체 순회).
    // miss 판정된 노트는 Map에서 "miss"로 표시되지만 흘러가게 유지.
    const { start, end } = visibleNoteWindow(chart.notes, now);
    const out: Note[] = [];
    for (let i = start; i < end; i++) {
      const n = chart.notes[i];
      if (isNoteVisible(n.time, now, noteStateRef.current.get(n.id))) out.push(n);
    }
    return out;
     
  }, [chart.notes, laneSize.w, now]);

  // 색맹 친화 팔레트 (파랑/주황/보라/분홍 고대비)
  const lanes = useMemo(
    () =>
      colorblind
        ? LANES.map((l, i) => ({
            ...l,
            color: ["#00e5ff", "#ffb020", "#b388ff", "#ff5c7a"][i] ?? l.color,
            glow: ["rgba(0,229,255,0.6)", "rgba(255,176,32,0.6)", "rgba(179,136,255,0.6)", "rgba(255,92,122,0.65)"][i] ?? l.glow,
          }))
        : LANES,
    [colorblind]
  );

  /**
   * U-03: 기믹 예고 큐.
   * `invisible` 노트는 1초에 걸쳐 사라지므로 "이거 없다" 는 메타를 외워야만
   * 대응 가능하다. 스폰 직전 레인 상단에 경고를 띄워 미리 읽을 수 있게 한다.
   * 계산 규칙은 순수함수 `telegraphsFor` (game/noteLayout.ts) 가 담당한다.
   */
  const telegraphedLanes = useMemo<TelegraphItem[]>(() => {
    if (laneSize.w <= 0) return [];
    const { start, end } = visibleNoteWindow(chart.notes, now);
    return telegraphsFor(chart.notes.slice(start, end), now, SPAWN_AHEAD);
  }, [chart.notes, laneSize.w, now]);
  const shakeClass = reduceMotion ? "" : "animate-camera-shake-hard";
  // I-02: 스테이지 테마 (useMemo 불필요 — 순수 객체 조회)
  const theme = themeForStage(stageId);
  // 콤보 글로우: 10/30/50 구간별 가장자리 빛
  const comboGlow = combo >= 50 ? 0.5 : combo >= 30 ? 0.35 : combo >= 10 ? 0.2 : 0;
  const zoomScale = 1 + Math.min(1.5, zoomPunch) * 0.035;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ transform: `scale(${zoomScale})`, transformOrigin: "50% 65%" }}
    >
      {/* 콤보 글로우 엣지 */}
      {comboGlow > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-40"
          style={{ boxShadow: `inset 0 0 120px rgba(251,191,36,${comboGlow})`, transition: "box-shadow 0.2s" }}
        />
      )}
      {/* 슬로모 도게자 오버레이 */}
      {slowmo && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <span
            key={slowmo.id}
            className="animate-count font-display text-8xl text-rose-400"
            style={{ textShadow: "0 0 60px rgba(244,63,94,0.9), 0 4px 0 #000" }}
          >
            {slowmo.label}
          </span>
        </div>
      )}
      {/* I-02: 스테이지별 테마 배경 (기존엔 전 스테이지 동일한 단일 이미지) */}
      <div className={`absolute inset-0 ${dogezaPose ? shakeClass : ""}`}>
        <img src="/bg.jpg" className="h-full w-full object-cover opacity-70" alt="" aria-hidden="true" />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${theme.sky} 0%, ${theme.floor} 55%, ${theme.floor} 100%)`,
          }}
        />
      </div>
      {anger >= 80 && (
        <div className="pointer-events-none absolute inset-0 z-50">
          <div className="absolute inset-0 bg-red-900/20 mix-blend-color-burn" />
          {equippedSkill !== "media_control" && !reduceMotion && <div className="flash-storm absolute inset-0 mix-blend-screen" />}
        </div>
      )}
      {/* I-02: 스테이지 액센트 조명 */}
      <div
        className="absolute inset-x-0 top-0 h-40 opacity-60"
        style={{
          background: `radial-gradient(60% 100% at 50% 0%, ${theme.accent}, transparent 70%)`,
        }}
      />
      {/* I-05: 콤보 티어별 비네트 (저콤보는 무채색, 고콤보는 채도 상승) */}
      {comboGlow > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: `radial-gradient(70% 60% at 50% 70%, ${theme.accent}, transparent 75%)`,
            opacity: Math.min(0.8, comboGlow * 1.6),
            transition: "opacity 0.25s",
          }}
        />
      )}

      {/* podium */}
      <div className={`absolute bottom-12 left-1/2 h-[44vh] w-[min(760px,94vw)] -translate-x-1/2 rounded-t-[28px] border border-t border-white/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.45),rgba(15,23,42,0.15))] ${dogezaPose ? shakeClass : ""}`} />
      {/* character spotlight */}
      <div className="absolute bottom-10 left-1/2 z-[6] h-[320px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_70%)]" />

      <TopHud
        phase={phase}
        lang={lang}
        score={score}
        combo={combo}
        tier={tier}
        helperOn={dda.windowBoost > 1.05}
        onPause={togglePause}
        onQuit={quit}
      />

      <SidePanels
        sns={sns}
        stock={stock}
        stockDelta={(stock - startStock) / startStock}
        stockHistory={stockHistory}
        anger={anger}
      />

      <ReporterSlot>
        {question && <Journalist type={question.journalist} text={question.text} />}
      </ReporterSlot>

      {/* character */}
      <div className={`absolute bottom-10 left-1/2 z-10 h-[340px] w-[450px] -translate-x-1/2 ${dogezaPose ? shakeClass : ""}`}>
        <PlayerCharacter
          kimRef={kimRef}
          dogeza={dogezaPose}
          anger={anger}
        />
      </div>

      <ReactionLine reaction={reaction} />

      {/* lane area — Q-02: 프레젠테이션은 NoteField 로 분리 */}
      <div
        ref={laneRef}
        className="absolute inset-x-0 bottom-14 z-20 h-[42vh] overflow-hidden sm:h-[46vh]"
      >
        <NoteField
          lanes={lanes}
          notes={visibleNotes}
          stateOf={noteStateOf}
          now={now}
          laneW={laneW}
          laneH={laneSize.h}
          hitLineY={hitLineY}
          beatPhase={beatPhase}
          pressedLanes={pressedLanes}
          telegraphs={telegraphedLanes}
          popups={popups}
          sparks={sparks}
          shockwaves={shockwaves}
          solidRings={solidRings}
          lang={lang}
        />
      </div>

      <LaneKeys
        lanes={lanes}
        keyMap={keyMap}
        lang={lang}
        pressedLanes={pressedLanes}
        onPress={onLanePress}
        onRelease={onLaneRelease}
      />

      <CameraFlashes flashes={flashes} />

      <CountdownOverlay code={countCode} label={countLabel} title={chart.title} />

      <LiveJudgment text={liveJudgment} />

      {phase === "ready" && (
        <ReadyOverlay
          lanes={lanes}
          keyMap={keyMap}
          lang={lang}
          title={chart.title}
          subtitle={chart.subtitle}
          onStart={startGame}
        />
      )}

      {phase === "done" && <DoneOverlay lang={lang} />}

      {paused && (
        <PauseOverlay lang={lang} onResume={togglePause} onQuit={quit} />
      )}
    </div>
  );
}