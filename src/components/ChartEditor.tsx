import { useMemo, useState } from "react";
import { fileToChart } from "@/game/autoChart";
import { BPM } from "@/game/constants";
import type { Chart, Note } from "@/game/types";
import { tr } from "@/i18n/ui";
import { useSettingsStore } from "@/stores/settingsStore";

const BARS = 8;
const BEATS = 4;
const LANES = [0, 1, 2, 3] as const;
const LANE_LABEL = ["15°", "45°", "90°", "DOGEZA"];

interface Props {
  onPlay: (chart: Chart) => void;
  onClose: () => void;
}

function key(bar: number, beat: number, lane: number): string {
  return `${bar}:${beat}:${lane}`;
}

export default function ChartEditor({ onPlay, onClose }: Props) {
  const lang = useSettingsStore((s) => s.lang);
  const [cells, setCells] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("apolo_editor");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set([key(2, 0, 0), key(2, 1, 1), key(2, 2, 0), key(2, 3, 1)]);
  });
  const [title, setTitle] = useState("CUSTOM");
  const [question, setQuestion] = useState(
    lang === "ko" ? "이 채보, 사과할 준비 됐습니까?" : lang === "en" ? "This chart — ready to apologize?" : "この譜面、謝罪の準備はいいですか？"
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const beat = 60 / BPM;

  const chart: Chart = useMemo(() => {
    const notes: Note[] = [];
    let id = 900000;
    const sorted = [...cells]
      .map((k) => k.split(":").map(Number) as [number, number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [bar, b, lane] of sorted) {
      notes.push({
        id: id++,
        time: (bar * 4 + b) * beat,
        lane: lane as 0 | 1 | 2 | 3,
        action: (["bow15", "bow45", "bow90", "dogeza"] as const)[lane],
        hold: 0,
      });
    }
    const last = notes[notes.length - 1];
    const subtitle =
      lang === "ko" ? "유저 제작 채보" : lang === "en" ? "User-made chart" : "ユーザー作成譜面";
    return {
      title,
      subtitle,
      bpm: BPM,
      notes,
      questions: [{ time: 2 * 4 * beat, journalist: "internet", text: question }],
      duration: last ? last.time + 2.4 : 20,
      version: 2,
    };
  }, [cells, title, question, beat, lang]);

  const toggle = (bar: number, b: number, lane: number) => {
    setCells((prev) => {
      const next = new Set(prev);
      const k = key(bar, b, lane);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem("apolo_editor", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const exportJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chart));
      setError(tr(lang, "ed.copied"));
    } catch {
      setError(tr(lang, "ed.copyFail"));
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(chart, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "custom-chart.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (text: string) => {
    try {
      const parsed = JSON.parse(text) as Chart;
      if (!Array.isArray(parsed.notes)) throw new Error("notes 없음");
      const next = new Set<string>();
      for (const n of parsed.notes.slice(0, 200)) {
        const totalBeats = Math.round(n.time / beat);
        const bar = Math.floor(totalBeats / 4);
        const b = totalBeats % 4;
        if (bar < 0 || bar >= BARS || b < 0 || b >= BEATS) continue;
        if (n.lane < 0 || n.lane > 3) continue;
        next.add(key(bar, b, n.lane));
      }
      setCells(next);
      if (parsed.title) setTitle(parsed.title);
      setError(null);
    } catch {
      setError(tr(lang, "ed.parseFail"));
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const auto = await fileToChart(f, BPM, lang);
      importJson(JSON.stringify(auto));
      setTitle(`CUSTOM — ${f.name}`);
      setError(tr(lang, "ed.autoDone", { n: auto.notes.length }));
    } catch {
      setError(tr(lang, "ed.audioFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/85 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-2xl text-white">{tr(lang, "ed.title")}</h2>
          <button onClick={onClose} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white">
            {tr(lang, "settings.close")}
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
              placeholder={tr(lang, "ed.titlePh")}
            />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
              placeholder={tr(lang, "ed.qPh")}
            />
          </div>

          <div className="flex flex-col gap-1">
            {Array.from({ length: BARS }, (_, bar) => (
              <div key={bar} className="flex items-center gap-1">
                <span className="w-8 font-display text-sm text-slate-500">{bar + 1}</span>
                {Array.from({ length: BEATS }, (_, b) => (
                  <div key={b} className="flex flex-1 gap-1">
                    {LANES.map((lane) => {
                      const on = cells.has(key(bar, b, lane));
                      return (
                        <button
                          key={lane}
                          onClick={() => toggle(bar, b, lane)}
                          className={`h-8 flex-1 rounded text-[10px] font-bold transition ${
                            on ? "bg-amber-400 text-black" : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                          }`}
                          title={`${bar + 1}${tr(lang, "ed.barUnit")} ${b + 1}${tr(lang, "ed.beatUnit")} ${LANE_LABEL[lane]}`}
                        >
                          {LANE_LABEL[lane]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            {chart.notes.length} {tr(lang, "ed.noteUnit")} · {chart.duration.toFixed(1)}{tr(lang, "ed.secUnit")} · {tr(lang, "ed.hint")}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg border border-sky-400/40 bg-sky-400/10 px-4 py-2 font-display text-sky-200 hover:bg-sky-400/20">
              {busy ? tr(lang, "ed.busy") : tr(lang, "ed.auto")}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <button onClick={exportJson} className="rounded-lg border border-white/10 px-4 py-2 font-display text-slate-200 hover:bg-white/10">
              {tr(lang, "ed.copy")}
            </button>
            <button onClick={download} className="rounded-lg border border-white/10 px-4 py-2 font-display text-slate-200 hover:bg-white/10">
              {tr(lang, "ed.download")}
            </button>
            <label className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 font-display text-slate-200 hover:bg-white/10">
              {tr(lang, "ed.import")}
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) importJson(await f.text());
                }}
              />
            </label>
          </div>

          {error && <p className="text-xs text-amber-300">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-white/10 p-4">
          <button
            onClick={() => chart.notes.length > 0 && onPlay(chart)}
            disabled={chart.notes.length === 0}
            className="flex-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-6 py-3 font-display text-xl text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-30"
          >
            {tr(lang, "ed.play")} ({chart.notes.length})
          </button>
        </div>
      </div>
    </div>
  );
}
