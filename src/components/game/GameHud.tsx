import { memo } from "react";
import { LANE_NAMES, type ComboTier, type LaneConfig } from "@/game/constants";
import { keyLabelFor } from "@/game/keyLabel";
import type { SnsItem } from "@/game/types";
import { tr, type Lang } from "@/i18n/ui";
import type { KeyMap } from "@/stores/settingsStore";
import { AngerMeter, SnsFeed, StockPanel } from "../HUD";

export interface TopHudProps {
  phase: "ready" | "playing" | "done";
  lang: Lang;
  score: number;
  combo: number;
  tier: ComboTier | null;
  helperOn: boolean;
  onPause: () => void;
  onQuit: () => void;
}

/**
 * 좌상단 제어(일시정지/나가기) + 점수/콤보/DDA 배지.
 * Q-02: GameScreen 에서 HUD 프레젠테이션 분리.
 */
export const TopHud = memo(function TopHud({
  phase,
  lang,
  score,
  combo,
  tier,
  helperOn,
  onPause,
  onQuit,
}: TopHudProps) {
  return (
    <>
      <div className="absolute left-4 top-3 z-40 flex gap-2">
        <button
          onClick={onPause}
          disabled={phase !== "playing"}
          className="rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-400 backdrop-blur transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={tr(lang, "game.pause")}
        >
          {tr(lang, "game.pauseBtn")}
        </button>
        <button
          onClick={onQuit}
          className="rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-400 backdrop-blur transition hover:text-white"
        >
          {tr(lang, "game.quit")}
        </button>
      </div>

      <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 text-center">
        <div className="font-display text-3xl text-white drop-shadow">
          {score.toLocaleString("en-US")}
        </div>
        {helperOn && (
          <div className="mx-auto mt-0.5 w-fit rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
            {tr(lang, "game.helper")}
          </div>
        )}
        {combo >= 2 && (
          <div className="flex items-center justify-center gap-2">
            <span className="font-display text-xl text-amber-300">
              {combo} {tr(lang, "hud.combo")}
            </span>
            {tier && (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-200/90">
                {tier.name}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
});

export interface SidePanelsProps {
  sns: SnsItem[];
  stock: number;
  stockDelta: number;
  stockHistory: number[];
  anger: number;
}

/** 좌측 SNS 피드 + 우측 주가/분노 패널 */
export const SidePanels = memo(function SidePanels({
  sns,
  stock,
  stockDelta,
  stockHistory,
  anger,
}: SidePanelsProps) {
  return (
    <>
      {/* SNS feed — 모바일에서는 공간 확보를 위해 숨김 */}
      <div className="absolute left-4 top-12 z-30 hidden md:block">
        <SnsFeed items={sns} />
      </div>

      {/* stock + anger — 모바일에서 컴팩트 */}
      <div className="absolute right-2 top-2 z-30 flex scale-90 flex-col items-end gap-2 origin-top-right sm:right-4 sm:top-3 sm:scale-100">
        <StockPanel stock={stock} delta={stockDelta} history={stockHistory} />
        <AngerMeter anger={anger} />
      </div>
    </>
  );
});

export interface LaneKeysProps {
  lanes: LaneConfig[];
  keyMap: KeyMap;
  lang: Lang;
  pressedLanes: readonly number[];
  onPress: (lane: number, pointerId?: number) => void;
  onRelease: (lane: number, pointerId?: number) => void;
}

/**
 * 하단 레인 키.
 * B-07: 포인터 ID 로 레인 상태를 추적 (같은 레인에 손가락 2개가 닿아도 안전).
 * U-05: 레인/키 조합을 aria-label 로 노출, 눌림 상태를 aria-pressed 로.
 */
export const LaneKeys = memo(function LaneKeys({
  lanes,
  keyMap,
  lang,
  pressedLanes,
  onPress,
  onRelease,
}: LaneKeysProps) {
  return (
    <div
      role="group"
      aria-label={tr(lang, "game.laneKeys")}
      className="absolute inset-x-0 bottom-0 z-30 flex h-16 touch-none select-none"
    >
      {lanes.map((l) => {
        const isPressed = pressedLanes.includes(l.lane);
        const customLabel = keyLabelFor(keyMap, l.lane, l.keyLabel);
        return (
          <button
            key={l.lane}
            type="button"
            aria-label={`${LANE_NAMES[lang][l.action]} (${customLabel})`}
            aria-pressed={isPressed}
            onPointerDown={(e) => {
              e.preventDefault();
              // currentTarget 로 캡처 — e.target 은 내부 kbd 일 수 있다
              e.currentTarget.setPointerCapture?.(e.pointerId);
              onPress(l.lane, e.pointerId);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              onRelease(l.lane, e.pointerId);
            }}
            onPointerCancel={(e) => onRelease(l.lane, e.pointerId)}
            onPointerLeave={(e) => {
              // 캡처가 없는 환경에서 버튼 밖으로 빠져나가면 놓친 것으로 처리
              if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                onRelease(l.lane, e.pointerId);
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 select-none border-t border-white/10 transition-all duration-75 active:scale-95 ${
              isPressed ? "bg-white/20" : "bg-slate-950/80 hover:bg-white/5 active:bg-white/10"
            }`}
            style={{
              borderRight: l.lane < 3 ? "1px solid rgba(255,255,255,0.06)" : undefined,
              boxShadow: isPressed ? `inset 0 0 20px ${l.glow}` : undefined,
              minHeight: 56,
            }}
          >
            <span className="pointer-events-none flex items-center gap-1.5">
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
            <span className="pointer-events-none hidden text-[10px] text-slate-400 sm:inline">
              {LANE_NAMES[lang][l.action]}
            </span>
          </button>
        );
      })}
    </div>
  );
});

/** 기자 말풍선 위치 */
export function ReporterSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-1/2 top-[13vh] z-20 w-full max-w-2xl -translate-x-1/2 px-4">
      {children}
    </div>
  );
}

export interface ReactionProps {
  reaction: { id: number; text: string; tone: "bad" | "good" } | null;
}

/** 기자 반응 한 줄 (MISS/BAD 추궁, 칭찬) */
export const ReactionLine = memo(function ReactionLine({ reaction }: ReactionProps) {
  if (!reaction) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[34vh] z-40 -translate-x-1/2">
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
    </div>
  );
});

export interface CameraFlash {
  id: number;
  x: number;
  y: number;
}

/** 카메라 플래시 (기고 노는 분위기 연출) */
export const CameraFlashes = memo(function CameraFlashes({
  flashes,
}: {
  flashes: readonly CameraFlash[];
}) {
  return (
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
  );
});
