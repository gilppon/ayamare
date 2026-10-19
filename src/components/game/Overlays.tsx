import { memo } from "react";
import { LANE_NAMES, type LaneConfig } from "@/game/constants";
import { keyLabelFor } from "@/game/keyLabel";
import { tr, type Lang } from "@/i18n/ui";
import type { KeyMap } from "@/stores/settingsStore";

export interface CountdownOverlayProps {
  /** "ready" | "3" | "2" | "1" | "GO!" | null */
  code: string | null;
  label: string | null;
  title: string;
}

/** 카운트다운 — 비트 도트 + 곡 제목 (U-01 진행감) */
export const CountdownOverlay = memo(function CountdownOverlay({
  code,
  label,
  title,
}: CountdownOverlayProps) {
  if (!code || !label) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3">
      <span
        key={code}
        className="animate-count font-display text-7xl text-white sm:text-8xl"
        style={{ textShadow: "0 0 30px rgba(251,191,36,0.7)" }}
      >
        {label}
      </span>
      <div className="flex gap-2">
        {[3, 2, 1].map((b) => (
          <span
            key={b}
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                code === String(b) || (code === "GO!" && b === 1)
                  ? "#fbbf24"
                  : "rgba(255,255,255,0.2)",
              boxShadow: code === String(b) ? "0 0 12px #fbbf24" : "none",
            }}
          />
        ))}
      </div>
      <span className="font-display text-sm tracking-[0.3em] text-slate-400">{title}</span>
    </div>
  );
});

export interface ReadyOverlayProps {
  lanes: LaneConfig[];
  keyMap: KeyMap;
  lang: Lang;
  title: string;
  subtitle: string;
  onStart: () => void;
}

/** 대기 오버레이 — 조작법 안내 + 시작 */
export const ReadyOverlay = memo(function ReadyOverlay({
  lanes,
  keyMap,
  lang,
  title,
  subtitle,
  onStart,
}: ReadyOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/70 px-6 backdrop-blur-sm">
      <p className="font-display text-4xl text-white">
        {tr(lang, "game.readyA")} <span className="text-rose-400">{tr(lang, "game.readyB")}</span>
      </p>
      <p className="-mt-3 font-display text-sm tracking-[0.3em] text-slate-500">
        {title} · {subtitle}
      </p>
      <p className="max-w-md text-center text-sm leading-relaxed text-slate-300">
        {tr(lang, "game.readyDesc")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {lanes.map((l) => (
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
              {keyLabelFor(keyMap, l.lane, l.keyLabel)}
            </kbd>
            <span className="font-display text-xl" style={{ color: l.color }}>
              {l.label}
            </span>
            <span className="text-[10px] text-slate-400">{LANE_NAMES[lang][l.action]}</span>
          </div>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-slate-500">{tr(lang, "game.imeNote")}</p>
      <button
        onClick={onStart}
        className="animate-ring rounded-full border border-amber-300/40 bg-amber-400/10 px-8 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20"
      >
        {tr(lang, "game.start")}
      </button>
    </div>
  );
});

/** 종료 오버레이 — 결과 집계 대기 */
export const DoneOverlay = memo(function DoneOverlay({ lang }: { lang: Lang }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
      <p className="font-display text-5xl text-white">{tr(lang, "game.done")}</p>
      <p className="mt-2 text-slate-400">{tr(lang, "game.tally")}</p>
    </div>
  );
});

export interface PauseOverlayProps {
  lang: Lang;
  onResume: () => void;
  onQuit: () => void;
}

/** U-01 일시정지 오버레이 — Escape 또는 탭 전환으로 진입 */
export const PauseOverlay = memo(function PauseOverlay({
  lang,
  onResume,
  onQuit,
}: PauseOverlayProps) {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/80 px-6 backdrop-blur-sm">
      <p className="font-display text-6xl text-white" role="status" aria-live="polite">
        {tr(lang, "game.paused")}
      </p>
      <p className="max-w-md text-center text-sm leading-relaxed text-slate-400">
        {tr(lang, "game.pauseDesc")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onResume}
          autoFocus
          className="animate-ring rounded-full border border-amber-300/40 bg-amber-400/10 px-8 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20"
        >
          {tr(lang, "game.resume")}
        </button>
        <button
          onClick={onQuit}
          className="rounded-full border border-white/15 bg-white/5 px-8 py-3 font-display text-xl text-slate-300 transition hover:bg-white/10"
        >
          {tr(lang, "game.quitRun")}
        </button>
      </div>
    </div>
  );
});

/** U-04: 판정 결과를 스크린리더에 알리는 live region */
export const LiveJudgment = memo(function LiveJudgment({ text }: { text: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
});
