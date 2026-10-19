import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRADE_COLORS, JUDGMENTS, stageLabelFor } from "@/game/constants";
import { MISSIONS, missionText } from "@/game/missions";
import type { GameResult, Judgment, JudgmentCounts } from "@/game/types";
import { tr, type Lang } from "@/i18n/ui";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface ResultsScreenProps {
  result: GameResult;
  onRetry: () => void;
  onHome: () => void;
}

/** U-08: 표시용 스테이지 라벨 (custom:<타임스탬프> 같은 내부 ID 를 그대로 노출하지 않음) */
const stageLabel = (stageId: string, lang: Lang): string => stageLabelFor(stageId, lang);

const ORDER: Judgment[] = ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"];

/** 결과 화면에 노출할 통합 판정 집계 (홀드가 없는 차트면 릴리즈 없음) */
function totalCounts(r: GameResult): { tap: JudgmentCounts; release: JudgmentCounts | null } {
  return { tap: r.counts, release: r.releaseCounts ?? null };
}

export default function ResultsScreen({
  result,
  onRetry,
  onHome,
}: ResultsScreenProps) {
  const gradeColor = result.allPerfect ? "#fbbf24" : GRADE_COLORS[result.grade];
  const lastNewlyCompleted = useProgressStore((s) => s.lastNewlyCompleted);
  const claim = useProgressStore((s) => s.claim);
  const claimed = useProgressStore((s) => s.claimed);
  const addPoints = useMetaStore((s) => s.addPoints);
  const lang = useSettingsStore((s) => s.lang);
  const [shared, setShared] = useState(false);
  const grade = result.allPerfect ? tr(lang, "res.dogezaMaster") : result.grade;

  const { tap, release } = totalCounts(result);
  const tapTotal = ORDER.reduce((a, j) => a + tap[j], 0);

  // U-08: 신기록 판정.
  // `bestByStage` 는 onFinish 에서 이미 갱신된 "현재" 값이라 비교하면
  // 최고점과 **동점**이어도 신기록이 된다. 갱신 전 값으로 판정한
  // `lastRunNewRecord` 를 신뢰한다.
  const isNewRecord = useProgressStore((s) => s.lastRunNewRecord);

  const releaseTotal = release ? ORDER.reduce((a, j) => a + release[j], 0) : 0;
  const forced = result.forcedReleases ?? 0;

  const shareText = useMemo(
    () =>
      `[SUMIMASEN] ${stageLabel(result.stageId, lang)} ${grade} · ` +
      `${result.score.toLocaleString(lang)}pts · ` +
      `ACC ${(result.accuracy * 100).toFixed(1)}% · COMBO ${result.maxCombo}` +
      tr(lang, "res.shareTag"),
    [result.stageId, result.score, result.accuracy, result.maxCombo, grade, lang]
  );

  // 공유 확인 메시지를 되돌리는 타이머 (언마운트 시 정리)
  const sharedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (sharedTimer.current !== null) window.clearTimeout(sharedTimer.current);
    },
    []
  );

  const share = useCallback(() => {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      // 모바일 표준 경로. 이 전에 `return` 해서 "복사됨" 표시가 죽어 있었다.
      nav
        .share({ title: "SUMIMASEN", text: shareText })
        .then(() => setShared(true))
        .catch(() => { /* dismissed */ });
    } else {
      navigator.clipboard?.writeText(shareText).then(() => {
        setShared(true);
      }).catch(() => { /* noop */ });
    }
    if (sharedTimer.current !== null) window.clearTimeout(sharedTimer.current);
    sharedTimer.current = window.setTimeout(() => setShared(false), 1800);
  }, [shareText]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto px-6 py-6">
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

        <div className="relative mt-6">
          <div
            className="font-display text-8xl leading-none"
            style={{
              color: gradeColor,
              textShadow: `0 0 50px ${gradeColor}66`,
            }}
          >
            {grade}
          </div>
          {/* U-08: 신기록 배지 */}
          {isNewRecord && (
            <span className="absolute -right-24 -top-2 animate-count rounded-full border border-amber-300/50 bg-amber-400/15 px-3 py-1 font-display text-sm text-amber-200">
              {tr(lang, "res.newRecord")}
            </span>
          )}
        </div>

        <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={tr(lang, "res.score")} value={result.score.toLocaleString(lang)} />
          <Stat label={tr(lang, "res.maxCombo")} value={`${result.maxCombo}`} />
          <Stat
            label={tr(lang, "res.accuracy")}
            value={`${(result.accuracy * 100).toFixed(1)}%`}
          />
          <Stat label={tr(lang, "res.points")} value={`+${result.points ?? 0}P`} />
        </div>

        <div className="mt-3 grid w-full grid-cols-3 gap-3">
          <Stat label={tr(lang, "hud.stock")} value={`¥${Math.round(result.stock).toLocaleString(lang)}`} />
          <Stat label={tr(lang, "rec.dogeza")} value={`${result.dogezaHits ?? 0}`} />
          <Stat label={tr(lang, "res.stage")} value={stageLabelFor(result.stageId, lang)} />
        </div>

        {/* U-08: 판정 분포 시각화 */}
        <div className="mt-4 w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {tr(lang, "res.judgment")}
            </span>
            <span className="text-[10px] text-slate-500">{tapTotal} {tr(lang, "ed.noteUnit")}</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            {ORDER.map((j) => {
              const n = tap[j];
              if (n <= 0) return null;
              return (
                <div
                  key={j}
                  title={`${JUDGMENTS[j].label} ${n}`}
                  style={{
                    width: `${(n / Math.max(1, tapTotal)) * 100}%`,
                    backgroundColor: JUDGMENTS[j].color,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {ORDER.map((j) => (
              <span
                key={j}
                className="text-xs font-bold"
                style={{ color: JUDGMENTS[j].color }}
              >
                {JUDGMENTS[j].label} {tap[j]}
              </span>
            ))}
          </div>
        </div>

        {/* U-08/B-01/B-08: 홀드 릴리즈 통계 + 강제 해제 경고 */}
        {releaseTotal > 0 && (
          <div className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {tr(lang, "res.release")}
              </span>
              <span className="text-[10px] text-slate-500">{releaseTotal}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ORDER.map((j) =>
                release && release[j] > 0 ? (
                  <span
                    key={j}
                    className="text-xs font-bold"
                    style={{ color: JUDGMENTS[j].color }}
                  >
                    {JUDGMENTS[j].label} {release[j]}
                  </span>
                ) : null
              )}
            </div>
            {forced > 0 && (
              <p className="mt-2 rounded-lg bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                {tr(lang, "res.forcedRelease", { n: forced })}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-3 text-center">
      <div className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate font-display text-2xl text-white">{value}</div>
    </div>
  );
}
