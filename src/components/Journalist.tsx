import { memo } from "react";
import { JOURNALISTS, JOURNALIST_NAMES } from "@/game/constants";
import { useSettingsStore } from "@/stores/settingsStore";
import type { JournalistType } from "@/game/types";

interface JournalistProps {
  type: JournalistType;
  text: string;
}

export default memo(function Journalist({ type, text }: JournalistProps) {
  const info = JOURNALISTS[type];
  const lang = useSettingsStore((s) => s.lang);

  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xl"
        style={{
          backgroundColor: `${info.color}1f`,
          borderColor: `${info.color}66`,
        }}
      >
        🎤
      </div>
      <div className="relative rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-3 shadow-2xl backdrop-blur">
        <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-b border-l border-white/10 bg-slate-900/90" />
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: info.color }}>
            {JOURNALIST_NAMES[lang][type]}
          </span>
          <span className="text-xs tracking-tight text-amber-400">
            {info.stars}
          </span>
        </div>
        <p className="text-sm font-bold leading-snug text-white sm:text-base">
          “{text}”
        </p>
      </div>
    </div>
  );
});
