import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CountdownOverlay,
  DoneOverlay,
  LiveJudgment,
  PauseOverlay,
  ReadyOverlay,
} from "./Overlays";
import { keyLabelFor } from "@/game/keyLabel";
import { LANES } from "@/game/constants";
import { DEFAULT_KEYS } from "@/stores/settingsStore";

/** Q-02 분리 후 오버레이 계층 회귀 안전망 */

beforeEach(() => {
  vi.useRealTimers();
});

describe("keyLabelFor", () => {
  it("레인에 바인딩된 키를 대문자로 반환한다", () => {
    expect(keyLabelFor({ a: 0 }, 0, "X")).toBe("A");
  });

  it("스페이스는 SPACE 로 표시한다", () => {
    expect(keyLabelFor({ " ": 3 }, 3, "X")).toBe("SPACE");
  });

  it("바인딩이 없으면 폴백 라벨을 반환한다", () => {
    expect(keyLabelFor({}, 0, "FALLBACK")).toBe("FALLBACK");
  });

  it("기본 키맵에서 레인별 라벨을 찾는다", () => {
    for (const l of LANES) {
      expect(keyLabelFor(DEFAULT_KEYS, l.lane, l.keyLabel)).toBe(l.keyLabel);
    }
  });
});

describe("CountdownOverlay", () => {
  it("code/label 이 없으면 렌더하지 않는다", () => {
    const { container } = render(<CountdownOverlay code={null} label={null} title="T" />);
    expect(container.firstChild).toBeNull();
  });

  it("카운트 숫자와 곡 제목을 보여준다", () => {
    render(<CountdownOverlay code="3" label="3" title="STAGE 1" />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("STAGE 1")).toBeTruthy();
  });

  it("비트 도트 3개를 그린다", () => {
    const { container } = render(<CountdownOverlay code="1" label="1" title="T" />);
    expect(container.querySelectorAll(".rounded-full.h-2")).toHaveLength(3);
  });
});

describe("ReadyOverlay", () => {
  const base = {
    lanes: LANES,
    keyMap: { ...DEFAULT_KEYS },
    lang: "ko" as const,
    title: "STAGE 1 — 공식 계정 사고",
    subtitle: "SNS 실수부터",
    onStart: vi.fn(),
  };

  it("제목·부제·설명을 보여준다", () => {
    render(<ReadyOverlay {...base} />);
    expect(screen.getByText(/STAGE 1/)).toBeTruthy();
    expect(screen.getByText(/SNS 실수부터/)).toBeTruthy();
  });

  it("레인 4개의 조작 안내 카드를 그린다", () => {
    render(<ReadyOverlay {...base} />);
    expect(screen.getByText("가벼운 목례")).toBeTruthy();
    expect(screen.getByText("최종 사죄")).toBeTruthy();
  });

  it("시작 버튼이 콜백을 부른다", () => {
    const onStart = vi.fn();
    render(<ReadyOverlay {...base} onStart={onStart} />);
    screen.getByRole("button", { name: /시작/ }).click();
    expect(onStart).toHaveBeenCalled();
  });

  it("커스텀 키맵 라벨을 안내 카드에 반영한다", () => {
    render(<ReadyOverlay {...base} keyMap={{ q: 0, w: 1, e: 2, r: 3 }} />);
    expect(screen.getByText("Q")).toBeTruthy();
  });
});

describe("DoneOverlay", () => {
  it("종료 문구와 집계 중 문구를 보여준다", () => {
    render(<DoneOverlay lang="ko" />);
    expect(screen.getByText(/결과 집계 중/)).toBeTruthy();
    // 번역 누락 회귀: ko 사전이므로 한글이 나와야 한다
    const heading = screen.getByText(/기자/);
    expect(heading.textContent).not.toMatch(/[a-zA-Z]/);
    expect(heading.textContent).not.toContain("会见");
  });
});

describe("PauseOverlay", () => {
  const base = { lang: "ko" as const, onResume: vi.fn(), onQuit: vi.fn() };

  it("U-01: 스크린리더에 상태를 알린다", () => {
    render(<PauseOverlay {...base} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("일시정지")).toBeTruthy();
  });

  it("재개/포기 버튼이 각각 콜백을 부른다", () => {
    const onResume = vi.fn();
    const onQuit = vi.fn();
    render(<PauseOverlay {...base} onResume={onResume} onQuit={onQuit} />);
    screen.getByRole("button", { name: "계속하기" }).click();
    screen.getByRole("button", { name: /포기하고 나가기/ }).click();
    expect(onResume).toHaveBeenCalled();
    expect(onQuit).toHaveBeenCalled();
  });

  it("재개 버튼이 포커스를 자동 획득한다", () => {
    render(<PauseOverlay {...base} />);
    expect(document.activeElement?.textContent).toBe("계속하기");
  });

  it("en 언어에서도 동작한다", () => {
    render(<PauseOverlay {...base} lang="en" />);
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});

describe("LiveJudgment", () => {
  it("U-04: 스크린리더 전용 live region 을 렌더한다", () => {
    render(<LiveJudgment text="PERFECT 극한 사죄" />);
    const el = document.querySelector('[role="status"][aria-live="polite"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("PERFECT 극한 사죄");
  });
});
