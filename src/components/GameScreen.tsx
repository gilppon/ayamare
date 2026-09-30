import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine, offsetForStage, trackForStage } from "@/game/audio";
import { ensureVoiceBank } from "@/game/voiceBank";
import { buildChart } from "@/game/chart";
import {
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
  laneFromKeyboardEvent,
  missLines,
  randomSns,
} from "@/game/constants";
import {
  INITIAL_PRESS_CONTEXT,
  intensifyQuestion,
  praiseForHit,
  tauntForMiss,
  type PressContext,
} from "@/game/journalistAI";
import { ddaTimingScale, initialDda, updateDda } from "@/game/dda";
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
import { AngerMeter, SnsFeed, StockPanel } from "./HUD";
import Journalist from "./Journalist";
import PlayerCharacter from "./PlayerCharacter";
import {
  LEAD_TIME,
  isNoteVisible,
  selectPressTarget,
} from "@/game/visibility";

const ACTION_RANK: Record<ApologyAction, number> = {
  bow15: 1,
  bow45: 2,
  bow90: 3,
  dogeza: 4,
};

const ANGLE_MAP: Record<ApologyAction, number> = {
  bow15: 26,
  bow45: 52,
  bow90: 80,
  dogeza: 92,
};

function deeper(a: ApologyAction | null, b: ApologyAction): ApologyAction {
  if (!a) return b;
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b;
}

function pickLine(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface Popup {
  id: number;
  judgment: Judgment;
  lane: number;
}

interface Flash {
  id: number;
  x: number;
  y: number;
}

interface Spark {
  id: number;
  lane: number;
  tx: string;
  ty: string;
  color: string;
}

interface GameScreenProps {
  stageId: string;
  equippedSkill: SkillType;
  chartOverride?: Chart;
  onFinish: (result: GameResult) => void;
  onQuit: () => void;
}

export default function GameScreen({ stageId, equippedSkill, chartOverride, onFinish, onQuit }: GameScreenProps) {
  const timingScale = useSettingsStore((s) => s.timingScale);
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
  const timingWindows = useMemo(
    () => getTimingWindows(ddaTimingScale(effectiveTimingScale(timingScale, skills), ddaRef.current)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timingScale, skills, dda.windowBoost]
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
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const dogezaHitsRef = useRef(0);
  const angerRef = useRef(startAnger);
  const stockRef = useRef(startStock);
  const countsRef = useRef<JudgmentCounts>({
    PERFECT: 0,
    GREAT: 0,
    GOOD: 0,
    BAD: 0,
    MISS: 0,
  });
  const qIndexRef = useRef(0);
  const finishedRef = useRef(false);
  const lastTapRef = useRef<{ action: ApologyAction; time: number } | null>(null);
  const poseAngleRef = useRef(0);
  const dogezaRef = useRef(false);
  const popupIdRef = useRef(0);
  const flashIdRef = useRef(0);
  const reactionIdRef = useRef(0);
  const activePressLanesRef = useRef<Set<number>>(new Set());
  // ── game feel refs
  const hitstopRef = useRef(0);
  const poseVelRef = useRef(0);
  const shockIdRef = useRef(0);
  const slowmoIdRef = useRef(0);

  // ── state
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [pressedLanes, setPressedLanes] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [anger, setAnger] = useState(startAnger);
  const [stock, setStock] = useState(startStock);
  const [stockHistory, setStockHistory] = useState<number[]>([startStock]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const sparkIdRef = useRef(0);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [zoomPunch, setZoomPunch] = useState(0);
  const [shockwaves, setShockwaves] = useState<{ id: number; lane: number }[]>([]);
  const [slowmo, setSlowmo] = useState<{ id: number; label: string } | null>(null);

  const triggerHitstop = (ms: number) => {
    if (reduceMotion) return;
    hitstopRef.current = performance.now() + ms;
  };

  const triggerZoom = (strength: number) => {
    if (reduceMotion) return;
    setZoomPunch((z) => Math.min(1.5, z + strength));
  };

  const addShockwave = (lane: number) => {
    if (reduceMotion) return;
    const id = shockIdRef.current++;
    setShockwaves((s) => [...s.slice(-5), { id, lane }]);
    window.setTimeout(() => {
      setShockwaves((s) => s.filter((x) => x.id !== id));
    }, 450);
  };

  const triggerSlowmo = (label: string, ms = 600) => {
    if (reduceMotion) return;
    const id = slowmoIdRef.current++;
    setSlowmo({ id, label });
    window.setTimeout(() => {
      setSlowmo((s) => (s && s.id === id ? null : s));
    }, ms);
  };

  const addSparks = (lane: number, count: number, color: string) => {
    const newSparks: Spark[] = [];
    for (let i = 0; i < count; i++) {
      const tx = (Math.random() - 0.5) * 120 + "px";
      const ty = (Math.random() - 0.5) * 120 + "px";
      newSparks.push({ id: sparkIdRef.current++, lane, tx, ty, color });
    }
    // 상한 60개 (고밀도 구간 DOM 폭증 방지)
    setSparks((s) => [...s.slice(-60), ...newSparks].slice(-60));
    window.setTimeout(() => {
      const ids = new Set(newSparks.map((s) => s.id));
      setSparks((s) => s.filter((x) => !ids.has(x.id)));
    }, 450);
  };
  const [sns, setSns] = useState<SnsItem[]>([]);
  const [reaction, setReaction] = useState<{
    id: number;
    text: string;
    tone: "bad" | "good";
  } | null>(null);
  const [question, setQuestion] = useState<QuestionEvent>(chart.questions[0]);
  const [laneSize, setLaneSize] = useState({ w: 0, h: 0 });
  const laneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const mountTimeRef = useRef(Date.now());

  const songTime = () => {
    const a = audioRef.current;
    if (!a || startTimeRef.current === 0) return 0;
    return Math.max(0, a.now() - startTimeRef.current);
  };

  // ── feedback helpers
  const addPopup = (judgment: Judgment, lane: number) => {
    const id = popupIdRef.current++;
    setPopups((p) => [...p, { id, judgment, lane }]);
    window.setTimeout(
      () => setPopups((p) => p.filter((x) => x.id !== id)),
      720
    );
  };

  const addFlashes = (count: number) => {
    for (let i = 0; i < count; i++) {
      const id = flashIdRef.current++;
      // 상한 12개
      setFlashes((f) => [
        ...f.slice(-12),
        { id, x: 12 + Math.random() * 76, y: 10 + Math.random() * 70 },
      ]);
      window.setTimeout(
        () => setFlashes((f) => f.filter((x) => x.id !== id)),
        320
      );
    }
  };

  const pushSns = (tone: SnsItem["tone"]) => {
    setSns((s) => [randomSns(tone, lang), ...s].slice(0, 5));
  };

  const setReactionLine = (text: string, tone: "bad" | "good") => {
    const id = reactionIdRef.current++;
    setReaction({ id, text, tone });
    window.setTimeout(
      () => setReaction((r) => (r && r.id === id ? null : r)),
      1700
    );
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

    // 오디오: 인텐시티만 갱신 (버튼 타격 SFX는 제거됨)
    const c = comboRef.current;
    audioRef.current?.setIntensity(c >= 50 ? 3 : c >= 30 ? 2 : c >= 10 ? 1 : 0);
    if (judgment === "BAD" || judgment === "MISS") {
      audioRef.current?.duck(judgment === "MISS" ? 0.4 : 0.25);
    }

    updateAnger(judgment);
    
    if (judgment === "MISS" && equippedSkill === "bulletproof") {
      // 주가 하락 완전 방어
    } else {
      updateStock(judgment);
    }

    // 모션 감소 모드에서는 플래시/스파크 양 감소
    const flashScale = reduceMotion ? 0 : 1;
    const isDogeza = note.action === "dogeza";
    const ctx = pressCtx();
    const seed = countsRef.current.PERFECT + countsRef.current.MISS;

    if (judgment === "MISS") {
      addPopup("MISS", note.lane);
      if (flashScale) addFlashes(1);
      // 70% 기자 AI 추궁, 30% 기존 랜덤
      setReactionLine(Math.random() < 0.7 ? tauntForMiss(ctx, seed, lang) : pickLine(missLines(lang)), "bad");
      if (Math.random() < 0.6) pushSns("negative");
    } else if (judgment === "BAD") {
      addPopup("BAD", note.lane);
      if (flashScale) addFlashes(1);
      if (Math.random() < 0.5) setReactionLine(Math.random() < 0.6 ? tauntForMiss(ctx, seed, lang) : pickLine(missLines(lang)), "bad");
      if (Math.random() < 0.4) pushSns("negative");
    } else if (judgment === "PERFECT") {
      addPopup("PERFECT", note.lane);
      if (flashScale) addFlashes(isDogeza ? 6 : 4);
      if (!reduceMotion) addSparks(note.lane, isDogeza ? 12 : 8, JUDGMENTS["PERFECT"].color);
      // 게임필: 히트스탑 + 줌펀치 + 쇼크웨이브, 도게자는 슬로모
      triggerHitstop(isDogeza ? 70 : 40);
      triggerZoom(isDogeza ? 1.2 : 0.7);
      addShockwave(note.lane);
      if (isDogeza) triggerSlowmo("DOGEZA!!", 650);
      if (Math.random() < 0.4) setReactionLine(Math.random() < 0.6 ? praiseForHit(ctx, seed, lang) : pickLine(goodLines(lang)), "good");
      if (Math.random() < 0.5) pushSns("positive");
    } else if (judgment === "GREAT") {
      addPopup("GREAT", note.lane);
      if (flashScale) addFlashes(2);
      if (!reduceMotion) addSparks(note.lane, 5, JUDGMENTS["GREAT"].color);
      triggerZoom(0.35);
      if (isDogeza) addShockwave(note.lane);
      if (Math.random() < 0.3) pushSns("positive");
    } else {
      addPopup("GOOD", note.lane);
      if (flashScale) addFlashes(1);
      if (!reduceMotion) addSparks(note.lane, 3, JUDGMENTS["GOOD"].color);
      if (Math.random() < 0.15) pushSns("neutral");
    }
  };

  const handlePress = (lane: number, time: number) => {
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

    noteStateRef.current.set(best.id, best.hold > 0 ? "holding" : "hit");
    lastTapRef.current = { action: best.action, time };
    if (best.hold > 0) {
      holdLaneRef.current.set(lane, best.id);
      holdPressRef.current.set(best.id, time);
    }
    applyJudgment(best, judgment);
  };

  const handleRelease = (lane: number, time: number) => {
    const noteId = holdLaneRef.current.get(lane);
    if (noteId === undefined) return;
    holdLaneRef.current.delete(lane);
    const note = noteMap.get(noteId);
    if (!note) return;
    noteStateRef.current.set(noteId, "hit");

    const pressTime = holdPressRef.current.get(noteId) ?? note.time;
    holdPressRef.current.delete(noteId);
    const heldFor = time - pressTime;
    const ideal = note.time + note.hold;
    const diff = time - ideal;

    const rawRelease = judgeRelease(diff, equippedSkill, timingWindows);
    const release = upgradeReleaseJudgment(rawRelease, skills);

    scoreRef.current += Math.round(JUDGMENTS[release].score * 0.5);
    setScore(scoreRef.current);

    if (release === "PERFECT" || release === "GREAT") {
      addPopup(release, note.lane);
      if (!reduceMotion) {
        addFlashes(2);
        addSparks(note.lane, release === "PERFECT" ? 8 : 5, JUDGMENTS[release].color);
      }
      if (release === "PERFECT" && Math.random() < 0.4) pushSns("positive");
    }
    if (heldFor < note.hold * 0.5) {
      setReactionLine(tr(lang, "game.holdEarly"), "bad");
      if (Math.random() < 0.5) pushSns("negative");
    }
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
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
    const result: GameResult = {
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      counts: c,
      accuracy,
      grade,
      allPerfect,
      stock: stockRef.current,
      anger: angerRef.current,
      stageId,
      dogezaHits,
      points,
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
    const audio = new AudioEngine(chart.bpm, trackForStage(stageId), offsetForStage(stageId));
    audioRef.current = audio;
    const start = await audio.start();
    startTimeRef.current = start;
    setPhase("playing");
  };

  const quit = () => {
    stopVoice();
    audioRef.current?.stop();
    onQuit();
  };

  const onLanePress = (lane: number) => {
    if (Date.now() - mountTimeRef.current < 500) return; // 0.5초간 키 먹힘 방지 (의도치 않은 자동 시작 차단)
    if (phaseRef.current === "ready") {
      startGame();
      return;
    }
    if (phaseRef.current !== "playing") return;
    activePressLanesRef.current.add(lane);
    setPressedLanes(Array.from(activePressLanesRef.current));
    const t = songTime();
    const laneConfig = LANES[lane];
    if (laneConfig) {
      lastTapRef.current = { action: laneConfig.action, time: t };
    }
    if (holdLaneRef.current.has(lane)) return;
    handlePress(lane, t);
  };

  const onLaneRelease = (lane: number) => {
    activePressLanesRef.current.delete(lane);
    setPressedLanes(Array.from(activePressLanesRef.current));
    if (phaseRef.current !== "playing") return;
    handleRelease(lane, songTime());
  };

  // ── input (커스텀 키맵 + 한글 IME 대응)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        quit();
        return;
      }
      // IME 조합 중이면 e.key가 한글 음절일 수 있어 e.code로 폴백
      const lane = laneFromKeyboardEvent(e, keyMap);
      if (lane === undefined) return;
      e.preventDefault();
      if (e.repeat) return;
      onLanePress(lane);
    };
    const up = (e: KeyboardEvent) => {
      const lane = laneFromKeyboardEvent(e, keyMap);
      if (lane === undefined) return;
      onLaneRelease(lane);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyMap]);

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

  // ── game loop (히트스탑 + 스프링 포즈)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const ph = phaseRef.current;
      if (ph === "playing" || ph === "done") {
        // 히트스탑: 시각 업데이트 일시 정지 (오디오는 계속)
        if (performance.now() < hitstopRef.current) {
          raf = requestAnimationFrame(loop);
          return;
        }
        const t = songTime();
        setNow(t);
        // 줌펀치 감쇠
        setZoomPunch((z) => (z > 0.01 ? z * 0.88 : 0));
        if (ph === "playing") {
          // miss detection — 실효 BAD 윈도우 기준 (DDA 부스트 시 더 늦게 MISS)
          const missWindowSec = timingWindows.bad / 1000;
          for (const n of chart.notes) {
            if (n.gimmick === "fake") continue;
            if (noteStateRef.current.get(n.id) !== "pending") continue;
            if (n.time + missWindowSec < t) {
              // Circuit Breaker: 만약 시간이 워프(3초 이상 갭)했다면 비정상 방치이므로 MISS 처리 대신 PASS
              if (t - n.time > 3.0) {
                 noteStateRef.current.set(n.id, "miss"); // 지나가게 두되
                 // applyJudgment(n, "MISS"); // 데미지는 입히지 않음 (방치 폭사 방지)
              } else {
                 noteStateRef.current.set(n.id, "miss");
                 applyJudgment(n, "MISS");
              }
            }
          }
          // question advance — 기자 AI가 상황별 꼬리 추가
          while (
            qIndexRef.current < chart.questions.length &&
            chart.questions[qIndexRef.current].time <= t
          ) {
            const base = chart.questions[qIndexRef.current];
            const ctx = pressCtx();
            const seed = qIndexRef.current + comboRef.current;
            setQuestion({ ...base, text: intensifyQuestion(base.text, ctx, seed, lang) });
            pressRef.current.questionIndex = qIndexRef.current + 1;
            qIndexRef.current++;
          }
          // pose — 스프링 물리 (탄성 있는 숙이기)
          let desired: ApologyAction | null = null;
          holdLaneRef.current.forEach((id) => {
            const n = noteMap.get(id);
            if (n) desired = deeper(desired, n.action);
          });
          activePressLanesRef.current.forEach((lane) => {
            const cfg = LANES[lane];
            if (cfg) desired = deeper(desired, cfg.action);
          });
          const lt = lastTapRef.current;
          if (lt && t - lt.time < 0.35) desired = deeper(desired, lt.action);
          const targetAngle = desired
            ? desired === "dogeza"
              ? 92
              : ANGLE_MAP[desired]
            : 0;
          const stiffness = 0.22;
          const damping = 0.68;
          poseVelRef.current += (targetAngle - poseAngleRef.current) * stiffness;
          poseVelRef.current *= damping;
          poseAngleRef.current += poseVelRef.current + (targetAngle - poseAngleRef.current) * 0.12;
          dogezaRef.current = desired === "dogeza";

          if (t >= chart.duration) finish();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── derived
  const laneW = laneSize.w / 4;
  const speed = laneSize.h / LEAD_TIME;
  const hitLineY = laneSize.h - 4;
  const tier = comboToTier(combo);
  const beatDur = 60 / chart.bpm;
  const beatPhase = now > 0 ? (now % beatDur) / beatDur : 0;
  const hitPulse = 0.35 + (1 - beatPhase) * 0.5;
  const firstNoteTime = chart.notes[0].time;
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
    // miss 판정된 노트는 Map에서 "miss"로 표시되지만 흘러가게 유지.
    // 매 프레임 filter 순회를 위해 노트는 time 순 정렬 가정.
    return chart.notes.filter((n) =>
      isNoteVisible(n.time, now, noteStateRef.current.get(n.id))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const shakeClass = reduceMotion ? "" : "animate-camera-shake-hard";
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
      {/* backdrop */}
      <div className={`absolute inset-0 ${dogezaRef.current ? shakeClass : ""}`}>
        <img src="/bg.jpg" className="h-full w-full object-cover opacity-70" alt="Background" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,36,0.4)_0%,rgba(7,10,18,0.7)_55%,rgba(10,15,28,0.85)_100%)]" />
      </div>
      {anger >= 80 && (
        <div className="pointer-events-none absolute inset-0 z-50">
          <div className="absolute inset-0 bg-red-900/20 mix-blend-color-burn" />
          {equippedSkill !== "media_control" && !reduceMotion && <div className="flash-storm absolute inset-0 mix-blend-screen" />}
        </div>
      )}
      <div
        className="absolute inset-x-0 top-0 h-40 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(56,120,255,0.25), transparent 70%)",
        }}
      />

      {/* podium */}
      <div className={`absolute bottom-12 left-1/2 h-[44vh] w-[min(760px,94vw)] -translate-x-1/2 rounded-t-[28px] border border-t border-white/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.45),rgba(15,23,42,0.15))] ${dogezaRef.current ? shakeClass : ""}`} />
      {/* character spotlight */}
      <div className="absolute bottom-10 left-1/2 z-[6] h-[320px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_70%)]" />

      {/* quit */}
      <button
        onClick={quit}
        className="absolute left-4 top-3 z-40 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-400 backdrop-blur transition hover:text-white"
      >
        {tr(lang, "game.quit")}
      </button>

      {/* SNS feed — 모바일에서는 공간 확보를 위해 숨김 */}
      <div className="absolute left-4 top-12 z-30 hidden md:block">
        <SnsFeed items={sns} />
      </div>

      {/* stock + anger — 모바일에서 컴팩트 */}
      <div className="absolute right-2 top-2 z-30 flex scale-90 flex-col items-end gap-2 origin-top-right sm:right-4 sm:top-3 sm:scale-100">
        <StockPanel
          stock={stock}
          delta={(stock - startStock) / startStock}
          history={stockHistory}
        />
        <AngerMeter anger={anger} />
      </div>

      {/* score / combo */}
      <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 text-center">
        <div className="font-display text-3xl text-white drop-shadow">
          {score.toLocaleString("en-US")}
        </div>
        {dda.windowBoost > 1.05 && (
          <div className="mx-auto mt-0.5 w-fit rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
            {tr(lang, "game.helper")}
          </div>
        )}
        {combo >= 2 && (
          <div className="flex items-center justify-center gap-2">
            <span className="font-display text-xl text-amber-300">
              {combo} COMBO
            </span>
            {tier && (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-200/90">
                {tier.name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* journalist / question */}
      <div className="absolute left-1/2 top-[13vh] z-20 w-full max-w-2xl -translate-x-1/2 px-4">
        <Journalist type={question.journalist} text={question.text} />
      </div>

      {/* character */}
      <div className={`absolute bottom-10 left-1/2 z-10 h-[340px] w-[450px] -translate-x-1/2 ${dogezaRef.current ? shakeClass : ""}`}>
        <PlayerCharacter
          angle={poseAngleRef.current}
          dogeza={dogezaRef.current}
          anger={anger}
        />
      </div>

      {/* reaction line */}
      <div className="pointer-events-none absolute left-1/2 top-[34vh] z-40 -translate-x-1/2">
        {reaction && (
          <div key={reaction.id} className="animate-reaction text-center">
            <span
              className={`font-display text-3xl sm:text-4xl ${
                reaction.tone === "bad" ? "text-rose-400" : "text-emerald-300"
              }`}
              style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
            >
              {reaction.text}
            </span>
          </div>
        )}
      </div>

      {/* lane area */}
      <div
        ref={laneRef}
        className="absolute inset-x-0 bottom-14 z-20 h-[42vh] overflow-hidden sm:h-[46vh]"
      >
        {lanes.map((l) => {
          const isPressed = pressedLanes.includes(l.lane);
          return (
            <div
              key={l.lane}
              className="absolute top-0 h-full transition-opacity duration-75 pointer-events-none"
              style={{
                left: `${l.lane * 25}%`,
                width: "25%",
                borderLeft:
                  l.lane > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                background: isPressed
                  ? `linear-gradient(180deg, transparent 20%, ${l.glow} 100%)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.02), transparent 80%)",
                opacity: isPressed ? 0.35 : 1,
              }}
            />
          );
        })}

        {visibleNotes.map((n) => {
          const lane = lanes[n.lane];
          const st = noteStateRef.current.get(n.id);
          let y: number;
          let tailTop = 0;
          let tailH = 0;
          
          let opacity = 1;

          if (n.gimmick === "invisible") {
            const d = n.time - now;
            // 1.0초부터 서서히 투명해지되, 잔상을 35% + 점선 테두리로 남겨
            // 기믹임을 명확히 (완전 소멸로 오해 방지)
            if (d < 1.0) opacity = Math.max(0.35, (d - 0.2) / 0.8);
          }
          if (n.gimmick === "speedUp") {
            // 역주행 버그 방지: 단순 배속 곱셈 대신 타격선까지 남은 시간을 왜곡 곡선(제곱 등)으로 가속시킴
            const d = Math.max(0, n.time - now);
            if (d < 1.0) {
              const ratio = Math.pow(d, 1.6); // 1.0 -> 1, 0 -> 0 이지만 곡선으로 급가속
              y = hitLineY - ratio * speed;
            } else {
              y = hitLineY - d * speed;
            }
            if (n.hold > 0) {
              tailTop = y + 18;
              tailH = n.hold * speed;
            }
          } else {
            if (st === "holding") {
              y = hitLineY;
              const remaining = n.time + n.hold - now;
              tailTop = hitLineY + 2;
              tailH = Math.max(0, remaining) * speed;
            } else {
              const diff = n.time - now;
              y = hitLineY - diff * speed;
              if (n.hold > 0) {
                tailTop = y + 18;
                tailH = n.hold * speed;
              }
            }
          }

          const isFake = n.gimmick === "fake";
          const isGhost = n.gimmick === "invisible";
          const bgColor = st === "miss" ? "#334155" : (isFake ? "#6b7280" : lane.color);
          const textColor = st === "miss" ? "#1e293b" : (isFake ? "#111827" : "#0b0f19");
          const label = isFake 
            ? "???" 
            : isGhost 
              ? tr(lang, "game.ghost") 
              : n.gimmick === "speedUp"
                ? tr(lang, "game.speedup")
                : lane.label;
          const boxShadow = st === "miss" || isFake ? "none" : `0 0 18px ${lane.glow}`;
          if (st === "miss") opacity *= 0.4; // 미스난 노트는 반투명하게 바닥으로 떨어짐

          return (
            <div
              key={n.id}
              className="absolute top-0"
              style={{ left: n.lane * laneW, width: laneW, opacity }}
            >
              {n.hold > 0 && !isFake && (
                <div
                  className="absolute rounded-full"
                  style={{
                    left: laneW * 0.18,
                    width: laneW * 0.64,
                    top: tailTop,
                    height: Math.max(4, tailH),
                    background: lane.glow,
                  }}
                />
              )}
              <div
                className="absolute flex items-center justify-center rounded-xl font-display"
                style={{
                  left: laneW * 0.1,
                  width: laneW * 0.8,
                  height: 36,
                  top: y - 18,
                  backgroundColor: bgColor,
                  color: textColor,
                  fontSize: label.length > 4 ? 15 : 20,
                  boxShadow,
                  // 고스트 노트는 점선 테두리로 기믹임을 명시
                  border: isGhost ? "2px dashed rgba(255,255,255,0.7)" : undefined,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}

        {/* hit line */}
        <div
          className="absolute inset-x-0"
          style={{
            top: hitLineY,
            height: 2,
            background: `rgba(255,255,255,${hitPulse})`,
            boxShadow: `0 0 16px rgba(255,255,255,${(hitPulse * 0.9).toFixed(2)})`,
          }}
        />

        {/* judgment popups */}
        {popups.map((p) => (
          <div
            key={p.id}
            className="animate-popup absolute font-display text-2xl font-bold"
            style={{
              left: p.lane * laneW + laneW / 2,
              top: hitLineY - 44,
              color: JUDGMENTS[p.judgment].color,
              textShadow: "0 2px 12px rgba(0,0,0,0.7)",
            }}
          >
            {JUDGMENTS[p.judgment].label}
          </div>
        ))}

        {/* sparks */}
        {sparks.map((s) => (
          <div
            key={s.id}
            className="hit-spark"
            style={{
              left: s.lane * laneW + laneW / 2,
              top: hitLineY,
              width: 14,
              height: 14,
              backgroundColor: s.color,
              boxShadow: `0 0 12px ${s.color}`,
              ["--tx" as any]: s.tx,
              ["--ty" as any]: s.ty,
            }}
          />
        ))}

        {/* shockwaves — PERFECT 파동 링 */}
        {shockwaves.map((w) => (
          <div
            key={w.id}
            className="pointer-events-none absolute rounded-full border-2"
            style={{
              left: w.lane * laneW + laneW / 2,
              top: hitLineY,
              width: 24,
              height: 24,
              transform: "translate(-50%,-50%)",
              borderColor: lanes[w.lane]?.color ?? "#fff",
              animation: "shockwave 0.45s ease-out forwards",
            }}
          />
        ))}
      </div>

      {/* key buttons — 터치 대응: 최소 56px 터치 타겟, pointer 이벤트 */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-16 touch-none select-none">
        {lanes.map((l) => {
          const isPressed = pressedLanes.includes(l.lane);
          const customLabel = (() => {
            for (const [k, v] of Object.entries(keyMap)) {
              if (v === l.lane) return k === " " ? "SPACE" : k.toUpperCase();
            }
            return l.keyLabel;
          })();
          return (
            <button
              key={l.lane}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                onLanePress(l.lane);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                onLaneRelease(l.lane);
              }}
              onPointerCancel={() => {
                onLaneRelease(l.lane);
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 border-t border-white/10 cursor-pointer select-none transition-all duration-75 active:scale-95 ${
                isPressed
                  ? "bg-white/20"
                  : "bg-slate-950/80 hover:bg-white/5 active:bg-white/10"
              }`}
              style={{
                borderRight:
                  l.lane < 3 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                boxShadow: isPressed ? `inset 0 0 20px ${l.glow}` : undefined,
                minHeight: 56,
              }}
            >
              <span className="flex items-center gap-1.5 pointer-events-none">
                <kbd
                  className={`rounded border px-1.5 py-0.5 font-display text-sm transition ${
                    isPressed
                      ? "bg-white border-white font-bold text-slate-950"
                      : "border-white/20 bg-slate-800"
                  }`}
                  style={{ color: isPressed ? "#0f172a" : l.color }}
                >
                  {customLabel}
                </kbd>
                <span className="font-display text-lg" style={{ color: l.color }}>
                  {l.label}
                </span>
              </span>
              <span className="hidden text-[10px] text-slate-400 pointer-events-none sm:inline">{LANE_NAMES[lang][l.action]}</span>
            </button>
          );
        })}
      </div>

      {/* camera flashes */}
      <div className="pointer-events-none absolute inset-0 z-40">
        {flashes.map((f) => (
          <div
            key={f.id}
            className="animate-flash absolute rounded-full bg-white"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: 90,
              height: 90,
              transform: "translate(-50%,-50%)",
              filter: "blur(2px)",
            }}
          />
        ))}
      </div>

      {/* countdown — 비트 도트 + 진행감 */}
      {countCode && countLabel && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3">
          <span
            key={countCode}
            className="animate-count font-display text-7xl text-white sm:text-8xl"
            style={{ textShadow: "0 0 30px rgba(251,191,36,0.7)" }}
          >
            {countLabel}
          </span>
          <div className="flex gap-2">
            {[3, 2, 1].map((b) => (
              <span
                key={b}
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    countCode === String(b) || (countCode === "GO!" && b === 1)
                      ? "#fbbf24"
                      : "rgba(255,255,255,0.2)",
                  boxShadow: countCode === String(b) ? "0 0 12px #fbbf24" : "none",
                }}
              />
            ))}
          </div>
          <span className="font-display text-sm tracking-[0.3em] text-slate-400">
            {chart.title}
          </span>
        </div>
      )}

      {/* ready overlay */}
      {phase === "ready" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/70 px-6 backdrop-blur-sm">
          <p className="font-display text-4xl text-white">
            {tr(lang, "game.readyA")} <span className="text-rose-400">{tr(lang, "game.readyB")}</span>
          </p>
          <p className="-mt-3 font-display text-sm tracking-[0.3em] text-slate-500">
            {chart.title} · {chart.subtitle}
          </p>
          <p className="max-w-md text-center text-sm leading-relaxed text-slate-300">
            {tr(lang, "game.readyDesc")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {lanes.map((l) => {
              const effectiveLabel = (() => {
                for (const [k, v] of Object.entries(keyMap)) {
                  if (v === l.lane) return k === " " ? "SPACE" : k.toUpperCase();
                }
                return l.keyLabel;
              })();
              return (
                <div
                  key={l.lane}
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3"
                >
                  <kbd
                    className="rounded-md border px-2 py-1 font-display text-base"
                    style={{
                      color: l.color,
                      borderColor: `${l.color}55`,
                      backgroundColor: `${l.color}14`,
                    }}
                  >
                    {effectiveLabel}
                  </kbd>
                  <span className="font-display text-xl" style={{ color: l.color }}>
                    {l.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{LANE_NAMES[lang][l.action]}</span>
                </div>
              );
            })}
          </div>
          <p className="-mt-2 text-[11px] text-slate-500">
            {tr(lang, "game.imeNote")}
          </p>
          <button
            onClick={startGame}
            className="animate-ring rounded-full border border-amber-300/40 bg-amber-400/10 px-8 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20"
          >
            {tr(lang, "game.start")}
          </button>
        </div>
      )}

      {/* done overlay */}
      {phase === "done" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
          <p className="font-display text-5xl text-white">{tr(lang, "game.done")}</p>
          <p className="mt-2 text-slate-400">{tr(lang, "game.tally")}</p>
        </div>
      )}
    </div>
  );
}
