import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import ResultsScreen from "./ResultsScreen";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { tr } from "@/i18n/ui";
import type { GameResult } from "@/game/types";

/** U-08 결과 화면 회귀 안전망 */

const baseResult: GameResult = {
  score: 12345,
  maxCombo: 42,
  counts: { PERFECT: 60, GREAT: 20, GOOD: 10, BAD: 5, MISS: 5 },
  releaseCounts: { PERFECT: 4, GREAT: 1, GOOD: 0, BAD: 1, MISS: 0 },
  forcedReleases: 1,
  accuracy: 0.912,
  grade: "SS",
  allPerfect: false,
  stock: 8200,
  anger: 25,
  stageId: "stage1",
  dogezaHits: 7,
  points: 340,
  ending: { title: "PERFECT ENDING", text: "진심이 느껴졌다.", tone: "good" },
};

const props = { result: baseResult, onRetry: vi.fn(), onHome: vi.fn() };

beforeEach(() => {
  useSettingsStore.setState({ lang: "ko" });
  useMetaStore.setState({ points: 0, capital: 0, ownedSkills: ["none"], equippedSkill: "none" });
  useProgressStore.setState({
    lastNewlyCompleted: [],
    claimed: {},
    bestByStage: {},
    runHistory: [],
    lastRunNewRecord: false,
  });
});

describe("ResultsScreen", () => {
  it("엔딩 타이틀과 본문을 보여준다", () => {
    render(<ResultsScreen {...props} />);
    expect(screen.getByText("PERFECT ENDING")).toBeTruthy();
    expect(screen.getByText("진심이 느껴졌다.")).toBeTruthy();
  });

  it("등급과 핵심 스탯을 보여준다", () => {
    render(<ResultsScreen {...props} />);
    expect(screen.getByText("SS")).toBeTruthy();
    expect(screen.getByText("12,345")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("91.2%")).toBeTruthy();
    expect(screen.getByText("+340P")).toBeTruthy();
  });

  it("allPerfect 이면 등급 대신 도게자 마스터 타이틀을 보여준다", () => {
    render(<ResultsScreen {...props} result={{ ...baseResult, allPerfect: true }} />);
    expect(screen.getByText(tr("ko", "res.dogezaMaster"))).toBeTruthy();
  });

  it("판정 카운트를 모두 보여준다", () => {
    render(<ResultsScreen {...props} />);
    expect(screen.getByText(/PERFECT 60/)).toBeTruthy();
    expect(screen.getByText(/MISS 5/)).toBeTruthy();
  });

  it("U-08: 판정 분포 바가 탭 판정 합계 기준으로 그려진다", () => {
    const { container } = render(<ResultsScreen {...props} />);
    const bar = container.querySelector(".h-3.w-full > div") as HTMLElement;
    expect(bar).toBeTruthy();
    // 60/100 PERFECT = 60%
    expect(bar.style.width).toBe("60%");
    expect(bar.getAttribute("title")).toBe("PERFECT 60");
  });

  it("U-08: 0개인 판정은 분포 바에 나타나지 않는다", () => {
    const { container } = render(
      <ResultsScreen
        {...props}
        result={{
          ...baseResult,
          counts: { ...baseResult.counts, BAD: 0, MISS: 0 },
        }}
      />
    );
    const segments = container.querySelectorAll(".h-3.w-full > div");
    expect(segments).toHaveLength(3); // PERFECT / GREAT / GOOD
  });

  it("U-08: 홀드 릴리즈 통계를 별도 섹션으로 보여준다", () => {
    render(<ResultsScreen {...props} />);
    expect(screen.getByText(/홀드 릴리즈/)).toBeTruthy();
    expect(screen.getByText(/놓친 손똉이 1회/)).toBeTruthy();
  });

  it("강제 해제가 없으면 경고를 띄우지 않는다", () => {
    render(<ResultsScreen {...props} result={{ ...baseResult, forcedReleases: 0 }} />);
    expect(screen.queryByText(/놓친 손똉이/)).toBeNull();
  });

  it("릴리즈 카운트가 없으면 섹션 자체를 숨긴다", () => {
    render(
      <ResultsScreen {...props} result={{ ...baseResult, releaseCounts: undefined }} />
    );
    expect(screen.queryByText(/홀드 릴리즈/)).toBeNull();
  });

  it("스테이지 라벨이 내부 ID(custom:타임스탬프)를 노출하지 않는다", () => {
    render(
      <ResultsScreen {...props} result={{ ...baseResult, stageId: "custom:1712345678901" }} />
    );
    expect(screen.getByText(tr("ko", "stage.custom"))).toBeTruthy();
    expect(screen.queryByText(/1712345678901/)).toBeNull();
  });

  it("데일리 스테이지는 로컬라이즈된 라벨로 표기한다", () => {
    render(
      <ResultsScreen {...props} result={{ ...baseResult, stageId: "daily:2026-09-30" }} />
    );
    expect(screen.getByText(tr("ko", "stage.daily"))).toBeTruthy();
    expect(screen.queryByText(/2026-09-30/)).toBeNull();
  });

  /**
   * C-04 회귀: 신기록 판정의 기준은 **갱신 후** 가 아니라 **갱신 전** 최고점이다.
   *
   * 이전 구현은 `bestByStage[key].score === result.score` 로 비교했는데
   * `recordRun` 이 이미 최고점을 갱신한 뒤에 비교하므로,
   * 최고점과 **동점**이면 갱신이 일어나지 않아 옛 값이 남아 있고
   * 그 값이 같아 "신기록" 으로 표시됐다. 자기 최고점과 비겨도 뜬 것이다.
   *
   * 여기서는 실제 `recordRun` 을 태워 end-to-end 로 검증한다.
   */
  const runWithBest = (prevBest: number, score: number) => {
    useProgressStore.setState({
      bestByStage: { stage1: { score: prevBest, accuracy: 0.9, grade: "SS" } },
    });
    act(() => {
      useProgressStore.getState().recordRun({ ...baseResult, score }, "stage1");
    });
  };

  it("C-04: 최고점을 넘으면 신기록 배지를 띄운다", () => {
    runWithBest(9999, 12345);
    render(<ResultsScreen {...props} />);
    expect(screen.getByText("신기록!")).toBeTruthy();
  });

  it("C-04: 최고점과 동점이면 신기록이 아니다 (갱신 전 값과 비교)", () => {
    runWithBest(12345, 12345);
    render(<ResultsScreen {...props} />);
    expect(screen.queryByText("신기록!")).toBeNull();
  });

  it("C-04: 최고점보다 낮으면 신기록 배지를 띄우지 않는다", () => {
    runWithBest(99999, 12345);
    render(<ResultsScreen {...props} />);
    expect(screen.queryByText("신기록!")).toBeNull();
  });

  it("재도전/공유/타이틀로 버튼이 콜백을 부른다", () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    render(<ResultsScreen {...props} onRetry={onRetry} onHome={onHome} />);
    screen.getByRole("button", { name: "다시 도전" }).click();
    screen.getByRole("button", { name: "타이틀로" }).click();
    expect(onRetry).toHaveBeenCalled();
    expect(onHome).toHaveBeenCalled();
  });

  it("공유는 Web Share API 를 우선 사용한다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ResultsScreen {...props} />);
    screen.getByRole("button", { name: "기록 공유" }).click();
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].text).toContain("SS");
    // @ts-expect-error -- 테스트에서 주입한 임시 stub 정리
    delete navigator.share;
  });

  it("U-08: 새로 달성한 미션이 있으면 수령 버튼이 나온다", () => {
    useProgressStore.setState({ lastNewlyCompleted: ["play3"], claimed: {} });
    render(<ResultsScreen {...props} />);
    expect(screen.getByText(/미션 달성/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "수령" })).toBeTruthy();
  });

  it("미션 수령이 포인트를 지급한다", async () => {
    useProgressStore.setState({
      lastNewlyCompleted: ["play3"],
      claimed: {},
      totalRuns: 5,
    });
    render(<ResultsScreen {...props} />);
    screen.getByRole("button", { name: "수령" }).click();
    await waitFor(() => {
      expect(useMetaStore.getState().points).toBeGreaterThan(0);
    });
  });

  it("이미 수령한 미션은 버튼이 없다", () => {
    useProgressStore.setState({
      lastNewlyCompleted: ["play3"],
      claimed: { play3: true },
    });
    render(<ResultsScreen {...props} />);
    expect(screen.queryByRole("button", { name: "수령" })).toBeNull();
  });

  it("미션이 없으면 미션 섹션을 그리지 않는다", () => {
    render(<ResultsScreen {...props} />);
    expect(screen.queryByText(/미션 달성/)).toBeNull();
  });

  it("en 언어에서도 전체가 렌더된다", () => {
    useSettingsStore.setState({ lang: "en" });
    render(<ResultsScreen {...props} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });

  it("ja 언어에서도 미션 수령 라벨이 번역된다", () => {
    useSettingsStore.setState({ lang: "ja" });
    useProgressStore.setState({ lastNewlyCompleted: ["play3"], claimed: {}, totalRuns: 5 });
    render(<ResultsScreen {...props} />);
    expect(screen.getByRole("button", { name: "受取" })).toBeTruthy();
  });
});
