import { useCallback, useEffect, useState } from "react";
import ChartEditor from "./components/ChartEditor";
import ErrorBoundary from "./components/ErrorBoundary";
import GameScreen from "./components/GameScreen";
import ResultsScreen from "./components/ResultsScreen";
import TitleScreen from "./components/TitleScreen";
import SettingsPanel from "./components/SettingsPanel";
import { tr } from "./i18n/ui";
import { ensureVoiceBank } from "./game/voiceBank";
import type { Chart, GameResult } from "./game/types";
import { useMetaStore } from "./stores/metaStore";
import { useProgressStore } from "./stores/progressStore";
import { useSettingsStore } from "./stores/settingsStore";

type Screen = "title" | "game" | "results" | "editor";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [result, setResult] = useState<GameResult | null>(null);
  const [gameKey, setGameKey] = useState(0);
  // B-10: stageId 를 단일 소스로 유지한다. 이전에는 `startGame` 이 Date.now() 기반
  // ID 를 store 에 넣고 렌더 시점엔 chart.title 기반으로 덮어써 서로 다른 값이
  // GameScreen 과 recordRun 에 흘렀다.
  const [stageId, setStageId] = useState("stage1");
  const [customChart, setCustomChart] = useState<Chart | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // B-04/U-01: 실제 플레이 중에는 설정 변경을 막는다. 언어 전환은 chart 를
  // 재생성해 진행 중 런의 판정·점수를 비워버린다.
  const [runActive, setRunActive] = useState(false);

  const points = useMetaStore((s) => s.points);
  const ownedSkills = useMetaStore((s) => s.ownedSkills);
  const equippedSkill = useMetaStore((s) => s.equippedSkill);
  const buy = useMetaStore((s) => s.buy);
  const equip = useMetaStore((s) => s.equip);
  const addPoints = useMetaStore((s) => s.addPoints);
  const recordRun = useProgressStore((s) => s.recordRun);
  const lang = useSettingsStore((s) => s.lang);

  useEffect(() => {
    document.title = tr(lang, "app.title");
    document.documentElement.lang = lang;
  }, [lang]);

  // 격한 사죄 음성 MP3 미리 디코드 (실패해도 TTS 폴백)
  useEffect(() => {
    ensureVoiceBank();
  }, []);

  // 플레이 종료/이탈로 설정 화면이 열려 있으면 닫아 둔다
  useEffect(() => {
    if (!runActive) setShowSettings(false);
  }, [runActive]);

  const startGame = useCallback(
    (id: string = stageId, custom?: Chart) => {
      setStageId(id);
      setCustomChart(custom ?? null);
      setGameKey((k) => k + 1);
      setScreen("game");
    },
    [stageId]
  );

  const closeGame = useCallback(() => {
    setRunActive(false);
    setScreen("title");
  }, []);

  return (
    <div className="h-full w-full">
      {/* B-04: 플레이 중에는 설정 버튼을 숨긴다 (설정 패널 진입 자체를 차단) */}
      {!runActive && (
        <button
          onClick={() => setShowSettings(true)}
          className="absolute right-4 bottom-4 z-50 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur hover:text-white"
          aria-label={tr(lang, "app.settings")}
        >
          {tr(lang, "app.settings")}
        </button>
      )}
      {showSettings && !runActive && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {screen === "title" && (
        <TitleScreen
          points={points}
          ownedSkills={ownedSkills}
          equippedSkill={equippedSkill}
          onBuy={(skillId, cost) => {
            buy(skillId, cost);
          }}
          onEquip={equip}
          onStart={startGame}
          onEditor={() => setScreen("editor")}
        />
      )}

      {screen === "editor" && (
        <ChartEditor
          onClose={() => setScreen("title")}
          onPlay={(chart) => startGame(`custom:${Date.now()}`, chart)}
        />
      )}

      {screen === "game" && (
        <ErrorBoundary
          label="GameScreen"
          onReset={() => setGameKey((k) => k + 1)}
        >
          <GameScreen
            key={gameKey}
            // B-10: stageId 상태를 그대로 전달 (GameScreen 과 recordRun 이 같은 값을 본다)
            stageId={stageId}
            chartOverride={customChart ?? undefined}
            equippedSkill={equippedSkill}
            onRunActiveChange={setRunActive}
            onFinish={(r) => {
              setRunActive(false);
              setResult(r);
              addPoints(r.points);
              recordRun(r, stageId);
              setScreen("results");
            }}
            onQuit={closeGame}
          />
        </ErrorBoundary>
      )}

      {screen === "results" && result && (
        <ErrorBoundary label="ResultsScreen">
          <ResultsScreen
            result={result}
            // B-10: 재도전도 같은 stageId 를 쓴다.
            // (이전처럼 customChart 를 버리면 stage1 채보로 플레이되며 기록만 custom 이 됐다)
            onRetry={() => startGame(stageId, customChart ?? undefined)}
            onHome={closeGame}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
