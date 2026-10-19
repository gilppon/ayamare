import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileToChart } from "@/game/autoChart";
import { BPM } from "@/game/constants";
import {
  MAX_BARS,
  MIN_BARS,
  SLOTS_PER_BAR,
  barsForCells,
  barsForNotes,
  cellKey,
  cellsToNotes,
  migrateLegacyKeys,
  notesToCells,
  clampCellsToBars,
  type EditorCell,
  type EditorCells,
} from "@/game/editorChart";
import type { Chart, Note } from "@/game/types";
import { tr } from "@/i18n/ui";
import { useSettingsStore } from "@/stores/settingsStore";

/** 마디당 슬롯 수 — 8분박자 단위 (0, 0.5, 1, 1.5, ... 3.5) */
const SLOTS = SLOTS_PER_BAR;
const LANES = [0, 1, 2, 3] as const;
const LANE_LABEL = ["15°", "45°", "90°", "DOGEZA"];
const LANE_COLOR = ["#2dd4bf", "#38bdf8", "#c084fc", "#fb7185"];

type Gimmick = NonNullable<Note["gimmick"]>;
/** GIMMICK 순환 순서 (다음 라운드) */
const NEXT_GIMMICK: Record<string, Gimmick | undefined> = {
  "": "invisible",
  invisible: "speedUp",
  speedUp: "fake",
  fake: undefined,
};

const STORAGE_KEY = "apolo_editor_v2";
const LEGACY_KEY = "apolo_editor";

type Mode = "note" | "hold" | "gimmick";

interface EditorState {
  cells: EditorCells;
  title: string;
  question: string;
}

function demoCells(): EditorCells {
  return Object.fromEntries(
    ["2:0:0", "2:2:1", "2:4:0", "2:6:1"].map((k) => [k, { hold: 0 } as EditorCell])
  );
}

function defaultState(lang: "ko" | "en" | "ja"): EditorState {
  return {
    cells: demoCells(),
    title: "CUSTOM",
    question: tr(lang, "ed.qDefault"),
  };
}

function loadState(lang: "ko" | "en" | "ja"): EditorState {
  const base = defaultState(lang);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EditorState>;
      if (parsed.cells && typeof parsed.cells === "object") {
        return {
          // L-17: 격자 밖 셀은 편집기에 표시되지 않으면서 채보 길이만 늘린다.
          cells: clampCellsToBars(parsed.cells as EditorCells),
          title: parsed.title ?? base.title,
          question: parsed.question ?? base.question,
        };
      }
    }
    // 구버전 "bar:beat:lane" (4분박자) 키 마이그레이션 — beat 를 slot*2 로 변환
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      return {
        cells: clampCellsToBars(migrateLegacyKeys(JSON.parse(legacy) as string[])),
        title: base.title,
        question: base.question,
      };
    }
  } catch {
    /* ignore */
  }
  return base;
}

interface Props {
  onPlay: (chart: Chart) => void;
  onClose: () => void;
}

export default function ChartEditor({ onPlay, onClose }: Props) {
  const lang = useSettingsStore((s) => s.lang);
  const [state, setState] = useState<EditorState>(() => loadState(lang));
  const [mode, setMode] = useState<Mode>("note");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 사용자가 그리드를 직접 늘린 마디 수 (자동 산출분 위에 더한다) */
  const [extraBars, setExtraBars] = useState(0);

  const beat = 60 / BPM;
  const { cells, title, question } = state;

  /**
   * C-01: 상태를 **함수형 업데이트**로 바꾼다.
   *
   * 기존 `persist({ ...state, ... })` 는 호출 시점의 `state` 를 캡처한 평면 객체를
   * 넘겼다. 같은 틱에 `importJson` 과 `setTitle` 이 연달아 호출되면 두 `setState` 가
   * 배칭되는데, 뒤의 것이 앞의 셀을 **전부 덮어써** 자동채보 결과가 100% 사라졌다.
   * 함수형 업데이트는 항상 직전 상태에 적용되므로 순서를 보장한다.
   */
  const update = useCallback((fn: (prev: EditorState) => EditorState) => setState(fn), []);

  /**
   * 저장: 300ms 디바운스 + 언마운트 시 즉시 flush.
   *
   * 이전에는 `onChange` 한 글자마다 전체 셀 맵을 `JSON.stringify` 해
   * 메인 스레드 `localStorage` 에 동기 기록했다.
   */
  const stateRef = useRef(state);
  stateRef.current = state;
  const flush = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const id = window.setTimeout(flush, 300);
    return () => window.clearTimeout(id);
  }, [state, flush]);
  // 언마운트(닫기) 시 마지막 변경이 유실되지 않도록 즉시 기록한다.
  useEffect(() => () => flush(), [flush]);

  /**
   * C-02: 격자 길이를 고정 8마디가 아니라 실제 내용에 맞춘다.
   * 자동채보 결과는 카운트인 2마디 + 곡 길이만큼 늘어나므로,
   * 고정값으로는 마지막 노트 대부분이 조용히 버려졌다.
   */
  const barCount = Math.min(
    MAX_BARS,
    Math.max(MIN_BARS, barsForCells(cells) + extraBars)
  );

  const chart: Chart = useMemo(() => {
    const notes = cellsToNotes(cells, BPM);
    const last = notes[notes.length - 1];
    const subtitle = tr(lang, "ed.subtitle");
    return {
      title,
      subtitle,
      bpm: BPM,
      notes,
      questions: [{ time: 2 * 4 * beat, journalist: "internet", text: question }],
      duration: last ? last.time + Math.max(last.hold, 0) + 2.4 : 20,
      version: 2,
    };
  }, [cells, title, question, beat, lang]);

  const toggleNote = (bar: number, slot: number, lane: number) => {
    const k = cellKey(bar, slot, lane);
    update((prev) => {
      const next = { ...prev.cells };
      if (mode === "gimmick") {
        const cur = next[k];
        if (!cur) return prev; // 노트가 없으면 기믹 지정 불가
        const g = NEXT_GIMMICK[cur.gimmick ?? ""];
        if (g === undefined) delete next[k];
        else next[k] = { ...cur, gimmick: g };
      } else if (mode === "hold") {
        const cur = next[k];
        if (!cur) return prev; // 홀드는 이미 있는 노트에만 지정
        // 8분박자 단위 길이 순환: 0 → 2(1박) → 4(2박) → 6(3박) → 0
        next[k] = { ...cur, hold: cur.hold === 0 ? 2 : cur.hold === 2 ? 4 : cur.hold === 4 ? 6 : 0 };
      } else if (next[k]) {
        delete next[k];
      } else {
        next[k] = { hold: 0 };
      }
      return { ...prev, cells: next };
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-chart.json";
    a.click();
    // U-13: 클릭 직후 revoke 하면 일부 브라우저에서 다운로드가 취소된다.
    // 실제 다운로드가 시작된 뒤(다음 프레임)에 해제한다.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * B-09: 슬롯 인덱스(8분박자 단위)로 역변환해 자동채보 초안을 **손실 없이** 복원한다.
   * 기존 `Math.round(n.time / beat)` 는 .5박을 버려 전부 0.5박 밀리고 충돌 삭제됐다.
   *
   * C-02: 격자를 노트가 실제로 요구하는 만큼 늘리고, 그래도 잘린 노트가 있으면
   * 무음 절단 대신 알린다.
   */
  const importJson = (text: string): number | null => {
    try {
      const parsed = JSON.parse(text) as Chart;
      if (!Array.isArray(parsed.notes)) throw new Error("notes 없음");
      const needed = Math.max(MIN_BARS, barsForNotes(parsed.notes, BPM));
      const capped = Math.min(MAX_BARS, needed);
      const dropped = parsed.notes.length - cellsToNotes(
        notesToCells(parsed.notes, BPM, capped),
        BPM
      ).length;
      update((prev) => ({
        cells: notesToCells(parsed.notes, BPM, capped),
        title: parsed.title || prev.title,
        question: parsed.questions?.[0]?.text || prev.question,
      }));
      setExtraBars(0);
      setError(dropped > 0 ? tr(lang, "ed.truncated", { n: dropped, max: MAX_BARS }) : null);
      return parsed.notes.length - dropped;
    } catch {
      setError(tr(lang, "ed.parseFail"));
      return null;
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const auto = await fileToChart(f, BPM, lang);
      const imported = importJson(JSON.stringify(auto));
      // C-01: importJson 이 만든 상태 위에 제목만 덮는다 (순차적 함수 업데이트).
      if (imported !== null) update((prev) => ({ ...prev, title: `CUSTOM — ${f.name}` }));
      // C-02: 표시 개수는 실제로 들어온 노트 수를 쓴다 (이전엔 클로저의 옛 셀을 세었다).
      if (imported !== null) setError(tr(lang, "ed.autoDone", { n: imported }));
    } catch {
      setError(tr(lang, "ed.audioFail"));
    } finally {
      setBusy(false);
    }
  };

  const setTitle = (v: string) => update((prev) => ({ ...prev, title: v }));
  const setQuestion = (v: string) => update((prev) => ({ ...prev, question: v }));

  const gimmickCounts = useMemo(() => {
    const c: Record<string, number> = { invisible: 0, speedUp: 0, fake: 0, hold: 0 };
    for (const cell of Object.values(cells)) {
      if (cell.gimmick) c[cell.gimmick] = (c[cell.gimmick] ?? 0) + 1;
      if (cell.hold > 0) c.hold++;
    }
    return c;
  }, [cells]);

  const MODE_LABEL = useMemo<Record<Mode, string>>(
    () => ({
      note: tr(lang, "ed.modeNote"),
      hold: tr(lang, "ed.modeHold"),
      gimmick: tr(lang, "ed.modeGimmick"),
    }),
    [lang]
  );

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/85 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-2xl text-white">{tr(lang, "ed.title", { n: barCount })}</h2>
          <button onClick={onClose} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white">
            {tr(lang, "settings.close")}
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={tr(lang, "ed.titlePh")}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
              placeholder={tr(lang, "ed.titlePh")}
            />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label={tr(lang, "ed.qPh")}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
              placeholder={tr(lang, "ed.qPh")}
            />
          </div>

          {/* 편집 모드 */}
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  mode === m
                    ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                    : "border-white/10 bg-slate-800/60 text-slate-400 hover:text-white"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
            <span className="text-[11px] text-slate-500">{tr(lang, "ed.modeHint")}</span>
            {barCount < MAX_BARS && (
              <button
                onClick={() => setExtraBars((n) => n + 4)}
                className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:text-white"
              >
                {tr(lang, "ed.addBars")}
              </button>
            )}
          </div>

          {/* 피아노롤: 마디 블록 × (4 레인 행 × 8 슬롯) */}
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: barCount }, (_, bar) => (
              <div key={bar} className="rounded-lg border border-white/5 bg-slate-950/40 p-1.5">
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className="font-display text-sm text-slate-500">{bar + 1}</span>
                  <span className="text-[10px] text-slate-600">{tr(lang, "ed.barUnit")}</span>
                  <div className="ml-auto flex gap-[2px]">
                    {Array.from({ length: SLOTS }, (_, s) => (
                      <span
                        key={s}
                        className={`w-4 text-center text-[9px] ${
                          s % 2 === 0 ? "text-slate-500" : "text-slate-700"
                        }`}
                      >
                        {s / 2 + 1}
                      </span>
                    ))}
                  </div>
                </div>
                {LANES.map((lane) => (
                  <div key={lane} className="mb-1 flex items-center gap-1 last:mb-0">
                    <span
                      className="w-10 shrink-0 text-right font-display text-[10px]"
                      style={{ color: LANE_COLOR[lane] }}
                    >
                      {LANE_LABEL[lane]}
                    </span>
                    {Array.from({ length: SLOTS }, (_, slot) => {
                      const cell = cells[cellKey(bar, slot, lane)];
                      const on = !!cell;
                      const isHold = (cell?.hold ?? 0) > 0;
                      const gm = cell?.gimmick;
                      return (
                        <button
                          key={slot}
                          onClick={() => toggleNote(bar, slot, lane)}
                          title={`${bar + 1}${tr(lang, "ed.barUnit")} ${slot / 2 + 1}${tr(lang, "ed.beatUnit")}${slot % 2 ? " off" : ""} · ${LANE_LABEL[lane]}${isHold ? ` · HOLD x${cell?.hold}` : ""}${gm ? ` · ${gm}` : ""}`}
                          className={`relative h-6 flex-1 rounded text-[9px] font-bold transition ${
                            on
                              ? gm === "fake"
                                ? "bg-slate-500 text-slate-900"
                                : "text-slate-950"
                              : "bg-slate-800/70 text-slate-600 hover:bg-slate-700"
                          }`}
                          style={{
                            backgroundColor: on
                              ? gm === "fake"
                                ? undefined
                                : gm === "invisible"
                                ? `${LANE_COLOR[lane]}88`
                                : gm === "speedUp"
                                ? `${LANE_COLOR[lane]}cc`
                                : LANE_COLOR[lane]
                              : undefined,
                            outline: slot % 2 === 0 ? "none" : "1px dashed rgba(255,255,255,0.08)",
                          }}
                        >
                          {on ? (gm === "fake" ? "?" : isHold ? "H" : gm === "speedUp" ? "»" : gm === "invisible" ? "◌" : "●") : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="font-bold text-white">
              {chart.notes.length} {tr(lang, "ed.noteUnit")}
            </span>
            <span>
              {chart.duration.toFixed(1)}
              {tr(lang, "ed.secUnit")}
            </span>
            <span>◌ {gimmickCounts.invisible}</span>
            <span>» {gimmickCounts.speedUp}</span>
            <span>? {gimmickCounts.fake}</span>
            <span>H {gimmickCounts.hold}</span>
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
