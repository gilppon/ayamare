import type { Judgment, SkillType } from "./types";
import type { Lang } from "@/i18n/ui";

export type SkillCategory = "timing" | "combo" | "mental";

export interface SkillDef {
  id: SkillType;
  name: string;
  cost: number;
  desc: string;
  category: SkillCategory;
}

export const SKILLS: SkillDef[] = [
  { id: "teardrops", name: "눈물 안약", cost: 750, desc: "GREAT 판정을 PERFECT로 보정", category: "timing" },
  { id: "steady_hands", name: "떨림 방지 장갑", cost: 650, desc: "판정 윈도우 +12% (관대)", category: "timing" },
  { id: "wide_heart", name: "관대한 마음", cost: 850, desc: "BAD 판정을 GOOD으로 완화", category: "timing" },
  { id: "bulletproof", name: "방탄 정장", cost: 1000, desc: "MISS 시 콤보 보호 + 주가 하락 방어", category: "combo" },
  { id: "combo_chain", name: "박수 유도 요원", cost: 950, desc: "PERFECT 시 콤보 +2", category: "combo" },
  { id: "opening_cheer", name: "사전 각본", cost: 450, desc: "시작 분노 -12, 시작 주가 +5%", category: "mental" },
  { id: "media_control", name: "언론 통제", cost: 1400, desc: "분노 플래시 무효 + 분노 증가 -15%", category: "mental" },
  { id: "calm_voice", name: "저음 보이스", cost: 700, desc: "분노 증가 -25%, 분노 감소 +15%", category: "mental" },
  { id: "safe_asset", name: "차명 계좌", cost: 1100, desc: "주가 하락 -35%, 상승 +10%", category: "combo" },
];

export const SKILL_MAP: Record<SkillType, SkillDef | undefined> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s])
) as Record<SkillType, SkillDef | undefined>;

/** 영/일 이름·설명 오버라이드 (ko는 SKILLS 원문이 정본) */
const SKILL_TEXT_OVERRIDE: Record<"en" | "ja", Record<string, { name: string; desc: string }>> = {
  en: {
    teardrops: { name: "Tear Drops", desc: "Upgrade GREAT judgments to PERFECT" },
    steady_hands: { name: "Steady Gloves", desc: "Timing windows +12% (lenient)" },
    wide_heart: { name: "Big Heart", desc: "Soften BAD judgments to GOOD" },
    bulletproof: { name: "Bulletproof Suit", desc: "Protect combo and stock on MISS" },
    combo_chain: { name: "Hype Agent", desc: "+2 combo on PERFECT" },
    opening_cheer: { name: "Scripted Opener", desc: "Start with -12 anger, +5% stock" },
    media_control: { name: "Media Control", desc: "Nullify anger flash storms, -15% anger gain" },
    calm_voice: { name: "Deep Voice", desc: "-25% anger gain, +15% anger relief" },
    safe_asset: { name: "Secret Account", desc: "-35% stock loss, +10% stock gain" },
  },
  ja: {
    teardrops: { name: "涙の目薬", desc: "GREAT判定をPERFECTに補正" },
    steady_hands: { name: "震え防止手袋", desc: "判定ウィンドウ+12%（甘め）" },
    wide_heart: { name: "寛大な心", desc: "BAD判定をGOODに緩和" },
    bulletproof: { name: "防弾スーツ", desc: "MISS時のコンボ保護＋株価防御" },
    combo_chain: { name: "拍手誘導員", desc: "PERFECTでコンボ+2" },
    opening_cheer: { name: "事前台本", desc: "開始時怒り-12、株価+5%" },
    media_control: { name: "報道統制", desc: "怒りフラッシュ無効＋怒り増加-15%" },
    calm_voice: { name: "低音ボイス", desc: "怒り増加-25%、怒り減少+15%" },
    safe_asset: { name: "別名口座", desc: "株価下落-35%、上昇+10%" },
  },
};

export function skillText(id: SkillType, lang: Lang): { name: string; desc: string } {
  const base = SKILL_MAP[id];
  if (!base) return { name: id, desc: "" };
  if (lang === "ko") return { name: base.name, desc: base.desc };
  const o = SKILL_TEXT_OVERRIDE[lang][id];
  return o ?? { name: base.name, desc: base.desc };
}

/** 장착 1개 + 보유 전체를 합친 활성 스킬 셋 (패시브 스태킹) */
export function activeSkills(owned: SkillType[], equipped: SkillType): Set<SkillType> {
  return new Set([...owned, equipped].filter((s) => s !== "none"));
}

export function hasSkill(skills: Set<SkillType> | SkillType[], id: SkillType): boolean {
  return skills instanceof Set ? skills.has(id) : skills.includes(id);
}

/** 보유 스킬에 따른 실효 타이밍 스케일 */
export function effectiveTimingScale(base: number, skills: Set<SkillType> | SkillType[]): number {
  let scale = base;
  if (hasSkill(skills, "steady_hands")) scale *= 1.12;
  return Math.min(1.8, scale);
}

/** 탭 판정 업그레이드 (teardrops → wide_heart 순) */
export function upgradeTapJudgment(j: Judgment, skills: Set<SkillType> | SkillType[]): Judgment {
  if (j === "GREAT" && hasSkill(skills, "teardrops")) return "PERFECT";
  if (j === "BAD" && hasSkill(skills, "wide_heart")) return "GOOD";
  return j;
}

export function upgradeReleaseJudgment(j: Judgment, skills: Set<SkillType> | SkillType[]): Judgment {
  if (j === "GREAT" && hasSkill(skills, "teardrops")) return "PERFECT";
  if (j === "BAD" && hasSkill(skills, "wide_heart")) return "GOOD";
  return j;
}

/** PERFECT 콤보 증가량 (combo_chain이면 +2) */
export function comboGain(judgment: Judgment, skills: Set<SkillType> | SkillType[]): number {
  if (judgment === "MISS") return 0;
  if (judgment === "PERFECT" && hasSkill(skills, "combo_chain")) return 2;
  return 1;
}

export function shouldProtectCombo(judgment: Judgment, skills: Set<SkillType> | SkillType[]): boolean {
  return judgment === "MISS" && hasSkill(skills, "bulletproof");
}

/** 분노 델타 보정. 양수(증가)는 감소, 음수(감소)는 증가 방향으로 보정. */
export function scaleAngerDelta(base: number, skills: Set<SkillType> | SkillType[]): number {
  let v = base;
  if (hasSkill(skills, "calm_voice")) {
    v = v > 0 ? v * 0.75 : v * 1.15;
  }
  if (hasSkill(skills, "media_control") && v > 0) {
    v *= 0.85;
  }
  return v;
}

/** 주가 승수(1+delta) 보정. safe_asset: 하락 완화, 상승 강화. */
export function scaleStockMultiplier(mult: number, skills: Set<SkillType> | SkillType[]): number {
  if (!hasSkill(skills, "safe_asset")) return mult;
  if (mult >= 1) return 1 + (mult - 1) * 1.1;
  return 1 - (1 - mult) * 0.65;
}

export function initialAngerBonus(skills: Set<SkillType> | SkillType[]): number {
  return hasSkill(skills, "opening_cheer") ? -12 : 0;
}

export function initialStockMultiplier(skills: Set<SkillType> | SkillType[]): number {
  return hasSkill(skills, "opening_cheer") ? 1.05 : 1;
}

/** 런 종료 시 반성포인트. score/500 + 정확도*200 + 최대콤보*2 + 도게자*15 */
export function earnPoints(score: number, accuracy: number, maxCombo: number, dogezaHits = 0): number {
  return Math.max(
    10,
    Math.round(score / 500 + accuracy * 200 + maxCombo * 2 + dogezaHits * 15)
  );
}
