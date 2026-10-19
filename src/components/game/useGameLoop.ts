import { useEffect, useRef, type RefObject } from "react";
import { LANES } from "@/game/constants";
import type { TimingWindows } from "@/game/judgment";
import { isJudgeable } from "@/game/visibility";
import { intensifyQuestion, type PressContext } from "@/game/journalistAI";
import type { Lang } from "@/i18n/ui";
import type {
  ApologyAction,
  Judgment,
  Note,
  QuestionEvent,
} from "@/game/types";
import type { ManagerKimHandle } from "@/components/ManagerKim";

export type NoteState = "pending" | "hit" | "miss" | "holding";

/** B-14: 루프가 읽을 가변 컨텍스트 (매 렌더 갱신된다) */
export interface LoopContext {
  timingWindows: TimingWindows;
  notes: Note[];
  questions: QuestionEvent[];
  duration: number;
  noteMap: ReadonlyMap<number, Note>;
  lang: Lang;
  applyJudgment: (note: Note, judgment: Judgment) => void;
  pressCtx: () => PressContext;
  sweepForcedReleases: (t: number) => void;
  finish: () => void;
  isHitstopped: () => boolean;
  decayZoom: () => void;
  getPressedLanes: () => number[];
  setQuestion: (q: QuestionEvent) => void;
}

export interface GameLoopRefs {
  phaseRef: RefObject<"ready" | "playing" | "done">;
  pausedRef: RefObject<boolean>;
  noteStateRef: RefObject<Map<number, NoteState>>;
  holdLaneRef: RefObject<Map<number, number>>;
  lastTapRef: RefObject<{ action: ApologyAction; time: number } | null>;
  poseAngleRef: RefObject<number>;
  poseVelRef: RefObject<number>;
  dogezaRef: RefObject<boolean>;
  qIndexRef: RefObject<number>;
  /** P-01: MISS 스캔 커서 — 매 프레임 전체 순회를 없애고 앞으로만 훑는다 */
  missCursorRef: RefObject<{ notes: Note[] | null; index: number }>;
  kimRef: RefObject<ManagerKimHandle | null>;
}

export interface GameLoopSinks {
  songTime: () => number;
  setNow: (t: number) => void;
  setDogezaPose: (v: boolean) => void;
  /** I-06: 슬로모 활성 여부 (도게자 클라이맥스) */
  isSlowmo: () => boolean;
  /** 루프 컨텍스트 ref (렌더마다 갱신) */
  ctxRef: RefObject<LoopContext>;
}

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

const POSE_STIFFNESS = 0.22;
const POSE_DAMPING = 0.68;
const POSE_FOLLOW = 0.12;
/** 마지막 탭 직후에도 포즈를 유지하는 시간(초) */
export const TAP_POSE_HOLD_SEC = 0.35;
/** 시간 워프(탭 비활성화 후 복귀 등)로 대량 MISS 가 나는 것을 막는 상한 */
export const WARP_GUARD_SEC = 3.0;

/**
 * I-06: 도게자 클라이맥스의 비주얼 슬로모 배율.
 *
 * **판정에는 절대 쓰지 않는다.** MISS 판정·입력 타이밍은 계속 오디오 시간을 쓰므로
 * 채보 싱크가 흔들리지 않는다. 렌더에만 적용되는 시각 연출이다.
 */
export const SLOWMO_SCALE = 0.35;

/**
 * 슬로모로 인한 최대 시각 지연(초).
 *
 * 리듬게임에서 시각이 오디오에서 크게 벌어지면 플레이어가 "노트가 어긋났다" 고
 * 느껴 조작 불능이 된다. 그래서 지연은 이 상한에서 **포화**된다 —
 * 슬로모가 시작되면 잠깐 (≈200ms) 느리다가 상한에 닿으면 정속으로 따라잡는다.
 * "타격에 무게가 실리는 느낌" 은 주되, 싱크는 절대 깨지지 않는다.
 */
export const SLOWMO_MAX_LAG_SEC = 0.12;

/**
 * 슬로모 시각 시각 계산 (순수함수).
 *
 * @param visual 현재 비주얼 시각
 * @param audio  실제 오디오 기반 곡 시각 (진짜 시간)
 * @param active 슬로모 활성 여부
 * @param dtSeconds 마지막 프레임 경과 시간(초)
 */
export function advanceSlowmo(
  visual: number,
  audio: number,
  active: boolean,
  dtSeconds: number
): number {
  if (!active) return audio;
  const slowed = visual + dtSeconds * SLOWMO_SCALE;
  // 지연 상한을 넘지 않게 하고, 오디오를 역주행하지도 않게 한다
  const floor = audio - SLOWMO_MAX_LAG_SEC;
  return Math.min(audio, Math.max(floor, slowed));
}

export function deeper(a: ApologyAction | null, b: ApologyAction): ApologyAction {
  if (!a) return b;
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b;
}

/**
 * 게임 루프 (requestAnimationFrame).
 *
 * Q-05: GameScreen 에서 프레임 드리빙을 분리한다.
 *
 * B-14: 이 루프는 `deps: []` 로 **1회만** 설치되므로 렌더 값(채보 · 타이밍 윈도우 ·
 * 콜백)을 직접 닫으면 초기값으로 고정된다. 그 결과 DDA 어시스트가 MISS 판정에만
 * 반영되지 않는 반쪽짜리가 된다. 그래서 본문은 오직 `ctxRef.current` 와 `refs`
 * 만 읽는다 — 값은 렌더마다 갱신되므로 항상 최신이다.
 */
export function useGameLoop(refs: GameLoopRefs, sinks: GameLoopSinks): void {
  const stable = useRef({ refs, sinks });
  stable.current = { refs, sinks };
  /** I-06: 렌더에 쓰는 시각 시각 (슬로모로 지연될 수 있다) */
  const visualRef = useRef(0);
  const lastAudioRef = useRef(0);

  useEffect(() => {
    let raf = 0;

    const loop = () => {
      const { refs: r, sinks: s } = stable.current;
      const ph = r.phaseRef.current;

      if (ph === "playing" || ph === "done") {
        // U-01: 일시정지 중에는 곡 타임라인 자체가 멈춘다 (ctx.suspend).
        if (r.pausedRef.current) {
          lastAudioRef.current = s.songTime();
          raf = requestAnimationFrame(loop);
          return;
        }

        const t = s.songTime();
        // B-11: 곡 시각은 항상 갱신한다 (히트스톱이 판정을 지연시키지 않게).
        const hitstopped = s.ctxRef.current.isHitstopped();
        const dt = Math.max(0, t - lastAudioRef.current);
        lastAudioRef.current = t;

        // I-06: 슬로모는 **표시 시간만** 늦춘다. 판정은 계속 `t`(오디오 시간)를 쓴다.
        visualRef.current = advanceSlowmo(visualRef.current, t, s.isSlowmo(), dt);
        s.setNow(visualRef.current);

        // 히트스톱 동안에는 줌펀치를 피크에 고정한다 (타격 임팩트 hold).
        if (!hitstopped) s.ctxRef.current.decayZoom();

        if (ph === "playing") {
          const {
            timingWindows,
            notes,
            questions,
            duration,
            noteMap,
            lang,
            applyJudgment,
            pressCtx,
            sweepForcedReleases,
            finish,
            getPressedLanes,
            setQuestion,
          } = s.ctxRef.current;

          // ── MISS 판정 (실효 BAD 윈도우 기준 — DDA 부스트 시 더 늦게 MISS)
          //
          // 정렬 불변식(notes 가 time 오름차순) + 단조 증가하는 곡 시각을 이용해
          // **프레임마다 전체를 훑지 않고** 앞으로만 스캔한다.
          // 이전엔 매 프레임 chart.notes 전량(수백 개)을 순회했는데,
          // 대부분의 프레임에서는 이미 판정된 노트 조회만 반복되고 있었다.
          const missWindowSec = timingWindows.bad / 1000;
          const cursor = r.missCursorRef.current;
          // 채보가 교체되면 처음부터 다시 훑는다 (커스텀 전환 · 재시작)
          if (cursor.notes !== notes) {
            cursor.notes = notes;
            cursor.index = 0;
          }
          while (cursor.index < notes.length) {
            const n = notes[cursor.index];
            // 아직 판정 시각이 안 됐으면 이후 노트도 모두 미래다 → 중단
            if (n.time + missWindowSec >= t) break;
            cursor.index++;
            // fake 는 "누르면 안 되는 노트" 다 — 놓쳤다고 MISS 로 치지 않는다.
            // (판정 대상 규칙은 visibility.isJudgeable 이 단일 출처다)
            if (!isJudgeable(n)) continue;
            if (r.noteStateRef.current.get(n.id) !== "pending") continue;
            r.noteStateRef.current.set(n.id, "miss");
            // 워프로 시간이 크게 튄 경우(탭 비활성화) 데미지 없이 통과시켜 폭사를 막는다.
            if (t - n.time <= WARP_GUARD_SEC) applyJudgment(n, "MISS");
          }

          // ── B-01: 놓친 홀드 강제 해제 (미해결 holding 이 레인을 잠그는 것을 방지)
          sweepForcedReleases(t);

          // ── 질문 진행 (기자 AI 가 상황별로 꼬리를 덧붙인다)
          while (
            r.qIndexRef.current < questions.length &&
            questions[r.qIndexRef.current].time <= t
          ) {
            const base = questions[r.qIndexRef.current];
            const ctx = pressCtx();
            const seed = r.qIndexRef.current;
            setQuestion({ ...base, text: intensifyQuestion(base.text, ctx, seed, lang) });
            r.qIndexRef.current++;
          }

          // ── 포즈 스프링 (탄성 있는 숙이기)
          let desired: ApologyAction | null = null;
          r.holdLaneRef.current.forEach((id) => {
            const n = noteMap.get(id);
            if (n) desired = deeper(desired, n.action);
          });
          for (const lane of getPressedLanes()) {
            const cfg = LANES[lane];
            if (cfg) desired = deeper(desired, cfg.action);
          }
          const lt = r.lastTapRef.current;
          if (lt && t - lt.time < TAP_POSE_HOLD_SEC) desired = deeper(desired, lt.action);

          const targetAngle = desired === "dogeza" ? 92 : desired ? ANGLE_MAP[desired] : 0;
          r.poseVelRef.current += (targetAngle - r.poseAngleRef.current) * POSE_STIFFNESS;
          r.poseVelRef.current *= POSE_DAMPING;
          r.poseAngleRef.current +=
            r.poseVelRef.current + (targetAngle - r.poseAngleRef.current) * POSE_FOLLOW;

          const isDogeza = desired === "dogeza";
          // P-01: 회전은 DOM 직접 쓰기. 레이아웃(다리·그림자)에 영향이 있는
          // 도게자 여부만 드물게 React state 로 올린다.
          if (isDogeza !== r.dogezaRef.current) {
            r.dogezaRef.current = isDogeza;
            s.setDogezaPose(isDogeza);
          }
          r.kimRef.current?.setPose(r.poseAngleRef.current, isDogeza);

          if (t >= duration) finish();
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
