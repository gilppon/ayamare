import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChartEditor from "./ChartEditor";
import ManagerKim from "./ManagerKim";
import { AngerMeter, SnsFeed, StockPanel } from "./HUD";
import PlayerCharacter from "./PlayerCharacter";
import { ANGER_STEPS } from "@/game/constants";
import { tr } from "@/i18n/ui";
import { StubAudioBuffer } from "@/test/setup";

/** 에디터 · 캐릭터 · HUD 계층 회귀 안전망 */

beforeEach(() => {
  localStorage.clear();
});

describe("StockPanel", () => {
  it("주가를 천단위 구분자로 보여준다", () => {
    render(<StockPanel stock={12345} delta={0.1} history={[12000, 12345]} />);
    expect(screen.getByText("¥12,345")).toBeTruthy();
  });

  it("상승이면 초록, 하락이면 분홍", () => {
    const { container, rerender } = render(
      <StockPanel stock={100} delta={0.05} history={[100]} />
    );
    const polyline = container.querySelector("polyline") as SVGPolylineElement;
    expect(polyline.getAttribute("stroke")).toBe("#34d399");
    rerender(<StockPanel stock={100} delta={-0.05} history={[100]} />);
  });

  it("변동이 없어도 폴리라인이 그려진다 (평평한 선)", () => {
    const { container } = render(
      <StockPanel stock={100} delta={0} history={[100, 100, 100]} />
    );
    const polyline = container.querySelector("polyline") as SVGPolylineElement;
    expect(polyline.getAttribute("points")).toBeTruthy();
  });
});

describe("AngerMeter", () => {
  it("I-09: 이모지 대신 고정된 pip 을 그린다", () => {
    const { container } = render(<AngerMeter anger={50} />);
    const pips = container.querySelectorAll('[aria-hidden="true"] > span');
    expect(pips).toHaveLength(ANGER_STEPS);
    expect(screen.queryByText(/🔥/)).toBeNull();
  });

  it("I-09: 분노에 따라 채워진 pip 수가 늘어난다", () => {
    const filled = (anger: number) => {
      const { container } = render(<AngerMeter anger={anger} />);
      return Array.from(container.querySelectorAll('[aria-hidden="true"] > span')).filter(
        (el) => (el as HTMLElement).style.backgroundColor !== "rgba(255, 255, 255, 0.14)"
      ).length;
    };
    expect(filled(0)).toBe(0);
    expect(filled(100)).toBe(ANGER_STEPS);
    expect(filled(60)).toBeGreaterThan(filled(20));
  });

  it("I-09: 게이지가 role=meter 로 접근 가능하다", () => {
    render(<AngerMeter anger={42} />);
    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("42");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
  });

  it("값을 범위로 표시한다", () => {
    render(<AngerMeter anger={150} />);
    expect(screen.getByText("100")).toBeTruthy();
  });
});

describe("SnsFeed", () => {
  it("U-06: 헤더가 i18n 키를 사용한다", () => {
    render(<SnsFeed items={[]} />);
    expect(screen.getByText(tr("ko", "hud.live"))).toBeTruthy();
    expect(screen.getByText(tr("ko", "hud.tag"))).toBeTruthy();
  });

  it("항목을 tone 색으로 구분해 렌더한다", () => {
    render(
      <SnsFeed
        items={[
          { id: 1, user: "@a", text: "긍정", tone: "positive" },
          { id: 2, user: "@b", text: "부정", tone: "negative" },
        ]}
      />
    );
    expect(screen.getByText("@a")).toBeTruthy();
    const pos = screen.getByText("@a");
    expect((pos as HTMLElement).style.color).toBe("rgb(52, 211, 153)");
  });
});

describe("ManagerKim", () => {
  it("SVG 를 role=img + aria-label 로 노출한다", () => {
    const { container } = render(<ManagerKim angle={45} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toContain("김부장");
  });

  it("도게자면 다리 아트워크가 바뀐다", () => {
    const { container } = render(<ManagerKim angle={0} dogeza />);
    expect(container.querySelector("#manager-kim-dogeza-legs")).toBeTruthy();
    expect(container.querySelector("#manager-kim-standing-legs")).toBeNull();
  });

  it("P-01: setPose 핸들로 회전을 DOM 직접 갱신한다", () => {
    const ref = { current: null as { setPose: (a: number, d: boolean) => void } | null };
    const { container } = render(<ManagerKim ref={ref} angle={0} />);
    const before = container.querySelector("#manager-kim-torso")?.parentElement?.getAttribute("transform");
    ref.current?.setPose(90, false);
    const after = container.querySelector("#manager-kim-torso")?.parentElement?.getAttribute("transform");
    expect(before).not.toBe(after);
    expect(after).toContain("90");
  });

  it("setPose(_, true) 는 도게자 각도 108 을 쓴다", () => {
    const ref = { current: null as { setPose: (a: number, d: boolean) => void } | null };
    const { container } = render(<ManagerKim ref={ref} />);
    ref.current?.setPose(0, true);
    const t = container.querySelector("#manager-kim-torso")?.parentElement?.getAttribute("transform");
    expect(t).toContain("108");
  });

  it("각도가 aria-label 에 반영된다", () => {
    render(<ManagerKim angle={52} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("52");
  });
});

describe("PlayerCharacter", () => {
  it("분노가 70 이상이면 땀 방울을 표시한다", () => {
    const kimRef = { current: null as { setPose: () => void } | null };
    const { container, rerender } = render(
      <PlayerCharacter kimRef={kimRef} dogeza={false} anger={30} />
    );
    expect(container.textContent).not.toContain("💦");
    rerender(<PlayerCharacter kimRef={kimRef} dogeza={false} anger={80} />);
    expect(container.textContent).toContain("💦");
  });
});

describe("ChartEditor", () => {
  it("제목/질문/플레이 버튼을 렌더한다", () => {
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(tr("ko", "ed.titlePh"))).toBeTruthy();
    expect(screen.getByPlaceholderText(tr("ko", "ed.qPh"))).toBeTruthy();
  });

  it("노트가 없으면 플레이 버튼이 비활성이다", () => {
    localStorage.setItem("apolo_editor_v2", JSON.stringify({ cells: {}, title: "X", question: "Q" }));
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    const play = screen.getByRole("button", { name: new RegExp(tr("ko", "ed.play")) });
    expect((play as HTMLButtonElement).disabled).toBe(true);
  });

  it("편집 모드 버튼 3종(노트/홀드/기믹)이 있다", () => {
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: tr("ko", "ed.modeNote") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tr("ko", "ed.modeHold") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tr("ko", "ed.modeGimmick") })).toBeTruthy();
  });

  it("셀을 토글하면 노트 수와 플레이 활성화 상태가 바뀐다", () => {
    localStorage.setItem("apolo_editor_v2", JSON.stringify({ cells: {}, title: "X", question: "Q" }));
    const onPlay = vi.fn();
    render(<ChartEditor onPlay={onPlay} onClose={vi.fn()} />);

    const cell = screen.getAllByRole("button", { name: /15°/ })[0];
    fireEvent.click(cell);

    const play = screen.getByRole("button", { name: new RegExp(tr("ko", "ed.play")) });
    expect((play as HTMLButtonElement).disabled).toBe(false);
  });

  it("JSON 가져오기로 노트를 복원한다 (B-09 왕복)", async () => {
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    const input = document.querySelector('input[accept="application/json"]') as HTMLInputElement;
    const chart = {
      title: "IMPORTED",
      subtitle: "",
      bpm: 130,
      notes: [
        { id: 1, time: 2 * 4 * (60 / 130) + 0.5 * (60 / 130), lane: 1, action: "bow45", hold: 0 },
      ],
      questions: [],
      duration: 20,
    };
    const file = new File([JSON.stringify(chart)], "c.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(chart) });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect((screen.getByDisplayValue("IMPORTED") as HTMLInputElement)).toBeTruthy();
    });
    const play = screen.getByRole("button", { name: new RegExp(tr("ko", "ed.play")) });
    expect((play as HTMLButtonElement).disabled).toBe(false);
  });

  it("닫기 버튼이 콜백을 부른다", () => {
    const onClose = vi.fn();
    render(<ChartEditor onPlay={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("U-12: 홀드/기믹 카운트를 요약한다", () => {
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/◌ 0/)).toBeTruthy();
    expect(screen.getByText(/H 0/)).toBeTruthy();
  });

  /**
   * C-01 회귀 — 자동채보 결과가 100% 버려지던 버그.
   *
   * `onFile` 이 같은 틱에 `importJson` 과 `setTitle` 을 연달아 불렀다.
   * `persist` 가 함수형 업데이트가 아닌 **plain object** 를 `setState` 에 넘기면서
   * `setTitle` 이 클로저로 잡은 값이 **임포트 이전 상태** 였다.
   * React 가 둘을 배칭해 뒤의 것이 앞의 셀을 덮었고,
   * 결과적으로 제목만 바뀌고 노트는 전혀导入되지 않았다.
   *
   * 여기서는 "제목이 바뀌면서 **노트도 함께** 들어가는지" 를 함께 검증한다.
   */
  it("C-01: 자동채보가 제목과 노트를 함께 반영한다 (임포트 결과를 덮어쓰지 않는다)", async () => {
    localStorage.setItem("apolo_editor_v2", JSON.stringify({ cells: {}, title: "OLD", question: "Q" }));

    // `detectPeaks` 는 국소 최대를 찾으므로 실제音频처럼 **버스트** 가 있어야 한다.
    // 전부 0인 스텁 버퍼는 검출 결과가 0건이라 파이프라인을 못 탄다.
    const sr = 44100;
    const buf = new StubAudioBuffer(1, sr * 12, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const t = i / sr;
      const burst = Math.floor(t * 4) % 2 === 0 ? 1 : 0.02;
      ch[i] = burst * Math.sin(i);
    }
    const decoderProto = AudioContext.prototype as unknown as {
      decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
    };
    vi.spyOn(decoderProto, "decodeAudioData").mockResolvedValue(buf as unknown as AudioBuffer);

    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);

    const input = document.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    const audio = new File([new Uint8Array(1)], "song.wav", { type: "audio/wav" });
    Object.defineProperty(audio, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
    fireEvent.change(input, { target: { files: [audio] } });

    // 제목은 파일명으로 바뀌고…
    await waitFor(() => {
      expect((screen.getByDisplayValue("CUSTOM — song.wav") as HTMLInputElement).value).toBe(
        "CUSTOM — song.wav"
      );
    });
    // …임포트한 노드가 살아 있어야 한다 (0 이면 C-01 회귀)
    const play = screen.getByRole("button", { name: new RegExp(tr("ko", "ed.play")) }) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    // 실제 들어온 노트 수를 메시지에 보여준다
    expect(screen.getByText(/자동채보 초안 \d+노트 생성됨/)).toBeTruthy();
  });

  /**
   * C-02 회귀 — 8마디 고정 격자가 자동채보 결과를 조용히 잘랐다.
   * 임포트 결과가 격자 밖이면 사용자에게 알린다 (조용한 절단 금지).
   */
  it("C-02: 격자를 넘는 노트는 조용히 버리지 않고 알려 준다", async () => {
    localStorage.setItem("apolo_editor_v2", JSON.stringify({ cells: {}, title: "X", question: "Q" }));
    render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);

    const input = document.querySelector('input[accept="application/json"]') as HTMLInputElement;
    const beat = 60 / 130;
    const chart = {
      title: "LONG",
      subtitle: "",
      bpm: 130,
      // 40마디째의 노트 — 8마디 고정 격자라면 전부 버려진다
      notes: [
        { id: 1, time: 30 * 4 * beat, lane: 0, action: "bow15", hold: 0 },
        { id: 2, time: 39 * 4 * beat, lane: 2, action: "bow90", hold: 0 },
      ],
      questions: [],
      duration: 60,
    };
    const file = new File(["x"], "long.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(chart) });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("LONG")).toBeTruthy();
    });
    // 격자가 늘어나 노트가 살아 있다
    const play = screen.getByRole("button", { name: new RegExp(tr("ko", "ed.play")) }) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    // 절단 안내는 표시되지 않는다 (요구 마디수가 상한 이내)
    expect(screen.queryByText(/excluded|제외/)).toBeNull();
  });

  /** 편집 상태가 바뀌면 언마운트 시점에 localStorage 에 남아야 한다 */
  it("편집 결과가 언마운트 시점에 저장된다", () => {
    localStorage.setItem("apolo_editor_v2", JSON.stringify({ cells: {}, title: "X", question: "Q" }));
    const { unmount } = render(<ChartEditor onPlay={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /15°/ })[0]);
    unmount();

    const saved = JSON.parse(localStorage.getItem("apolo_editor_v2") as string) as {
      cells: Record<string, unknown>;
    };
    expect(Object.keys(saved.cells).length).toBe(1);
  });
});
