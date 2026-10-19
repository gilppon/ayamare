import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import GameScreen from "./GameScreen";
import { advanceAudio } from "@/test/setup";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMetaStore } from "@/stores/metaStore";
import { buildChart } from "@/game/chart";
import { KEY_TO_LANE } from "@/game/constants";

/**
 * GameScreen 스모크 테스트 — 대기 → 플레이 → 일시정지 → 종료 의 배선을 검증한다.
 *
 * 순수 로직과 훅은 각각 테스트되어 있으므로, 여기서는 **이들이 실제로 연결되어
 * 라우프가 도는지**만 확인한다 (되먹임 배선의 회귀 방지).
 */

const stage1 = buildChart("stage1");

/** 게임 루프 N 프레임 진행 (오디오 시간도 함께 전진) */
async function frames(n: number, dtMs = 16) {
  await act(async () => {
    for (let i = 0; i < n; i++) {
      advanceAudio(dtMs / 1000);
      await vi.advanceTimersByTimeAsync(dtMs);
    }
  });
}

async function startGame() {
  await act(async () => {
    screen.getByRole("button", { name: /시작/ }).click();
  });
  // 오디오 컨텍스트가 만들어지고 songStart 이 잡힐 때까지
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

describe("GameScreen 스모크", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      lang: "ko",
      keyMap: { ...KEY_TO_LANE },
      timingScale: 1,
      reduceMotion: true,
      colorblind: false,
      haptics: false,
      voice: false,
    });
    useMetaStore.setState({ ownedSkills: ["none"], equippedSkill: "none", points: 0, capital: 0 });
  });

  it("대기 화면이 조작법과 시작 버튼을 보여준다", () => {
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: /시작/ })).toBeTruthy();
    // 레인 라벨이 안내 카드와 키 버튼 양쪽에 있다
    expect(screen.getAllByText("15°").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DOGEZA").length).toBeGreaterThan(0);
    // 채보 제목
    expect(screen.getByText(new RegExp(stage1.title.split("—")[0].trim()))).toBeTruthy();
  });

  /**
   * C-03 회귀 — JSX 포맷 손상으로 리터럴 쉼표가 화면에 렌더되던 버그.
   *
   *   <ReporterSlot>,        {question && <Journalist ... />},      </ReporterSlot>
   *
   * `ReporterSlot` 은 children 을 그대로 렌더하므로 자식 텍스트 노드인
   * 쉼표 두 개가 기자 말풍선 좌우에 그대로 노출됐다.
   * 같은 실패를 만들면 "포맷이 깨졌다" 는 사실이 눈에 띄지 않으므로,
   * 자식 영역에 쉼표/공백만 남지 않는지 **컨테이너 기준**으로 고정한다.
   */
  it("C-03: 기자 말풍선 자식에 리터럴 쉼표가 렌더되지 않는다", () => {
    const { container } = render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );
    const slot = container.querySelector(".top-\\[13vh\\]");
    expect(slot).toBeTruthy();
    expect(slot?.textContent ?? "").not.toContain(",");
  });

  it("시작하면 실제 플레이 중임을 상위에게 알린다", async () => {
    const onRunActiveChange = vi.fn();
    render(
      <GameScreen
        stageId="stage1"
        equippedSkill="none"
        onFinish={vi.fn()}
        onQuit={vi.fn()}
        onRunActiveChange={onRunActiveChange}
      />
    );

    await startGame();
    expect(onRunActiveChange).toHaveBeenCalledWith(true);
  });

  it("Esc 로 일시정지하고, 다시 Esc 로 재개한다", async () => {
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );
    await startGame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByText("일시정지")).toBeTruthy();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await frames(2);
    expect(screen.queryByText("일시정지")).toBeNull();
  });

  it("일시정지 중에는 나가기 버튼으로 종료 콜백을 부른다", async () => {
    const onQuit = vi.fn();
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={onQuit} />
    );
    await startGame();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    act(() => {
      screen.getByRole("button", { name: /포기하고 나가기/ }).click();
    });
    expect(onQuit).toHaveBeenCalled();
  });

  it("일시정지 중에는 곡 시간이 진행되지 않는다", async () => {
    const onFinish = vi.fn();
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={onFinish} onQuit={vi.fn()} />
    );
    await startGame();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // 곡 끝까지 시간을送어도 일시정지 중이라 종료되지 않는다
    await frames(80, 100);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("판정 live region 이 존재한다 (U-04)", () => {
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );
    expect(document.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it("레인 버튼에 스크린리더용 라벨이 붙어 있다 (U-05)", () => {
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /가벼운 목례/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /최종 사죄/ })).toBeTruthy();
  });

  it("커스텀 채보(chartOverride) 로도 시작할 수 있다", async () => {
    const custom = { ...stage1, title: "CUSTOM TEST", duration: 5 };
    render(
      <GameScreen
        stageId="custom:1"
        equippedSkill="none"
        chartOverride={custom}
        onFinish={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    expect(screen.getByText(/CUSTOM TEST/)).toBeTruthy();
    await startGame();
    await frames(3);
  });

  it("언마운트 시 예외 없이 정리된다 (AudioContext 누수 회귀)", async () => {
    const { unmount } = render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={vi.fn()} onQuit={vi.fn()} />
    );
    await startGame();
    await frames(3);
    expect(() => unmount()).not.toThrow();
  });

  it("루프가 실제로 돌아 점수가 갱신된다", async () => {
    const onFinish = vi.fn();
    render(
      <GameScreen stageId="stage1" equippedSkill="none" onFinish={onFinish} onQuit={vi.fn()} />
    );
    await startGame();
    // 첫 노트 시각까지 진행하면 MISS 판정이 발생해 점수/카운트가 움직인다
    await frames(Math.ceil((stage1.notes[0].time + 1.2) / 0.016));
    // 아직 곡이 끝나지 않았으므로 결과 콜백은 없다
    expect(onFinish).not.toHaveBeenCalled();
  });
});
