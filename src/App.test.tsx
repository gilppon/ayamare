import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { tr } from "@/i18n/ui";
import type { Chart, GameResult } from "@/game/types";

/**
 * App 라우팅·부팅 통합 안전망.
 *
 * GameScreen / ChartEditor 는 WebAudio·Canvas 를 타므로 **mock 으로 대체**한다.
 * 검증 대상은 App 자신의 책임 — 화면 전환, stageId 전달(B-10), 보상 정산,
 * B-04(플레이 중 설정 차단), ErrorBoundary 복구.
 */

const gameMock = {
  finish: null as null | ((r: GameResult) => void),
  quit: null as null | (() => void),
  runActive: null as null | ((v: boolean) => void),
  props: [] as Record<string, unknown>[],
};

vi.mock("./components/GameScreen", () => ({
  default: (props: Record<string, unknown>) => {
    gameMock.props.push(props);
    gameMock.finish = props.onFinish as (r: GameResult) => void;
    gameMock.quit = props.onQuit as () => void;
    gameMock.runActive = props.onRunActiveChange as (v: boolean) => void;
    return (
      <div data-testid="game">
        <button onClick={() => (props.onRunActiveChange as (v: boolean) => void)(true)}>
          run-start
        </button>
        <button onClick={() => (props.onQuit as () => void)()}>quit</button>
      </div>
    );
  },
}));

const editorMock = { play: null as null | ((c: Chart) => void) };

vi.mock("./components/ChartEditor", () => ({
  default: (props: Record<string, unknown>) => {
    editorMock.play = props.onPlay as (c: Chart) => void;
    return <div data-testid="editor">editor</div>;
  },
}));

const result: GameResult = {
  score: 9000,
  maxCombo: 30,
  counts: { PERFECT: 30, GREAT: 5, GOOD: 0, BAD: 0, MISS: 1 },
  accuracy: 0.95,
  grade: "S",
  allPerfect: false,
  stock: 5000,
  anger: 10,
  stageId: "stage1",
  dogezaHits: 2,
  points: 250,
  ending: { title: "OK ENDING", text: "괜찮았다.", tone: "good" },
};

beforeEach(() => {
  gameMock.props = [];
  gameMock.finish = null;
  gameMock.quit = null;
  gameMock.runActive = null;
  editorMock.play = null;
  useSettingsStore.setState({ lang: "ko" });
  useMetaStore.setState({ points: 0, capital: 0, ownedSkills: ["none"], equippedSkill: "none" });
  useProgressStore.setState({
    totalRuns: 0,
    bestByStage: {},
    runHistory: [],
    claimed: {},
    lastNewlyCompleted: [],
  } as never);
});

/**
 * C: 스테이지는 이제 순차 해금이다. 라우팅 테스트는 임의 스테이지에
 * 진입해야 하므로 앞 스테이지들을 기준 이상으로 클리어한 상태를 만든다.
 */
const unlockThrough = (n: number) => {
  const bestByStage: Record<string, { score: number; accuracy: number; grade: string }> = {};
  for (let i = 1; i <= n; i++) {
    bestByStage[`stage${i}`] = { score: 10000, accuracy: 1, grade: "SSS" };
  }
  useProgressStore.setState({ bestByStage } as never);
};

const startStage = (n: number) => {
  unlockThrough(n);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`STAGE ${n}`) }));
};

/**
 * 해금을 먼저 갖춘 뒤 렌더한다.
 * (렌더 이후 store 를 바꾸면 이미 그려진 잠금 버튼이 그대로 남는다)
 */
const renderUnlocked = (n: number) => {
  unlockThrough(n);
  return render(<App />);
};

/** 게임이 콜백을 부르는 시점 — App 의 setState 를 act 안에서 흘려야 렌더된다 */
const finishRun = (r: GameResult = result) => act(() => gameMock.finish!(r));
const playChart = (c: Chart) => act(() => editorMock.play!(c));

describe("App 부팅", () => {
  it("타이틀 화면으로 시작한다", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /STAGE 1/ })).toBeTruthy();
  });

  it("언어에 맞춰 document.title 과 html lang 을 맞춘다", () => {
    render(<App />);
    expect(document.documentElement.lang).toBe("ko");
    expect(document.title).toBe(tr("ko", "app.title"));

    fireEvent.click(screen.getByRole("button", { name: tr("ko", "app.settings") }));
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
      expect(document.title).toBe(tr("en", "app.title"));
    });
  });
});

describe("App 라우팅", () => {
  it("B-10: 스테이지 버튼의 stageId 를 GameScreen 에 그대로 넘긴다", () => {
    renderUnlocked(3);
    startStage(3);
    expect(screen.getByTestId("game")).toBeTruthy();
    expect(gameMock.props.at(-1)!.stageId).toBe("stage3");
  });

  it("에디터로 갔다가 돌아올 수 있다", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /UGC/ }));
    expect(screen.getByTestId("editor")).toBeTruthy();
  });

  it("에디터에서 플레이하면 custom stageId 로 게임이 시작된다", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /UGC/ }));
    const chart = { title: "MINE", notes: [] } as unknown as Chart;
    playChart(chart);
    expect(screen.getByTestId("game")).toBeTruthy();
    expect(gameMock.props.at(-1)!.stageId).toMatch(/^custom:/);
    expect(gameMock.props.at(-1)!.chartOverride).toBe(chart);
  });

  it("게임 종료 시 결과 화면으로 가고 포인트를 지급한다", () => {
    renderUnlocked(2);
    startStage(2);
    finishRun();
    expect(screen.getByText("OK ENDING")).toBeTruthy();
    expect(useMetaStore.getState().points).toBe(250);
    expect(useProgressStore.getState().totalRuns).toBe(1);
  });

  it("B-10 회귀: 재도전은 같은 stageId 를 쓴다", () => {
    renderUnlocked(4);
    startStage(4);
    finishRun();
    fireEvent.click(screen.getByRole("button", { name: tr("ko", "res.retry") }));
    expect(screen.getByTestId("game")).toBeTruthy();
    expect(gameMock.props.at(-1)!.stageId).toBe("stage4");
  });

  it("홈으로 가면 타이틀로 돌아온다", () => {
    renderUnlocked(1);
    startStage(1);
    finishRun();
    fireEvent.click(screen.getByRole("button", { name: tr("ko", "res.home") }));
    expect(screen.getByRole("button", { name: /STAGE 1/ })).toBeTruthy();
  });

  it("포기하면 결과 기록 없이 타이틀로 돌아온다", () => {
    renderUnlocked(1);
    startStage(1);
    act(() => gameMock.quit!());
    expect(screen.getByRole("button", { name: /STAGE 1/ })).toBeTruthy();
    expect(useProgressStore.getState().totalRuns).toBe(0);
  });
});

describe("B-04 설정 차단", () => {
  it("플레이 중에는 설정 버튼이 사라진다", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: tr("ko", "app.settings") })).toBeTruthy();
    startStage(1);
    fireEvent.click(screen.getByRole("button", { name: "run-start" }));
    expect(screen.queryByRole("button", { name: tr("ko", "app.settings") })).toBeNull();
  });

  it("플레이가 끝나면 설정 버튼이 다시 나온다", () => {
    renderUnlocked(1);
    startStage(1);
    fireEvent.click(screen.getByRole("button", { name: "run-start" }));
    finishRun();
    expect(screen.getByRole("button", { name: tr("ko", "app.settings") })).toBeTruthy();
  });
});
