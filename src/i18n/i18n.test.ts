import { describe, expect, it } from "vitest";
import { computeEnding, missLines, goodLines, randomSns, JOURNALIST_NAMES, LANE_NAMES } from "../game/constants";
import { buildChart } from "../game/chart";
import { buildDailyChart } from "../game/daily";
import { praiseForHit, tauntForMiss, intensifyQuestion, INITIAL_PRESS_CONTEXT } from "../game/journalistAI";
import { missionText, MISSIONS } from "../game/missions";
import { skillText, SKILLS } from "../game/skills";

describe("i18n completeness", () => {
  it("UI 사전: en/ja가 ko와 동일한 키를 가진다", async () => {
    const { tr, dictKeys } = await import("@/i18n/ui");
    expect([...dictKeys("en")].sort()).toEqual([...dictKeys("ko")].sort());
    expect([...dictKeys("ja")].sort()).toEqual([...dictKeys("ko")].sort());
    const sampleKeys = [
      "app.settings", "settings.title", "title.sub", "game.start",
      "res.retry", "ed.title", "hud.waiting", "mission.claim",
    ] as const;
    for (const k of sampleKeys) {
      for (const lang of ["ko", "en", "ja"] as const) {
        expect(tr(lang, k).length).toBeGreaterThan(0);
      }
    }
  });

  it("스킬/미션 텍스트가 3언어 모두 존재", () => {
    for (const s of SKILLS) {
      for (const lang of ["ko", "en", "ja"] as const) {
        const t = skillText(s.id, lang);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.desc.length).toBeGreaterThan(0);
      }
    }
    for (const m of MISSIONS) {
      for (const lang of ["ko", "en", "ja"] as const) {
        const t = missionText(m, lang);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.desc.length).toBeGreaterThan(0);
      }
    }
  });

  it("엔딩/리액션/SNS가 3언어 모두 존재", () => {
    for (const lang of ["ko", "en", "ja"] as const) {
      expect(computeEnding("SSS", false, lang).text.length).toBeGreaterThan(0);
      expect(computeEnding("F", false, lang).text.length).toBeGreaterThan(0);
      expect(missLines(lang).length).toBeGreaterThan(0);
      expect(goodLines(lang).length).toBeGreaterThan(0);
      expect(randomSns("positive", lang).text.length).toBeGreaterThan(0);
      expect(tauntForMiss(INITIAL_PRESS_CONTEXT, 0, lang).length).toBeGreaterThan(0);
      expect(praiseForHit(INITIAL_PRESS_CONTEXT, 0, lang).length).toBeGreaterThan(0);
      expect(intensifyQuestion("Q?", { ...INITIAL_PRESS_CONTEXT, missStreak: 3 }, 0, lang).length).toBeGreaterThan(2);
    }
  });

  it("차트 질문/제목이 3언어 모두 존재", () => {
    for (const stage of ["stage1", "stage2", "stage3", "stage4", "stage5"] as const) {
      for (const lang of ["ko", "en", "ja"] as const) {
        const c = buildChart(stage, lang);
        expect(c.title.length).toBeGreaterThan(0);
        for (const q of c.questions) expect(q.text.length).toBeGreaterThan(0);
      }
    }
    const d = buildDailyChart("2026-09-30", "ja");
    expect(d.questions[0].text.length).toBeGreaterThan(0);
  });

  it("기자명/레인명이 3언어 모두 존재", () => {
    const types = ["rookie", "economy", "investigative", "internet", "veteran", "boss"] as const;
    const actions = ["bow15", "bow45", "bow90", "dogeza"] as const;
    for (const lang of ["ko", "en", "ja"] as const) {
      for (const t of types) expect(JOURNALIST_NAMES[lang][t].length).toBeGreaterThan(0);
      for (const a of actions) expect(LANE_NAMES[lang][a].length).toBeGreaterThan(0);
    }
  });
});
