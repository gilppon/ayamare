import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { JUDGMENTS, type LaneConfig } from "@/game/constants";
import {
  NOTE_HEAD_HEIGHT,
  hitLinePulse,
  layoutNote,
  layoutReceiver,
} from "@/game/noteLayout";
import type { Judgment, Note } from "@/game/types";
import { tr, type Lang } from "@/i18n/ui";
import { LEAD_TIME } from "@/game/visibility";

export interface Popup {
  id: number;
  judgment: Judgment;
  lane: number;
}

export interface Spark {
  id: number;
  lane: number;
  tx: string;
  ty: string;
  color: string;
}

export interface Shockwave {
  id: number;
  lane: number;
}

/** I-07: 정지 링 (모션 감소 모드 대체 피드백) */
export interface SolidRing {
  id: number;
  lane: number;
  color: string;
}

export interface TelegraphItem {
  lane: number;
  kind: NonNullable<Note["gimmick"]>;
  urgency: number;
}

export interface NoteFieldProps {
  lanes: LaneConfig[];
  /** 화면에 보이는 노트 (이미 `visibleNoteWindow` 로 좁힌 것) */
  notes: Note[];
  /** noteId → 상태 맵. 매 프레임 바뀌므로 ref 로 전달 */
  stateOf: (id: number) => string | undefined;
  now: number;
  /** 레인 폭 (px) */
  laneW: number;
  /** 레인 높이 (px) */
  laneH: number;
  hitLineY: number;
  beatPhase: number;
  pressedLanes: readonly number[];
  telegraphs: readonly TelegraphItem[];
  popups: readonly Popup[];
  sparks: readonly Spark[];
  shockwaves: readonly Shockwave[];
  solidRings: readonly SolidRing[];
  lang: Lang;
}

/**
 * 노트 필드 — 레인 배경 / 노트 / 리시버 / 예고 / 판정선 / 판정 팝업 / 스파크 / 쇼크웨이브.
 *
 * Q-02: GameScreen(1,600줄) 에서 프레젠테이션을 분리한다.
 * 좌표·색상 계산은 `game/noteLayout.ts` 순수함수가 담당하므로 이 컴포넌트는
 * JSX 배치만 한다. `stateOf` 는 콜백이라 noteStateRef 변경에도 갱신되지 않는다.
 */
/** P-04: px 문자열은 소수점 1자리로 반올림한다.
 *  60fps 에서 노트는 프레임당 6~7px 이동하므로 그 이하 정밀도는 무의미하고,
 *  매 프레임 새로 만드는 문자열 길이만 늘어난다. */
function ty(y: number): string {
  return `translate3d(0,${Math.round(y * 10) / 10}px,0)`;
}

interface NoteHandles {
  head: HTMLDivElement | null;
  tail: HTMLDivElement | null;
}

interface NoteRowProps {
  noteId: number;
  lane: number;
  laneW: number;
  opacity: number;
  bgColor: string;
  fgColor: string;
  fontSize: number;
  boxShadow: string;
  dashed: boolean;
  label: string;
  showTail: boolean;
  tailH: number;
  laneGlow: string;
  registerHead: (id: number, el: HTMLDivElement | null) => void;
  registerTail: (id: number, el: HTMLDivElement | null) => void;
}

/**
 * P-05: 노트 한 개의 DOM.
 *
 * 이 컴포넌트의 props 는 **프레임마다 바뀌지 않는 값만** 받는다
 * (색·라벨·크기·테일 유무). 프레임마다 바뀌는 세로 위치(`y`/`tailTop`)는
 * props 로 내보내지 않고 부모의 `useLayoutEffect` 가 `transform` 을 직접 쓴다.
 *
 * 그래야 `memo` 가 정상 노트들에 대해 렌더를 건너뛴다. `y` 를 prop 으로 넘기면
 * 매 프레임 전 노트의 style 객체를 새로 만들어 React 가 160개를 다시 조정한다
 * (측정치: 9ms/frame — 프레임 예산의 절반 이상).
 */
const NoteRow = memo(function NoteRow({
  noteId,
  lane,
  laneW,
  opacity,
  bgColor,
  fgColor,
  fontSize,
  boxShadow,
  dashed,
  label,
  showTail,
  tailH,
  laneGlow,
  registerHead,
  registerTail,
}: NoteRowProps) {
  return (
    <div
      className="absolute top-0"
      style={{ left: lane * laneW, width: laneW, opacity }}
    >
      {showTail && (
        <div
          ref={(el) => registerTail(noteId, el)}
          className="absolute top-0 rounded-full"
          style={{
            left: laneW * 0.18,
            width: laneW * 0.64,
            height: Math.max(4, tailH),
            background: laneGlow,
            willChange: "transform",
          }}
        />
      )}
      <div
        ref={(el) => registerHead(noteId, el)}
        className="absolute top-0 flex items-center justify-center rounded-xl font-display"
        style={{
          left: laneW * 0.1,
          width: laneW * 0.8,
          height: NOTE_HEAD_HEIGHT,
          backgroundColor: bgColor,
          color: fgColor,
          fontSize,
          boxShadow,
          border: dashed ? "2px dashed rgba(255,255,255,0.7)" : undefined,
          willChange: "transform",
        }}
      >
        {label}
      </div>
    </div>
  );
});

function NoteFieldImpl({
  lanes,
  notes,
  stateOf,
  now,
  laneW,
  laneH,
  hitLineY,
  beatPhase,
  pressedLanes,
  telegraphs,
  popups,
  sparks,
  shockwaves,
  solidRings,
  lang,
}: NoteFieldProps) {
  const speed = laneH / LEAD_TIME;
  const pulse = hitLinePulse(beatPhase);
  const ghostLabel = tr(lang, "game.ghost");
  const speedLabel = tr(lang, "game.speedup");
  const fakeWarn = tr(lang, "game.fakeWarn");
  const ghostWarn = tr(lang, "game.ghostWarn");
  const speedWarn = tr(lang, "game.speedWarn");

  // 리시버용: 이 레인에 홀드 노트가 잡혀 있는가
  const holdingLanes = new Set<number>();
  for (const n of notes) if (n.hold > 0) holdingLanes.add(n.lane);

  // P-05: 노트별 DOM 핸들. 스크롤로 화면을 벗어난 노트는 언마운트 시 제거된다.
  const handles = useRef(new Map<number, NoteHandles>());
  const registerHead = useCallback((id: number, el: HTMLDivElement | null) => {
    const h = handles.current.get(id) ?? { head: null, tail: null };
    h.head = el;
    if (!el) handles.current.delete(id);
    else handles.current.set(id, h);
  }, []);
  const registerTail = useCallback((id: number, el: HTMLDivElement | null) => {
    const h = handles.current.get(id);
    if (!h) return;
    h.tail = el;
  }, []);

  // 프레임 레이아웃 계산 — 순수 함수 결과를 프레임마다 다시 만든다
  const layouts = useMemo(
    () =>
      notes.map((n) => {
        const lane = lanes[n.lane];
        return layoutNote(n, now, hitLineY, speed, {
          state: stateOf(n.id),
          laneColor: lane.color,
          laneGlow: lane.glow,
          laneLabel: lane.label,
          ghostLabel,
          speedLabel,
        });
      }),
    [notes, now, hitLineY, speed, lanes, stateOf, ghostLabel, speedLabel]
  );

  // P-05: 위치만 직접 갱신. React 는 이 값에 관여하지 않는다.
  useLayoutEffect(() => {
    const map = handles.current;
    for (let i = 0; i < notes.length; i++) {
      const h = map.get(notes[i].id);
      const l = layouts[i];
      if (!h || !l) continue;
      const y = ty(l.y - NOTE_HEAD_HEIGHT / 2);
      if (h.head && h.head.style.transform !== y) h.head.style.transform = y;
      if (h.tail) {
        const t = ty(l.tailTop);
        if (h.tail.style.transform !== t) h.tail.style.transform = t;
      }
    }
  });

  return (
    <>
      {/* 레인 배경 */}
      {lanes.map((l) => {
        const isPressed = pressedLanes.includes(l.lane);
        return (
          <div
            key={l.lane}
            className="pointer-events-none absolute top-0 h-full transition-opacity duration-75"
            style={{
              left: `${l.lane * 25}%`,
              width: "25%",
              borderLeft: l.lane > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
              background: isPressed
                ? `linear-gradient(180deg, transparent 20%, ${l.glow} 100%)`
                : "linear-gradient(180deg, rgba(255,255,255,0.02), transparent 80%)",
              opacity: isPressed ? 0.35 : 1,
            }}
          />
        );
      })}

      {/* 노트 — P-05: 위치는 layoutNote 결과지만 prop 으로 내보내지 않는다 */}
      {notes.map((n, i) => {
        const lane = lanes[n.lane];
        const l = layouts[i];
        return (
          <NoteRow
            key={n.id}
            noteId={n.id}
            lane={n.lane}
            laneW={laneW}
            opacity={l.opacity}
            bgColor={l.bgColor}
            fgColor={l.fgColor}
            fontSize={l.fontSize}
            boxShadow={l.boxShadow}
            dashed={l.dashed}
            label={l.label}
            showTail={l.showTail}
            tailH={l.tailH}
            laneGlow={lane.glow}
            registerHead={registerHead}
            registerTail={registerTail}
          />
        );
      })}

      {/* I-05: 레인별 리시버 바 — 어디를 쳐야 하는지 시각적으로 고정 */}
      {lanes.map((l) => {
        const rx = layoutReceiver(
          l.color,
          l.glow,
          pressedLanes.includes(l.lane),
          holdingLanes.has(l.lane)
        );
        return (
          <div
            key={`rx-${l.lane}`}
            className="pointer-events-none absolute"
            style={{ left: `${l.lane * 25}%`, width: "25%", top: hitLineY - 3, height: 26 }}
          >
            <div
              className="absolute inset-x-[8%] bottom-0 h-2.5 rounded-b-lg transition-all duration-100"
              style={{
                background: rx.background,
                boxShadow: rx.boxShadow,
                opacity: rx.opacity,
              }}
            />
            {rx.holding && (
              <div
                className="absolute inset-x-[18%] bottom-2.5 h-1 rounded-full"
                style={{ background: l.color, opacity: 0.5 }}
              />
            )}
          </div>
        );
      })}

      {/* U-03: 기믹 예고 — 레인 상단 경고 마커 */}
      {telegraphs.map((t, i) => {
        const color = t.kind === "fake" ? "#cbd5e1" : "#fbbf24";
        const text =
          t.kind === "fake" ? fakeWarn : t.kind === "invisible" ? ghostWarn : speedWarn;
        return (
          <div
            key={`tg-${t.lane}-${i}`}
            className="pointer-events-none absolute flex flex-col items-center gap-0.5"
            style={{
              left: `${t.lane * 25}%`,
              width: "25%",
              top: 2,
              opacity: Math.min(1, 0.35 + t.urgency * 0.65),
            }}
          >
            <span
              className="animate-count font-display text-lg leading-none"
              style={{
                color,
                textShadow: `0 0 12px ${t.kind === "fake" ? "#94a3b8" : "#fbbf24"}`,
              }}
            >
              ▲
            </span>
            <span
              className="text-[9px] font-bold"
              style={{ color: t.kind === "fake" ? "#cbd5e1" : "#fde68a" }}
            >
              {text}
            </span>
          </div>
        );
      })}

      {/* I-07: 정지 링 — 위치 변화 없이 색·투명도만 바뀌는 대체 피드백.
          모션 감소 모드에서 파티클/셰이크가 걷혔을 때 "무언가 일어났다" 를 남긴다. */}
      {solidRings.map((r) => (
        <div
          key={`ring-${r.id}`}
          className="pointer-events-none absolute"
          style={{
            left: `${r.lane * 25}%`,
            width: "25%",
            top: hitLineY - 14,
            height: 28,
          }}
        >
          <div
            className="absolute inset-x-[12%] bottom-0 h-2 rounded-b-md"
            style={{
              background: r.color,
              boxShadow: `0 0 16px ${r.color}`,
              animation: "solid-ring-fade 0.38s ease-out forwards",
            }}
          />
          <div
            className="absolute inset-x-[6%] bottom-1 h-5 rounded-b-lg border-b-2"
            style={{
              borderColor: r.color,
              animation: "solid-ring-fade 0.38s ease-out forwards",
            }}
          />
        </div>
      ))}

      {/* 판정선 */}
      <div
        className="absolute inset-x-0"
        style={{
          top: hitLineY,
          height: 2,
          background: `rgba(255,255,255,${pulse})`,
          boxShadow: `0 0 16px rgba(255,255,255,${(pulse * 0.9).toFixed(2)})`,
        }}
      />

      {/* 판정 팝업 */}
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

      {/* 스파크 */}
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
            ["--tx" as never]: s.tx,
            ["--ty" as never]: s.ty,
          }}
        />
      ))}

      {/* 쇼크웨이브 — PERFECT 파동 링 */}
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
    </>
  );
}

/**
 * P-04: 노트 헤드·테일의 세로 위치는 `top` 이 아니라 `translate3d` 로 준다.
 *
 * `top` 은 레이아웃 속성이라 값이 바뀌면 프레임마다 레이아웃 재계산이 걸린다.
 * `transform` 은 합성 단계에서 처리되어 노트가 많아도 레이아웃 비용이 늘지 않고,
 * `will-change: transform` 으로 레이어 승격까지 해 페인트 범위를 노트 크기로 제한한다.
 *
 * 성능 프로브(`notePerf.test.tsx`) 결과 160노트에서 React 조정 비용이 4.6ms 로
 * 예산 안이므로 병목은 조정 이 아니라 레이아웃/페인트 였다. 그래서 Canvas 전면
 * 재작성(P-03) 대신 이 저비용 전환으로 같은 병목을 제거한다.
 */

/** 리드타임은 `visibility.LEAD_TIME` 을 단일 소스로 쓴다 (중복 정의 금지). */

export default memo(NoteFieldImpl);
