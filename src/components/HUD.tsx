import { memo } from "react";
import { tr } from "@/i18n/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import type { SnsItem } from "@/game/types";

interface StockPanelProps {
  stock: number;
  delta: number;
  history: number[];
}

export const StockPanel = memo(function StockPanel({ stock, delta, history }: StockPanelProps) {
  const lang = useSettingsStore((s) => s.lang);
  const up = delta >= 0;
  const min = history.length ? Math.min(...history) : 0;
  const max = history.length ? Math.max(...history) : 1;
  const range = Math.max(1, max - min);
  const points = history.length
    ? history
        .map((v, i) => {
          const x = (i / Math.max(1, history.length - 1)) * 120;
          const y = 30 - ((v - min) / range) * 26 - 2;
          return `${x},${y}`;
        })
        .join(" ")
    : "";

  return (
    <div className="w-44 rounded-2xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {tr(lang, "hud.stock")}
        </span>
        <span className="text-[11px] text-slate-500">{tr(lang, "hud.stockSub")}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-2xl text-white">
          ¥{Math.round(stock).toLocaleString("en-US")}
        </span>
        <span
          className={`text-xs font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}
        >
          {up ? "▲" : "▼"}
          {(delta * 100).toFixed(1)}%
        </span>
      </div>
      <svg viewBox="0 0 120 32" className="mt-1 h-8 w-full">
        <polyline
          points={points}
          fill="none"
          stroke={up ? "#34d399" : "#fb7185"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});

interface AngerMeterProps {
  anger: number;
}

export const AngerMeter = memo(function AngerMeter({ anger }: AngerMeterProps) {
  const lang = useSettingsStore((s) => s.lang);
  const clamped = Math.max(0, Math.min(100, anger));
  const color =
    clamped >= 80
      ? "#f43f5e"
      : clamped >= 55
      ? "#fb923c"
      : clamped >= 30
      ? "#facc15"
      : "#34d399";

  return (
    <div className="w-44 rounded-2xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {tr(lang, "hud.anger")}
        </span>
        <span className="text-sm">
          {"🔥".repeat(clamped >= 80 ? 5 : clamped >= 60 ? 4 : clamped >= 40 ? 3 : clamped >= 20 ? 2 : 1)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
        <span className="font-display text-lg text-white">
          {Math.round(clamped)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{tr(lang, "hud.angerSub")}</p>
    </div>
  );
});

interface SnsFeedProps {
  items: SnsItem[];
}

const TONE_COLOR: Record<SnsItem["tone"], string> = {
  positive: "#34d399",
  negative: "#fb7185",
  neutral: "#94a3b8",
};

export const SnsFeed = memo(function SnsFeed({ items }: SnsFeedProps) {
  const lang = useSettingsStore((s) => s.lang);
  return (
    <div className="flex w-60 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Live SNS
        </span>
        <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
          {tr(lang, "hud.tag")}
        </span>
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className="animate-slide-in rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-left backdrop-blur"
        >
          <span
            className="mr-1.5 text-xs font-bold"
            style={{ color: TONE_COLOR[item.tone] }}
          >
            {item.user}
          </span>
          <span className="text-xs leading-snug text-slate-300">{item.text}</span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2 text-xs text-slate-500">
          {tr(lang, "hud.waiting")}
        </div>
      )}
    </div>
  );
});
