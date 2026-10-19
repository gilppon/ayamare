import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SkillType } from "@/game/types";

interface MetaState {
  /**
   * U-07: 구버전 가상 화폐(¥). 신규 재화는 `points` 뿐이며 이 값은 어디에도
   * 지출되지 않았다. 최초 마이그레이션에서 points 로 환전된 뒤 남아 있던 잔재다.
   * 기존 세이브 호환을 위해 필드는 유지하되 더 이상 적립하지 않는다.
   */
  capital: number;
  /** 반성포인트 (신규 재화, 스킬 구매용) */
  points: number;
  ownedSkills: SkillType[];
  equippedSkill: SkillType;
  buy: (skillId: SkillType, cost: number) => boolean;
  equip: (skillId: SkillType) => void;
  addPoints: (v: number) => void;
}

function readCapital(): number {
  try {
    return parseInt(localStorage.getItem("apolo_capital") || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function readPoints(capital: number): number {
  try {
    const raw = localStorage.getItem("apolo_points");
    if (raw != null) return parseInt(raw, 10) || 0;
    // 일회성 마이그레이션: 기존 자본금을 포인트로 전환 (¥50 = 1P)
    if (capital > 0) return Math.floor(capital / 50);
    return 0;
  } catch {
    return 0;
  }
}

function readSkills(): SkillType[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("apolo_skills") || '["none"]');
    // 구버전 스킬 id는 그대로 유효 (신규 타입의 부분집합)
    return Array.isArray(parsed) ? parsed : ["none"];
  } catch {
    return ["none"];
  }
}

export const useMetaStore = create<MetaState>()(
  persist(
    (set, get) => {
      const capital = typeof window !== "undefined" ? readCapital() : 0;
      return {
        capital,
        points: typeof window !== "undefined" ? readPoints(capital) : 0,
        ownedSkills: typeof window !== "undefined" ? readSkills() : ["none"],
        equippedSkill:
          (typeof window !== "undefined"
            ? (localStorage.getItem("apolo_equip") as SkillType)
            : "none") || "none",
        buy: (skillId, cost) => {
          const { points, ownedSkills } = get();
          if (points < cost || ownedSkills.includes(skillId)) return false;
          set({
            points: points - cost,
            ownedSkills: [...ownedSkills, skillId],
          });
          return true;
        },
        equip: (skillId) => set({ equippedSkill: skillId }),
        addPoints: (v) => set((s) => ({ points: s.points + v })),
      };
    },
    {
      name: "apolo_meta",
      partialize: (s) => ({
        capital: s.capital,
        points: s.points,
        ownedSkills: s.ownedSkills,
        equippedSkill: s.equippedSkill,
      }),
    }
  )
);

// 구버전 키와 동기화 (기존 App 직접 읽기 호환)
if (typeof window !== "undefined") {
  useMetaStore.subscribe((s) => {
    try {
      localStorage.setItem("apolo_points", String(s.points));
      localStorage.setItem("apolo_skills", JSON.stringify(s.ownedSkills));
      localStorage.setItem("apolo_equip", s.equippedSkill);
    } catch {
      /* ignore */
    }
  });
}
