import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CameraFlashes, LaneKeys, ReactionLine, ReporterSlot, SidePanels, TopHud } from "./GameHud";
import { LANES } from "@/game/constants";
import { DEFAULT_KEYS, useSettingsStore } from "@/stores/settingsStore";
import { tr } from "@/i18n/ui";

/** Q-02 분리 후 HUD 계층 회귀 안전망 */

// jsdom 의 navigator.language 는 en-US 다. 사양 조회가 비어 있지 않도록 언어를 고정한다.
beforeEach(() => {
  useSettingsStore.setState({ lang: "ko" });
});

const tier = { min: 30, name: "EXTREME APOLOGY", sub: "극한 사죄" };

describe("TopHud", () => {
  const base = {
    phase: "playing" as const,
    lang: "ko" as const,
    score: 12345,
    combo: 42,
    tier,
    helperOn: false,
    onPause: vi.fn(),
    onQuit: vi.fn(),
  };

  it("점수를 천단위 구분자로 보여준다", () => {
    render(<TopHud {...base} />);
    expect(screen.getByText("12,345")).toBeTruthy();
  });

  it("콤보가 있으면 콤보 수와 티어 이름을 보여준다", () => {
    // 콤보 라벨이 i18n 이 되어 별도 텍스트 노드로 나뉘므로 컨테이너에서 관계로 검증한다
    const { container } = render(<TopHud {...base} />);
    expect(container.textContent).toContain(`42 ${tr("ko", "hud.combo")}`);
    expect(screen.getByText("EXTREME APOLOGY")).toBeTruthy();
  });

  it("콤보가 1 이하면 콤보 표시를 숨긴다", () => {
    render(<TopHud {...base} combo={1} />);
    expect(screen.queryByText(/COMBO/)).toBeNull();
  });

  it("DDA 어시스트 활성 시 배지를 보여준다", () => {
    render(<TopHud {...base} helperOn />);
    expect(screen.getByText("도우미 모드 ON")).toBeTruthy();
  });

  it("일시정지 버튼은 playing 에서만 활성화된다", () => {
    const { rerender } = render(<TopHud {...base} />);
    const pause = screen.getByRole("button", { name: "일시정지" });
    expect((pause as HTMLButtonElement).disabled).toBe(false);

    rerender(<TopHud {...base} phase="ready" />);
    expect((screen.getByRole("button", { name: "일시정지" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("일시정지/나가기 콜백이 배선된다", () => {
    const onPause = vi.fn();
    const onQuit = vi.fn();
    render(<TopHud {...base} onPause={onPause} onQuit={onQuit} />);
    screen.getByRole("button", { name: "일시정지" }).click();
    screen.getByRole("button", { name: /나가기/ }).click();
    expect(onPause).toHaveBeenCalled();
    expect(onQuit).toHaveBeenCalled();
  });

  it("en 언어에서도 라벨이 번역된다", () => {
    render(<TopHud {...base} lang="en" />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});

describe("SidePanels", () => {
  const base = {
    sns: [],
    stock: 8200,
    stockDelta: 0.1,
    stockHistory: [8000, 8100, 8200],
    anger: 40,
  };

  it("주가와 분노 게이지를 보여준다", () => {
    render(<SidePanels {...base} />);
    expect(screen.getByText("¥8,200")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("주가 하락이면 하락률을 음수로 표시한다", () => {
    render(<SidePanels {...base} stockDelta={-0.15} />);
    expect(screen.getByText(/-15\.0%/)).toBeTruthy();
  });

  it("SNS 항목이 있으면 렌더된다", () => {
    render(
      <SidePanels
        {...base}
        sns={[{ id: 1, user: "@주린이", text: "진짜 반성하는 거 맞음?", tone: "positive" }]}
      />
    );
    expect(screen.getByText("@주린이")).toBeTruthy();
    expect(screen.getByText("진짜 반성하는 거 맞음?")).toBeTruthy();
  });

  it("SNS 가 비면 대기 문구를 보여준다", () => {
    render(<SidePanels {...base} />);
    // 생략부호(…) 는 소스 인코딩에 민감하므로 부분 일치로 확인한다
    expect(screen.getByText(/반응을 기다리는 중/)).toBeTruthy();
  });
});

describe("LaneKeys", () => {
  const base = {
    lanes: LANES,
    keyMap: { ...DEFAULT_KEYS },
    lang: "ko" as const,
    pressedLanes: [] as number[],
    onPress: vi.fn(),
    onRelease: vi.fn(),
  };

  it("레인 4개의 버튼이 렌더된다", () => {
    render(<LaneKeys {...base} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("U-05: 각 버튼에 각도 이름과 바인딩 키가 aria-label 로 붙는다", () => {
    render(<LaneKeys {...base} />);
    expect(screen.getByRole("button", { name: "가벼운 목례 (A)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "최종 사죄 (SPACE)" })).toBeTruthy();
  });

  it("U-05: 눌린 레인은 aria-pressed 로 노출된다", () => {
    render(<LaneKeys {...base} pressedLanes={[2]} />);
    const pressed = screen.getByRole("button", { name: "극한 사죄 (D)" });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
  });

  it("커스텀 키맵의 라벨을 사용한다", () => {
    render(<LaneKeys {...base} keyMap={{ q: 0, w: 1, e: 2, r: 3 }} />);
    expect(screen.getByRole("button", { name: "가벼운 목례 (Q)" })).toBeTruthy();
  });

  it("B-07: 포인터 ID 를 콜백에 전달한다", () => {
    const onPress = vi.fn();
    render(<LaneKeys {...base} onPress={onPress} />);
    const btn = screen.getByRole("button", { name: /15|가벼운/ });
    btn.dispatchEvent(
      Object.assign(new Event("pointerdown", { bubbles: true }), { pointerId: 42 })
    );
    expect(onPress).toHaveBeenCalledWith(0, 42);
  });

  it("pointerup 이 release 를 부른다", () => {
    const onRelease = vi.fn();
    render(<LaneKeys {...base} onRelease={onRelease} />);
    const btn = screen.getByRole("button", { name: /가벼운/ });
    btn.dispatchEvent(
      Object.assign(new Event("pointerup", { bubbles: true }), { pointerId: 7 })
    );
    expect(onRelease).toHaveBeenCalledWith(0, 7);
  });

  it("그룹에 접근성 라벨이 붙는다", () => {
    render(<LaneKeys {...base} />);
    expect(screen.getByRole("group", { name: "사죄 각도 키" })).toBeTruthy();
  });
});

describe("ReporterSlot / ReactionLine / CameraFlashes", () => {
  it("기자 말풍선 위치 컨테이너가 자식을 감싼다", () => {
    render(
      <ReporterSlot>
        <span>기자 질문</span>
      </ReporterSlot>
    );
    expect(screen.getByText("기자 질문")).toBeTruthy();
  });

  it("반응이 없으면 아무 것도 그리지 않는다", () => {
    const { container } = render(<ReactionLine reaction={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("나쁜 반응은 분홍, 좋은 반응은 초록으로 표시된다", () => {
    const { rerender } = render(<ReactionLine reaction={{ id: 1, text: "성의가 없군요.", tone: "bad" }} />);
    expect(screen.getByText("성의가 없군요.").className).toContain("text-rose-400");
    rerender(<ReactionLine reaction={{ id: 2, text: "진심이 느껴집니다.", tone: "good" }} />);
    expect(screen.getByText("진심이 느껴집니다.").className).toContain("text-emerald-300");
  });

  it("카메라 플래시가 위치 지정과 함께 렌더된다", () => {
    const { container } = render(
      <CameraFlashes flashes={[{ id: 1, x: 50, y: 30 }]} />
    );
    const flash = container.querySelector(".animate-flash") as HTMLElement;
    expect(flash.style.left).toBe("50%");
    expect(flash.style.top).toBe("30%");
  });
});
