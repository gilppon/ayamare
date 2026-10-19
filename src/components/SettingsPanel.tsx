import { useEffect, useRef, useState } from "react";
import { LANES, LANE_NAMES, isBindableKey } from "@/game/constants";
import { LANGS, tr } from "@/i18n/ui";
import { DEFAULT_KEYS, useSettingsStore } from "@/stores/settingsStore";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const timingScale = useSettingsStore((s) => s.timingScale);
  const setTimingScale = useSettingsStore((s) => s.setTimingScale);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);
  const setReduceMotionUserSet = useSettingsStore((s) => s.setReduceMotionUserSet);
  const colorblind = useSettingsStore((s) => s.colorblind);
  const setColorblind = useSettingsStore((s) => s.setColorblind);
  const haptics = useSettingsStore((s) => s.haptics);
  const setHaptics = useSettingsStore((s) => s.setHaptics);
  const keyMap = useSettingsStore((s) => s.keyMap);
  const setKeyBinding = useSettingsStore((s) => s.setKeyBinding);
  const resetKeys = useSettingsStore((s) => s.resetKeys);
  const lang = useSettingsStore((s) => s.lang);
  const setLang = useSettingsStore((s) => s.setLang);
  const voice = useSettingsStore((s) => s.voice);
  const setVoice = useSettingsStore((s) => s.setVoice);

  const [rebindLane, setRebindLane] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // M-09: 모달이 Escape 로 닫히고 포커스가 안으로 들어오게 한다.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const laneKeyLabel = (lane: number) => {
    for (const [k, v] of Object.entries(keyMap)) {
      if (v === lane) return k === " " ? "SPACE" : k.toUpperCase();
    }
    return "?";
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={tr(lang, "settings.title")}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-white">{tr(lang, "settings.title")}</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white"
          >
            {tr(lang, "settings.close")}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">{tr(lang, "settings.language")}</span>
            <div className="flex gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLang(l.id)}
                  className={`rounded-lg border px-3 py-1 text-xs transition ${
                    lang === l.id
                      ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                      : "border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-slate-300">
              {tr(lang, "settings.timing", { v: timingScale.toFixed(2) })}
              <span className="ml-2 text-xs text-slate-500">{tr(lang, "settings.timingRange")}</span>
            </span>
            <input
              type="range"
              min={0.8}
              max={1.5}
              step={0.05}
              value={timingScale}
              onChange={(e) => setTimingScale(parseFloat(e.target.value))}
            />
          </label>

          <Toggle
            label={tr(lang, "settings.motion")}
            value={reduceMotion}
            onChange={(v) => {
              // OS 의 prefers-reduced-motion 을 더 이상 따르지 않는다
              setReduceMotionUserSet(true);
              setReduceMotion(v);
            }}
          />
          <Toggle label={tr(lang, "settings.colorblind")} value={colorblind} onChange={setColorblind} />
          <Toggle label={tr(lang, "settings.haptics")} value={haptics} onChange={setHaptics} />
          <Toggle label={tr(lang, "settings.voice")} value={voice} onChange={setVoice} />

          <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-slate-300">{tr(lang, "settings.keymap")}</span>
              <button
                onClick={resetKeys}
                className="rounded border border-white/10 px-2 py-0.5 text-xs text-slate-400 hover:text-white"
              >
                {tr(lang, "settings.reset")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LANES.map((l) => (
                <button
                  key={l.lane}
                  onClick={() => setRebindLane(l.lane)}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    rebindLane === l.lane
                      ? "border-amber-300 bg-amber-400/10 text-amber-200"
                      : "border-white/10 bg-slate-900 text-slate-300"
                  }`}
                >
                  <div className="text-xs text-slate-500">{l.label} · {LANE_NAMES[lang][l.action]}</div>
                  <div className="font-display text-lg">
                    {rebindLane === l.lane ? tr(lang, "settings.pressKey") : laneKeyLabel(l.lane)}
                  </div>
                </button>
              ))}
            </div>
            {rebindLane !== null && (
              <input
                autoFocus
                value=""
                readOnly
                aria-label={tr(lang, "settings.pressKey")}
                className="mt-2 w-full rounded border border-amber-300/40 bg-black/40 px-2 py-1 text-xs text-amber-200 outline-none"
                onKeyDown={(e) => {
                  e.preventDefault();
                  if (e.key === "Escape") {
                    setRebindLane(null);
                    return;
                  }
                  if (!isBindableKey(e.key)) return;
                  const k = e.key === " " ? " " : e.key.toLowerCase();
                  setKeyBinding(k, rebindLane);
                  setRebindLane(null);
                }}
                onBlur={() => setRebindLane(null)}
              />
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              {tr(lang, "settings.defaultKeys")} {Object.entries(DEFAULT_KEYS).map(([k, v]) => `${k === " " ? "SPACE" : k.toUpperCase()}→${v + 1} `).join("· ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition ${value ? "bg-emerald-500" : "bg-slate-700"}`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}
