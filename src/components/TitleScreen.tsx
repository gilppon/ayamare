import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { LANES, stageLabelFor } from "@/game/constants";
import { STAGES, prevStage, stageTitleKey, unlockProgress } from "@/game/progression";
import { getDailyKey } from "@/game/daily";
import { MISSIONS, isMissionComplete, missionProgress, missionText } from "@/game/missions";
import { SKILLS, skillText, type SkillCategory } from "@/game/skills";
import type { SkillType } from "@/game/types";
import { tr } from "@/i18n/ui";
import ManagerKim from "./ManagerKim";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore, useUnlocks } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface TitleScreenProps {
  points: number;
  ownedSkills: SkillType[];
  equippedSkill: SkillType;
  onBuy: (skillId: SkillType, cost: number) => void;
  onEquip: (skillId: SkillType) => void;
  onStart: (stageId: string, custom?: never) => void;
  onEditor: () => void;
}

type Tab = "stage" | "shop" | "mission" | "records";

/** 호위 김부장: 15°→45°→90°→도게자 반복 숙이기 각도 (모듈 상수 — 렌더마다 만들지 않는다) */
const BOW_LOOP = [26, 52, 80, 92];

const TABS: { id: Tab; labelKey: "title.tabStage" | "title.tabShop" | "title.tabMission" | "title.tabRecords" }[] = [
  { id: "stage", labelKey: "title.tabStage" },
  { id: "shop", labelKey: "title.tabShop" },
  { id: "mission", labelKey: "title.tabMission" },
  { id: "records", labelKey: "title.tabRecords" },
];

const SHOP_CATS: { id: SkillCategory; labelKey: "shop.timing" | "shop.combo" | "shop.mental" }[] = [
  { id: "timing", labelKey: "shop.timing" },
  { id: "combo", labelKey: "shop.combo" },
  { id: "mental", labelKey: "shop.mental" },
];

export default function TitleScreen({ points, ownedSkills, equippedSkill, onBuy, onEquip, onStart, onEditor }: TitleScreenProps) {
  const [tab, setTab] = useState<Tab>("stage");
  const dailyKey = getDailyKey();
  const lang = useSettingsStore((s) => s.lang);
  const streak = useProgressStore((s) => s.streak);
  const claimed = useProgressStore((s) => s.claimed);
  const claim = useProgressStore((s) => s.claim);
  const addPoints = useMetaStore((s) => s.addPoints);
  const runHistory = useProgressStore((s) => s.runHistory);
  const bestByStage = useProgressStore((s) => s.bestByStage);
  /** C: 해금은 저장하지 않고 `bestByStage` 에서 파생한다 (단일 진실) */
  const { unlocked } = useUnlocks();
  // 호위 김부장: 15°→45°→90°→도게자 반복 숙이기 + 클릭 이스터에그
  const [bowStep, setBowStep] = useState(1);
  const [easter, setEaster] = useState(false);
  // L-14: 이 아이들러가 도는 동안 **기록 탭을 읽는 동안에도** 트리 전체가
  // 1.1초마다 리렌더된다 (미션/베스트/상점 전부 재계산).
  // 레인 조작이 없는 탭에서는 아이들러가 필요 없으므로 멈춘다.
  useEffect(() => {
    if (easter || tab !== "stage") return;
    const id = window.setInterval(() => setBowStep((s) => (s + 1) % BOW_LOOP.length), 1100);
    return () => window.clearInterval(id);
  }, [easter, tab]);
  useEffect(() => {
    if (!easter) return;
    const id = window.setTimeout(() => setEaster(false), 1600);
    return () => window.clearTimeout(id);
  }, [easter]);
  const kimAngle = easter ? 92 : BOW_LOOP[bowStep];
  const kimDogeza = easter || BOW_LOOP[bowStep] >= 92;
  const snapshot = useProgressStore(
    useShallow((s) => ({
      totalRuns: s.totalRuns,
      bestCombo: s.bestCombo,
      totalDogeza: s.totalDogeza,
      totalPerfect: s.totalPerfect,
      bestAccuracy: s.bestAccuracy,
      dailyRuns: s.dailyRuns,
      singlePerfectBest: s.singlePerfectBest,
    }))
  );

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-y-auto px-6 py-8">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <img src="/bg.jpg" className="h-full w-full object-cover opacity-25 blur-sm" alt="" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,18,32,0.8)_0%,rgba(7,10,18,0.9)_55%,rgba(26,11,16,0.95)_100%)]" />
        <div className="comic-halftone absolute inset-0 opacity-60" />
        <div className="comic-speedlines absolute inset-0" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 45%, rgba(225,29,72,0.28), transparent 70%)",
        }}
      />

      {/* 만평식 폭발 말풍선 장식 */}
      <div className="animate-wobble pointer-events-none absolute left-[6%] top-[14%] z-10 hidden sm:block">
        <div className="comic-burst flex h-28 w-28 items-center justify-center bg-rose-500 text-center">
          <span className="px-4 font-display text-lg font-bold leading-tight text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
            {tr(lang, "title.burst1")}
          </span>
        </div>
      </div>
      <div
        className="animate-wobble pointer-events-none absolute right-[7%] top-[22%] z-10 hidden sm:block"
        style={{ animationDelay: "0.9s" }}
      >
        <div className="comic-burst flex h-24 w-24 items-center justify-center bg-amber-400 text-center">
          <span className="px-4 font-display text-base font-bold leading-tight text-slate-950">
            {tr(lang, "title.burst2")}
          </span>
        </div>
      </div>
      <div
        className="animate-wobble pointer-events-none absolute bottom-[16%] right-[10%] z-10 hidden sm:block"
        style={{ animationDelay: "1.7s" }}
      >
        <div className="comic-burst flex h-20 w-20 items-center justify-center bg-sky-400 text-center">
          <span className="px-3 font-display text-sm font-bold leading-tight text-slate-950">
            {tr(lang, "title.burst3")}
          </span>
        </div>
      </div>

      <div className="absolute right-6 top-6 z-20 flex gap-2">
        <div className="flex flex-col items-end rounded-xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{tr(lang, "title.points")}</div>
          <div className="font-display text-2xl text-amber-300 drop-shadow">
            {points.toLocaleString()}P
          </div>
        </div>
        {streak > 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 backdrop-blur">
            <div className="text-lg">🔥{streak}</div>
            <div className="text-[10px] text-orange-300">{tr(lang, "title.streakDays")}</div>
          </div>
        )}
      </div>

      <div className="relative z-10 flex w-full max-w-5xl items-end justify-center gap-6">
      {/* 호위 김부장 (데스크탑) */}
      <button
        onClick={() => setEaster(true)}
        className="mb-4 hidden w-[300px] shrink-0 cursor-pointer select-none lg:block xl:w-[340px]"
        aria-label={tr(lang, "title.kimHint")}
      >
        <div className="relative h-[380px] w-full">
          <ManagerKim angle={kimAngle} dogeza={kimDogeza} />
          {easter && (
            <span className="animate-count absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap font-display text-5xl text-rose-400"
              style={{ textShadow: "0 0 24px rgba(244,63,94,0.9), 0 3px 0 #000" }}>
              DOGEZA!!
            </span>
          )}
        </div>
        <p className="-mt-2 text-center text-[11px] text-slate-500">↓ {tr(lang, "title.kimHint")}</p>
      </button>

      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        {/* 호위 김부장 (모바일 미니) */}
        <button onClick={() => setEaster(true)} className="mb-1 h-44 w-56 cursor-pointer select-none lg:hidden" aria-label={tr(lang, "title.kimHint")}>
          <ManagerKim angle={kimAngle} dogeza={kimDogeza} />
        </button>
        <p className="font-display tracking-[0.4em] text-rose-300/80">
          {tr(lang, "title.kicker")}
        </p>

        <h1
          className="animate-title-sway mt-3 font-display text-6xl leading-none text-white sm:text-8xl"
          style={{
            textShadow:
              "0 4px 0 #7f1d1d, 0 8px 0 rgba(0,0,0,0.55), 0 0 40px rgba(225,29,72,0.55)",
            WebkitTextStroke: "2px rgba(0,0,0,0.35)",
          }}
        >
          SUMIMASEN!
        </h1>

        <p className="mt-3 font-display text-2xl text-slate-300">
          {tr(lang, "title.sub")}
        </p>

        <div className="mt-6 flex gap-2 rounded-full border border-white/10 bg-slate-900/60 p-1 backdrop-blur">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 font-display text-lg transition sm:px-5 ${
                tab === t.id ? "bg-rose-500/30 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {tr(lang, t.labelKey)}
            </button>
          ))}
        </div>

        {tab === "stage" && (
          <>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-slate-400">
              {tr(lang, "title.desc")}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {LANES.map((l) => (
                <span
                  key={l.lane}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    color: l.color,
                    borderColor: `${l.color}44`,
                    backgroundColor: `${l.color}12`,
                  }}
                >
                  <kbd className="font-display text-sm">{l.keyLabel}</kbd>
                  {l.label}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {STAGES.map((stage) => {
                const open = unlocked[stage.id];
                const prog = unlockProgress(stage.id, bestByStage);
                return (
                  <button
                    key={stage.id}
                    onClick={() => open && onStart(stage.id)}
                    disabled={!open}
                    aria-disabled={!open}
                    title={
                      open
                        ? undefined
                        : tr(lang, "title.lockedHint", {
                            prev: tr(lang, stageTitleKey(prevStage(stage.id)?.id ?? "stage1")),
                            pct: Math.round(stage.requiredAccuracy * 100),
                            prog: Math.round(prog * 100),
                          })
                    }
                    className={`rounded-full border px-8 py-3 font-display text-xl transition ${
                      open
                        ? "text-white hover:brightness-125"
                        : "cursor-not-allowed border-white/10 bg-white/5 text-slate-600"
                    }`}
                    style={
                      open
                        ? {
                            borderColor: `${stage.color}66`,
                            backgroundColor: `${stage.color}1a`,
                            color: stage.color,
                            boxShadow: `0 0 40px ${stage.color}33`,
                          }
                        : undefined
                    }
                  >
                    {tr(lang, stageTitleKey(stage.id))}
                    {!open && (
                      <span className="ml-2 text-xs text-slate-500">🔒</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => onStart("daily")}
              className="mt-3 rounded-full border border-amber-300/40 bg-amber-400/10 px-8 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20"
            >
              {tr(lang, "title.daily", { date: dailyKey })}
            </button>

            <button
              onClick={onEditor}
              className="mt-3 rounded-full border border-white/15 bg-white/5 px-8 py-2 font-display text-lg text-slate-300 transition hover:bg-white/10"
            >
              {tr(lang, "title.editor")}
            </button>

            <p className="mt-4 text-[11px] uppercase tracking-widest text-slate-600">
              {tr(lang, "title.keysHint")}
            </p>
          </>
        )}

        {tab === "shop" && (
          <div className="mt-6 flex w-full flex-col gap-4">
            {SHOP_CATS.map((cat) => (
              <div key={cat.id}>
                <h3 className="mb-2 text-left font-display text-lg text-slate-300">
                  {tr(lang, cat.labelKey)}
                </h3>
                <div className="flex flex-col gap-2">
                  {SKILLS.filter((s) => s.category === cat.id).map((s) => {
                    const isOwned = ownedSkills.includes(s.id);
                    const isEquipped = equippedSkill === s.id;
                    const text = skillText(s.id, lang);
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3 text-left">
                        <div>
                          <div className="font-bold text-slate-200">
                            {text.name} {isEquipped && <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{tr(lang, "title.equipped")}</span>}
                          </div>
                          <div className="text-sm text-slate-400">{text.desc}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {!isOwned ? (
                            <button
                              onClick={() => onBuy(s.id, s.cost)}
                              disabled={points < s.cost}
                              className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 font-display text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              {s.cost}P
                            </button>
                          ) : (
                            <button
                              onClick={() => onEquip(isEquipped ? "none" : s.id)}
                              className={`rounded border px-4 py-1.5 font-display transition ${isEquipped ? "border-slate-500 text-slate-300 hover:bg-slate-700" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}
                            >
                              {isEquipped ? tr(lang, "title.unequip") : tr(lang, "title.equip")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">{tr(lang, "title.shopNote")}</p>
          </div>
        )}

        {tab === "mission" && (
          <div className="mt-6 flex w-full flex-col gap-2">
            {MISSIONS.map((m) => {
              const prog = missionProgress(m, snapshot);
              const done = isMissionComplete(m, snapshot);
              const isClaimed = claimed[m.id];
              const pct = Math.min(100, Math.round((prog / m.target) * 100));
              const text = missionText(m, lang);
              return (
                <div key={m.id} className="rounded-lg bg-slate-800/50 px-4 py-3 text-left">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-200">{text.name}</div>
                    {!done ? (
                      <span className="text-xs text-slate-400">{prog}/{m.target} ({pct}%)</span>
                    ) : !isClaimed ? (
                      <button
                        onClick={() => addPoints(claim(m.id))}
                        className="rounded border border-amber-300/40 bg-amber-400/10 px-3 py-1 font-display text-amber-200 hover:bg-amber-400/20"
                      >
                        +{m.reward}P {tr(lang, "mission.claim")}
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-300">{tr(lang, "title.complete")}</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-400">{text.desc}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "records" && (
          <div className="mt-6 flex w-full flex-col gap-3 text-left">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">{tr(lang, "rec.totalRuns")}</div>
                <div className="font-display text-2xl text-white">{snapshot.totalRuns}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">{tr(lang, "rec.bestCombo")}</div>
                <div className="font-display text-2xl text-white">{snapshot.bestCombo}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">{tr(lang, "rec.bestAcc")}</div>
                <div className="font-display text-2xl text-white">{(snapshot.bestAccuracy * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">{tr(lang, "rec.dogeza")}</div>
                <div className="font-display text-2xl text-white">{snapshot.totalDogeza}</div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-display text-lg text-slate-300">{tr(lang, "title.bestTitle")}</h3>
              {Object.keys(bestByStage).length === 0 && (
                <p className="text-sm text-slate-500">{tr(lang, "title.noRecord")}</p>
              )}
              {Object.entries(bestByStage).map(([stage, b]) => (
                <div key={stage} className="mb-1 flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2 text-sm">
                  <span className="font-bold text-slate-200">{stageLabelFor(stage, lang)}</span>
                  <span className="text-slate-400">
                    {b.score.toLocaleString()} · {(b.accuracy * 100).toFixed(1)}% · {b.grade}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 font-display text-lg text-slate-300">{tr(lang, "title.recentTitle")}</h3>
              {[...runHistory].reverse().slice(0, 5).map((r, i) => (
                <div key={`${r.date}-${i}`} className="mb-1 flex items-center justify-between rounded-lg bg-slate-800/30 px-4 py-2 text-xs text-slate-400">
                  <span>{r.date} · {stageLabelFor(r.stageId, lang)}</span>
                  <span>{r.score.toLocaleString()} · {(r.accuracy * 100).toFixed(1)}% · {r.grade} · {r.maxCombo}</span>
                </div>
              ))}
              {runHistory.length === 0 && <p className="text-sm text-slate-500">{tr(lang, "title.noRecent")}</p>}
            </div>
          </div>
        )}

        {/* 속보 티커 */}
        <div className="pointer-events-none mt-10 w-full max-w-2xl overflow-hidden rounded-lg border-y-2 border-amber-300/60 bg-red-950/70 py-1.5">
          <div className="animate-ticker flex w-max whitespace-nowrap">
            {[0, 1].map((rep) => (
              <span key={rep} className="font-display text-lg tracking-wide text-amber-200">
                {tr(lang, "title.ticker1")} /// {tr(lang, "title.ticker2")} /// {tr(lang, "title.ticker3")} /// {tr(lang, "title.ticker4")} ///{" "}
              </span>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
