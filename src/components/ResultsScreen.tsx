import { useCallback, useState } from "react";
import { GRADE_COLORS, JUDGMENTS } from "@/game/constants";
import { MISSIONS, missionText } from "@/game/missions";
import type { GameResult, Judgment } from "@/game/types";
import { tr } from "@/i18n/ui";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface ResultsScreenProps {
  result: GameResult;
  onRetry: () => void;
  onHome: () => void;
}

const ORDER: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];

export default function ResultsScreen({
  result,
  onRetry,
  onHome,
}: ResultsScreenProps) {
  const grade = result.allPerfect ? "DOGEZA MASTER" : result.grade;
  const gradeColor = result.allPerfect ? "#fbbf24" : GRADE_COLORS[result.grade];
  const lastNewlyCompleted = useProgressStore((s) => s.lastNewlyCompleted);
  const claim = useProgressStore((s) => s.claim);
  const claimed = useProgressStore((s) => s.claimed);
  const addPoints = useMetaStore((s) => s.addPoints);
  const lang = useSettingsStore((s) => s.lang);
  const [shared, setShared] = useState(false);

  const shareText =
    `[ApologyPresser] ${grade} · ${result.score.toLocaleString("en-US")}pts · ` +
    `ACC ${(result.accuracy * 100).toFixed(1)}% · COMBO ${result.maxCombo} · ` +
    `PERFECT ${result.counts.PERFECT}#사죄회견 #ApologyPresser`;

  const share = useCallback(() => {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      nav.share({ title: "ApologyPresser", text: shareText }).catch(() => { /* dismissed */ });
      return;
    }
    navigator.clipboard?.writeText(shareText).then(() => {
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }).catch(() => { /* noop */ });
  }, [shareText]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b1220_0%,#070a12_60%,#101827_100%)]" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 30%, rgba(251,191,36,0.16), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        <p className="font-display text-sm uppercase tracking-[0.4em] text-slate-400">
          {result.ending.title}
        </p>
        <p className="mt-2 max-w-md text-center text-sm text-slate-300">
          {result.ending.text}
        </p>

        <div
          className="mt-6 font-display text-8xl leading-none"
          style={{
            color: gradeColor,
            textShadow: `0 0 50px ${gradeColor}66`,
          }}
        >
          {grade}
        </div>

        <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="SCORE" value={result.score.toLocaleString("en-US")} />
          <Stat label="MAX COMBO" value={`${result.maxCombo}`} />
          <Stat
            label="ACCURACY"
            value={`${(result.accuracy * 100).toFixed(1)}%`}
          />
          <Stat label="POINTS" value={`+${result.points ?? 0}P`} />
        </div>

        <div className="mt-3 grid w-full grid-cols-3 gap-3">
          <Stat label="STOCK" value={`¥${Math.round(result.stock).toLocaleString("en-US")}`} />
          <Stat label="DOGEZA" value={`${result.dogezaHits ?? 0}`} />
          <Stat label="STAGE" value={result.stageId ?? "-"} />
        </div>

        <div className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Judgment
          </span>
          <div className="flex gap-3">
            {ORDER.map((j) => (
              <span
                key={j}
                className="text-xs font-bold"
                style={{ color: JUDGMENTS[j].color }}
              >
                {JUDGMENTS[j].label} {result.counts[j]}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onRetry}
            className="rounded-full border border-amber-300/40 bg-amber-400/10 px-8 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20"
          >
            {tr(lang, "res.retry")}
          </button>
          <button
            onClick={share}
            className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-8 py-3 font-display text-xl text-cyan-200 transition hover:bg-cyan-400/20"
          >
            {shared ? tr(lang, "res.shared") : tr(lang, "res.share")}
          </button>
          <button
            onClick={onHome}
            className="rounded-full border border-white/15 bg-white/5 px-8 py-3 font-display text-xl text-slate-300 transition hover:bg-white/10"
          >
            {tr(lang, "res.home")}
          </button>
        </div>

        {lastNewlyCompleted.length > 0 && (
          <div className="mt-4 flex w-full flex-col gap-2 rounded-xl border border-amber-300/20 bg-amber-400/5 p-4">
            <div className="font-display text-lg text-amber-200">{tr(lang, "res.missionDone")}</div>
            {lastNewlyCompleted.map((id) => {
              const m = MISSIONS.find((x) => x.id === id);
              if (!m) return null;
              const isClaimed = claimed[id];
              const text = missionText(m, lang);
              return (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">
                    {text.name} — {text.desc} (+{m.reward}P)
                  </span>
                  {!isClaimed ? (
                    <button
                      onClick={() => addPoints(claim(id))}
                      className="rounded border border-amber-300/40 bg-amber-400/10 px-3 py-1 font-display text-amber-200 hover:bg-amber-400/20"
                    >
                      {tr(lang, "mission.claim")}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">{tr(lang, "mission.claimed")}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl text-white">{value}</div>
    </div>
  );
}
