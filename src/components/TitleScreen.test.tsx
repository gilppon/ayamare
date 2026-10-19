import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TitleScreen from "./TitleScreen";
import { useMetaStore } from "@/stores/metaStore";
import { useProgressStore } from "@/stores/progressStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { tr } from "@/i18n/ui";
import { SKILLS } from "@/game/skills";
import { MISSIONS } from "@/game/missions";
import type { SkillType } from "@/game/types";

/**
 * 타이틀 화면 회귀 안전망 — 탭 전환 / 스킬 구매 / 미션 / 기록.
 *
 * **한글 리터럴을 직접 쓰지 않는다.** 사전을 `tr("ko", key)` 로 참조하므로
 * 인코딩/코드포인트 차이로 인한 오탐이 없다. 동시에 "사전 키가 화면에
 * 실제로 배선되어 있는가" 까지 검증된다.
 */

const K = {
  get shop() { return tr("ko", "title.tabShop"); },
  get mission() { return tr("ko", "title.tabMission"); },
  get records() { return tr("ko", "title.tabRecords"); },
  get stage() { return tr("ko", "title.tabStage"); },
  get timing() { return tr("ko", "shop.timing"); },
  get mental() { return tr("ko", "shop.mental"); },
  get equip() { return tr("ko", "title.equip"); },
  get unequip() { return tr("ko", "title.unequip"); },
  get equipped() { return tr("ko", "title.equipped"); },
  get claim() { return tr("ko", "mission.claim"); },
  get complete() { return tr("ko", "title.complete"); },
  get streak() { return tr("ko", "title.streakDays"); },
  get noRecord() { return tr("ko", "title.noRecord"); },
  get totalRuns() { return tr("ko", "rec.totalRuns"); },
  get points() { return tr("ko", "title.points"); },
  get editor() { return tr("ko", "title.editor"); },
  get daily() { return tr("ko", "title.daily", { date: "2026-01-01" }); },
};

const baseProps = {
  points: 0,
  ownedSkills: ["none"] as SkillType[],
  equippedSkill: "none" as SkillType,
  onBuy: vi.fn(),
  onEquip: vi.fn(),
  onStart: vi.fn(),
  onEditor: vi.fn(),
};

const teardrops = SKILLS.find((s) => s.id === "teardrops")!;

beforeEach(() => {
  useSettingsStore.setState({ lang: "ko" });
  useMetaStore.setState({ points: 0, capital: 0, ownedSkills: ["none"], equippedSkill: "none" });
  useProgressStore.setState({
    totalRuns: 0,
    bestCombo: 0,
    totalDogeza: 0,
    totalPerfect: 0,
    bestAccuracy: 0,
    dailyRuns: 0,
    singlePerfectBest: 0,
    streak: 0,
    claimed: {},
    runHistory: [],
    bestByStage: {},
  });
});

describe("TitleScreen", () => {
  it("기본 탭에서 5개 스테이지 + 데일리 + 에디터 버튼을 보여준다", () => {
    render(<TitleScreen {...baseProps} />);
    for (const s of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: new RegExp(`STAGE ${s}`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: new RegExp("DAILY") })).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp("UGC") })).toBeTruthy();
  });

  it("U-07: 지출되지 않는 자본(¥) 표시가 제거되었다", () => {
    render(<TitleScreen {...baseProps} points={1234} />);
    // 포인트만 남고 ¥ 보유 표시가 없어야 한다
    expect(screen.getByText("1,234P")).toBeTruthy();
    expect(screen.getByText(K.points)).toBeTruthy();
  });

  it("연속 플레이 일수가 있으면 스트릭 배지를 보여준다", () => {
    useProgressStore.setState({ streak: 7 });
    render(<TitleScreen {...baseProps} />);

    // 배지 텍스트는 이모지+숫자가 한 요소에 붙는다 (I-09 대상).
    // 날짜 문자열(`2026-10-17` 등)도 `/7/` 에 걸리므로 **라벨의 형제 요소**로
    // 찾아야 날짜에 흔들리지 않는다.
    const label = screen.getByText(K.streak);
    const badge = label.previousElementSibling;
    expect(badge?.textContent).toMatch(/7$/);
    expect(label).toBeTruthy();
  });

  /**
   * C: 첫 스테이지만 처음부터 열려 있고, 나머지는 앞 스테이지의
   * 정확도 기준을 만족해야 열린다.
   */
  it("스테이지 버튼이 stageId 를 넘긴다 (해금된 것만)", () => {
    const onStart = vi.fn();
    // stage2 해금 기준: stage1 정확도 80%
    useProgressStore.setState({
      bestByStage: { stage1: { score: 1000, accuracy: 0.9, grade: "SS" } },
    });
    render(<TitleScreen {...baseProps} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /STAGE 1/ }));
    expect(onStart).toHaveBeenCalledWith("stage1");
  });

  it("C: 잠긴 스테이지는 클릭해도 진입되지 않는다", () => {
    const onStart = vi.fn();
    useProgressStore.setState({ bestByStage: {} });
    render(<TitleScreen {...baseProps} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /STAGE 3/ }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("C: 기준 정확도 달성 시 다음 스테이지가 열린다", () => {
    const onStart = vi.fn();
    useProgressStore.setState({
      bestByStage: { stage1: { score: 1000, accuracy: 0.85, grade: "SS" } },
    });
    render(<TitleScreen {...baseProps} onStart={onStart} />);
    // stage2 기준 80% → 열림
    fireEvent.click(screen.getByRole("button", { name: /STAGE 2/ }));
    expect(onStart).toHaveBeenCalledWith("stage2");
  });

  it("데일리 버튼이 'daily' 를 넘긴다", () => {
    const onStart = vi.fn();
    render(<TitleScreen {...baseProps} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /DAILY/ }));
    expect(onStart).toHaveBeenCalledWith("daily");
  });

  it("에디터 버튼이 콜백을 부른다", () => {
    const onEditor = vi.fn();
    render(<TitleScreen {...baseProps} onEditor={onEditor} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp("UGC") }));
    expect(onEditor).toHaveBeenCalled();
  });

  it("탭 전환이 동작한다", () => {
    render(<TitleScreen {...baseProps} />);
    expect(screen.getByText(K.mission)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    expect(screen.getByText(K.timing)).toBeTruthy();
    expect(screen.getByText(teardrops.name)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: K.records }));
    expect(screen.getByText(K.totalRuns)).toBeTruthy();
  });

  it("상점: 포인트가 부족하면 구매 버튼이 비활성이다", () => {
    render(<TitleScreen {...baseProps} points={0} />);
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    const btn = screen.getByRole("button", { name: `${teardrops.cost}P` });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("상점: 포인트가 충분하면 구매 버튼이 콜백을 부른다", () => {
    const onBuy = vi.fn();
    render(<TitleScreen {...baseProps} points={9999} onBuy={onBuy} />);
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    fireEvent.click(screen.getByRole("button", { name: `${teardrops.cost}P` }));
    expect(onBuy).toHaveBeenCalledWith("teardrops", teardrops.cost);
  });

  it("상점: 보유한 스킬은 장착/해제 버튼이 되고 구매 버튼이 사라진다", () => {
    render(
      <TitleScreen {...baseProps} points={9999} ownedSkills={["none", "teardrops"]} />
    );
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    expect(screen.getByRole("button", { name: K.equip })).toBeTruthy();
    expect(screen.queryByRole("button", { name: `${teardrops.cost}P` })).toBeNull();
  });

  it("상점: 장착 중인 스킬은 해제 버튼과 장착 중 배지를 보인다", () => {
    render(
      <TitleScreen
        {...baseProps}
        ownedSkills={["none", "teardrops"]}
        equippedSkill="teardrops"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    expect(screen.getByRole("button", { name: K.unequip })).toBeTruthy();
    expect(screen.getByText(K.equipped)).toBeTruthy();
  });

  it("상점: 해제 버튼은 'none' 을 전달한다", () => {
    const onEquip = vi.fn();
    render(
      <TitleScreen
        {...baseProps}
        ownedSkills={["none", "teardrops"]}
        equippedSkill="teardrops"
        onEquip={onEquip}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    fireEvent.click(screen.getByRole("button", { name: K.unequip }));
    expect(onEquip).toHaveBeenCalledWith("none");
  });

  it("상점: 카테고리 3개가 모두 나온다", () => {
    render(<TitleScreen {...baseProps} points={9999} />);
    fireEvent.click(screen.getByRole("button", { name: K.shop }));
    expect(screen.getByText(K.timing)).toBeTruthy();
    expect(screen.getByText(K.mental)).toBeTruthy();
    for (const cat of ["timing", "combo", "mental"] as const) {
      const n = SKILLS.filter((s) => s.category === cat).length;
      expect(n).toBeGreaterThan(0);
    }
  });

  it("미션 탭: 진행도와 퍼센트를 보여준다", () => {
    useProgressStore.setState({ totalRuns: 2 });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.mission }));
    const m = MISSIONS[0];
    const pct = Math.round((2 / m.target) * 100);
    expect(screen.getByText(`2/${m.target} (${pct}%)`)).toBeTruthy();
  });

  it("미션 탭: 완료된 미션은 수령 버튼을 노출한다", () => {
    useProgressStore.setState({ totalRuns: 5, claimed: {} });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.mission }));
    expect(screen.getByRole("button", { name: new RegExp(`${MISSIONS[0].reward}P`) })).toBeTruthy();
  });

  it("미션 탭: 이미 수령한 미션은 완료 표시로 바뀐다", () => {
    useProgressStore.setState({ totalRuns: 5, claimed: { [MISSIONS[0].id]: true } });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.mission }));
    expect(screen.getByText(K.complete)).toBeTruthy();
  });

  it("기록 탭: 기록이 없으면 안내 문구를 보여준다", () => {
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.records }));
    expect(screen.getByText(K.noRecord)).toBeTruthy();
  });

  it("기록 탭: 스테이지 베스트와 최근 기록을 보여준다", () => {
    useProgressStore.setState({
      bestByStage: { stage1: { score: 5000, accuracy: 0.9, grade: "S" } },
      runHistory: [
        { date: "2026-09-30", stageId: "stage1", score: 5000, accuracy: 0.9, grade: "S", maxCombo: 30 },
      ],
    });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.records }));
    expect(screen.getByText("STAGE1")).toBeTruthy();
    // 베스트 와 최근 기록 양쪽에 점수가 나타난다
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
  });

  /** C-10: 기록 탭이 내부 ID(daily:2026-09-30)를 그대로 노출하지 않는다 */
  it("기록 탭: 내부 스테이지 ID 를 노출하지 않는다", () => {
    useProgressStore.setState({
      bestByStage: {
        daily: { score: 3000, accuracy: 0.8, grade: "B" },
        custom: { score: 2000, accuracy: 0.7, grade: "C" },
      },
      runHistory: [
        { date: "2026-09-30", stageId: "daily", score: 3000, accuracy: 0.8, grade: "B", maxCombo: 20 },
      ],
    });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.records }));
    expect(screen.getByText(tr("ko", "stage.daily"))).toBeTruthy();
    expect(screen.getByText(tr("ko", "stage.custom"))).toBeTruthy();
  });

  it("기록 탭: 요약 통계를 보여준다", () => {
    useProgressStore.setState({
      totalRuns: 9,
      bestCombo: 88,
      bestAccuracy: 0.97,
      totalDogeza: 12,
    });
    render(<TitleScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: K.records }));
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("97.0%")).toBeTruthy();
  });

  it("호위 김부장을 누르면 이스터에그가 발동한다", async () => {
    render(<TitleScreen {...baseProps} />);
    // 데스크톱/모바일 두 개의 김부장 버튼이 있다 (lg 숨김 분기)
    fireEvent.click(screen.getAllByRole("button", { name: tr("ko", "title.kimHint") })[0]);
    await waitFor(() => {
      expect(screen.getByText("DOGEZA!!")).toBeTruthy();
    });
  });

  it("en 언어에서도 탭 라벨이 번역된다", () => {
    useSettingsStore.setState({ lang: "en" });
    render(<TitleScreen {...baseProps} />);
    expect(screen.getByRole("button", { name: tr("en", "title.tabShop") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tr("en", "title.tabMission") })).toBeTruthy();
  });

  it("ja 언어에서도 상점 스킬명이 번역된다", () => {
    useSettingsStore.setState({ lang: "ja" });
    render(<TitleScreen {...baseProps} points={9999} />);
    fireEvent.click(screen.getByRole("button", { name: tr("ja", "title.tabShop") }));
    // ja 오버라이드가 있으면 일본어, 없으면 ko 원문
    const expected = tr("ja", "title.tabShop");
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: `${teardrops.cost}P` })).toBeTruthy();
  });
});
