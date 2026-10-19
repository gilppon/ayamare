import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attempt,
  hasFailed,
  listFailures,
  reasonOf,
  recordFailure,
  resetFailures,
  type EffectKind,
} from "./effects";

/**
 * E — 실패 기록 장치 자체의 계약.
 *
 * `effects.ts` 는 "삼킨다"와 "기록한다"의 경계다.
 * 이 경계가 틀면 나머지 테스트 전체가 무의미해지므로 여기서 고정한다.
 */

beforeEach(() => {
  resetFailures();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("reasonOf — 에러를 읽을 수 있는 한 줄로", () => {
  it("Error 는 message 를 쓴다", () => {
    expect(reasonOf(new Error("boom"))).toBe("boom");
  });

  it("message 가 비면 이름을 쓴다", () => {
    expect(reasonOf(new TypeError(""))).toBe("TypeError");
  });

  it("문자열은 그대로", () => {
    expect(reasonOf("문자열 오류")).toBe("문자열 오류");
  });

  it("null / undefined 도 안전하다 (throw null 가능)", () => {
    expect(reasonOf(null)).toBe("object");
    expect(reasonOf(undefined)).toBe("undefined");
  });

  it("익명 객체도 안전하다", () => {
    expect(reasonOf({ a: 1 })).toBe("[object Object]");
  });

  it("toString 이 깨져도 죽지 않는다", () => {
    const evil = {
      toString() {
        throw new Error("toString 실패");
      },
    };
    expect(() => reasonOf(evil)).not.toThrow();
  });
});

describe("attempt — 삼키되 기록한다", () => {
  it("성공하면 값을 그대로 돌려준다", () => {
    expect(attempt("voice", () => 42)).toBe(42);
  });

  it("성공하면 아무것도 기록하지 않는다", () => {
    attempt("voice", () => 1);
    expect(listFailures()).toEqual([]);
  });

  it("예외를 던지지 않고 undefined 를 돌려준다", () => {
    expect(
      attempt("voice", () => {
        throw new Error("실패");
      })
    ).toBeUndefined();
  });

  it("실패를 기록한다", () => {
    attempt("haptics", () => {
      throw new Error("진동 실패");
    });
    expect(hasFailed("haptics")).toBe(true);
  });

  it("개발자에게 경고한다 (조용히 사라지지 않는다)", () => {
    attempt("voice", () => {
      throw new Error("발화 실패");
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("발화 실패"));
  });

  it("경고에 어느 부수효과인지 표시한다", () => {
    attempt("haptics", () => {
      throw new Error("x");
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[haptics]"));
  });
});

describe("실패 기록의 성질", () => {
  it("같은 원인은 한 번만 기록한다 (로그 폭주 방지)", () => {
    for (let i = 0; i < 100; i++) {
      attempt("voice", () => {
        throw new Error("동일 원인");
      });
    }
    expect(listFailures("voice")).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("서로 다른 원인은 각각 기록한다", () => {
    recordFailure("voice", new Error("A"));
    recordFailure("voice", new Error("B"));
    expect(listFailures("voice").map((f) => f.reason)).toEqual(["A", "B"]);
  });

  it("부수효과가 다르면 같은 원인도 따로 기록한다", () => {
    recordFailure("voice", new Error("같은"));
    recordFailure("haptics", new Error("같은"));
    expect(listFailures()).toHaveLength(2);
    expect(hasFailed("voice")).toBe(true);
    expect(hasFailed("haptics")).toBe(true);
  });

  it("부분 조회로 부수효과를 나눈다", () => {
    recordFailure("voice", new Error("v"));
    recordFailure("haptics", new Error("h"));
    expect(listFailures("haptics").map((f) => f.kind)).toEqual(["haptics"]);
  });

  it("한 번도 안 실패했으면 hasFailed 가 false", () => {
    expect(hasFailed("voice")).toBe(false);
    expect(listFailures()).toEqual([]);
  });

  it("첫 발생 시각을 보존한다", () => {
    recordFailure("voice", new Error("시각"));
    const first = listFailures("voice")[0].at;
    recordFailure("voice", new Error("시각")); // 중복 — 갱신되면 안 된다
    expect(listFailures("voice")[0].at).toBe(first);
  });

  it("다른 원인을 추가해도 기존 시각이 바뀌지 않는다", () => {
    recordFailure("voice", new Error("A"));
    const at = listFailures("voice")[0].at;
    recordFailure("voice", new Error("B"));
    const a = listFailures("voice").find((f) => f.reason === "A")!;
    expect(a.at).toBe(at);
  });

  it("resetFailures 는 테스트 사이에 상태를 넘기지 않는다", () => {
    recordFailure("voice", new Error("x"));
    resetFailures();
    expect(hasFailed("voice")).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("모든 종류를 다룰 수 있다 (새 부수효과 추가 시 컴파일로 보장)", () => {
    const kinds: EffectKind[] = ["voice", "haptics"];
    for (const k of kinds) recordFailure(k, new Error(k));
    expect(listFailures()).toHaveLength(kinds.length);
  });
});
