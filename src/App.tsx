import { useEffect, useState } from "react";
import ChartEditor from "./components/ChartEditor";
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
  const [stageId, setStageId] = useState("stage1");
  const [customChart, setCustomChart] = useState<Chart | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const capital = useMetaStore((s) => s.capital);
  const points = useMetaStore((s) => s.points);
  const ownedSkills = useMetaStore((s) => s.ownedSkills);
  const equippedSkill = useMetaStore((s) => s.equippedSkill);
  const buy = useMetaStore((s) => s.buy);
  const equip = useMetaStore((s) => s.equip);
  const addCapital = useMetaStore((s) => s.addCapital);
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

  const startGame = (id: string = stageId, custom?: Chart) => {
    setStageId(id);
    setCustomChart(custom ?? null);
    setGameKey((k) => k + 1);
    setScreen("game");
  };

  return (
    <div className="h-full w-full">
      <button
        onClick={() => setShowSettings(true)}
        className="absolute right-4 bottom-4 z-50 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur hover:text-white"
        aria-label="settings"
      >
        {tr(lang, "app.settings")}
      </button>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {screen === "title" && (
        <TitleScreen
          capital={capital}
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
        <GameScreen
          key={gameKey}
          stageId={customChart ? `custom:${customChart.title}` : stageId}
          chartOverride={customChart ?? undefined}
          equippedSkill={equippedSkill}
          onFinish={(r) => {
            setResult(r);
            addCapital(Math.round(r.stock / 50));
            addPoints(r.points);
            recordRun(r, stageId);
            setScreen("results");
          }}
          onQuit={() => setScreen("title")}
        />
      )}

      {screen === "results" && result && (
        <ResultsScreen
          result={result}
          onRetry={() => startGame(stageId)}
          onHome={() => setScreen("title")}
        />
      )}
    </div>
  );
}
