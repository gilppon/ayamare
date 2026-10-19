import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, rebindKey } from "./settingsStore";

/**
 * C-06 회귀 — 키 리바인딩이 **고아 레인** 을 만들던 버그.
 *
 * 기존 구현은 "이 레인의 기존 키" 만 지웠다.
 * 어떤 키가 이미 다른 레인에 묶여 있으면 그 레인의 키를 빼앗기만 하고
 * 다시 배정하지 않아, 그 레인은 키를 잃어 게임 내내 눌려지지 않았다.
 *
 *   기본값 { a:0, s:1, d:2, " ":3 }
 *   1) z → lane 0  (a 제거)
 *   2) z → lane 1  (s 제거, z 는 lane 1 로 이동)
 *   → 이전 구현: lane 0 에 키가 없음  ← 게임에서 dead lane
 */
describe("C-06: 키 리바인딩이 레인을 고아로 만들지 않는다", () => {
  it("같은 레인에 재지정하면 기존 키만 정리된다", () => {
    const next = rebindKey({ ...DEFAULT_KEYS }, "z", 0);
    expect(next.z).toBe(0);
    expect(next.a).toBeUndefined();
  });

  it("다른 레인의 키를 빼앗으면 그 레인은 기본 키로 되돌아온다", () => {
    const step1 = rebindKey({ ...DEFAULT_KEYS }, "z", 0);
    const step2 = rebindKey(step1, "z", 1);

    expect(step2.z).toBe(1);
    // 빼앗긴 lane 0 이 키를 잃지 않는다
    expect(step2.a).toBe(0);
    // 빼앗기 전 지워졌던 기본 키도 복구된다
    expect(Object.values(step2).sort()).toEqual([0, 1, 2, 3]);
  });

  it("어떤 순서로 지정해도 모든 레인이 키를 하나씩 갖는다", () => {
    const plan: Array<[string, number]> = [
      ["z", 0],
      ["z", 1],
      ["z", 2],
      ["z", 3],
      ["q", 3],
    ];
    let map: Record<string, number> = { ...DEFAULT_KEYS };
    for (const [k, lane] of plan) map = rebindKey(map, k, lane);

    const lanes = Object.values(map).sort();
    expect(lanes).toEqual([0, 1, 2, 3]);
  });

  it("입력 객체를 변형하지 않는다 (불변성)", () => {
    const original = { ...DEFAULT_KEYS };
    const next = rebindKey(original, "z", 1);
    expect(original).toEqual(DEFAULT_KEYS);
    expect(next).not.toBe(original);
  });

  it("대소문자는 정규화된다", () => {
    expect(rebindKey({ ...DEFAULT_KEYS }, "Z", 0).z).toBe(0);
  });
});