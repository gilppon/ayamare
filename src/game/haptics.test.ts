import { beforeEach, describe, expect, it, vi } from "vitest";
import { buzz, hapticFor, isSupported } from "./haptics";
import { hasFailed, listFailures, resetFailures } from "./effects";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * E — 햅틱 무음 경로 테스트.
 *
 * 예전 `haptics.ts` 는 5줄짜리 `try/catch` 였고 catch 가 아무것도 안 했다.
 * 분기 커버리지가 28.6% 였다는 건 미지원 기기 경로가 실행된 적이 없다는 뜻이다.
 *
 * 이 파일이 검증하는 것:
 *  1. 설정/지원 여부에 따라 진동이 정확한 패턴으로 호출되는가
 *  2. 진동이 예외를 던져도 게임이 죽지 않고 **원인이 기록되는가**
 *  3. 미지원은 "실패"가 아니라 "조용한 no-op" 으로 구분되는가
 */

/** navigator.vibrate 를 제어가 가능한 가짜로 교체 */
function installVibrate(impl?: (p: number | number[]) => boolean) {
  const vibrate = vi.fn(impl ?? (() => true));
  Object.defineProperty(navigator, "vibrate", {
    value: vibrate,
    configurable: true,
    writable: true,
  });
  return vibrate;
}

function removeVibrate() {
  Reflect.deleteProperty(navigator, "vibrate" as unknown as PropertyKey);
}

const setHaptics = (on: boolean) => useSettingsStore.setState({ haptics: on });

beforeEach(() => {
  resetFailures();
  installVibrate();
  setHaptics(true);
});

// ── 지원 여부 ─────────────────────────────────────────────────────────

describe("진동 지원 판정", () => {
  it("vibrate 가 있으면 지원한다", () => {
    installVibrate();
    expect(isSupported()).toBe(true);
  });

  it("vibrate 가 없으면 미지원이다", () => {
    removeVibrate();
    expect(isSupported()).toBe(false);
  });

  it("vibrate 가 함수가 아니면 미지원이다 (속성만 있는 기기)", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: 123,
      configurable: true,
      writable: true,
    });
    expect(isSupported()).toBe(false);
  });
});

// ── buzz ─────────────────────────────────────────────────────────────

describe("buzz", () => {
  it("설정이 켜져 있으면 진동한다", () => {
    const vibrate = installVibrate();
    buzz();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("기본 패턴은 짧은 진동이다", () => {
    const vibrate = installVibrate();
    buzz();
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("숫자 패턴을 그대로 전달한다", () => {
    const vibrate = installVibrate();
    buzz(42);
    expect(vibrate).toHaveBeenCalledWith(42);
  });

  it("배열 패턴(진동-정지-진동)을 그대로 전달한다", () => {
    const vibrate = installVibrate();
    buzz([30, 30, 30]);
    expect(vibrate).toHaveBeenCalledWith([30, 30, 30]);
  });

  it("설정이 OFF면 진동하지 않는다", () => {
    const vibrate = installVibrate();
    setHaptics(false);
    buzz(50);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("미지원 기기면 조용히 아무 것도 하지 않는다 (예외 아님)", () => {
    removeVibrate();
    expect(() => buzz(50)).not.toThrow();
  });

  it("미지원 기기에서 실패로 기록하지 않는다 — 미지원은 정상이다", () => {
    // E: 미지원은 "이 기기가 못 한다" 일 뿐 버그가 아니다.
    // 실패로 기록하면 정상 기기에서도 경고가 쌓인다.
    removeVibrate();
    buzz(50);
    expect(hasFailed("haptics")).toBe(false);
  });
});

// ── hapticFor 매핑 ───────────────────────────────────────────────────

describe("hapticFor — 판정별 패턴", () => {
  const cases: Array<[keyof typeof hapticFor, number | number[]]> = [
    ["perfect", 12],
    ["great", 20],
    ["bad", [30, 30, 30]],
    ["miss", [60, 40, 60]],
  ];

  for (const [name, pattern] of cases) {
    it(`${name} 은(는) ${JSON.stringify(pattern)} 을(를) 진동한다`, () => {
      const vibrate = installVibrate();
      hapticFor[name]();
      expect(vibrate).toHaveBeenCalledWith(pattern);
    });
  }

  it("미스가 가장 굵고 길다 — 실수가 크게 느껴져야 한다", () => {
    const weight = (p: number | number[]) =>
      Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    expect(weight([60, 40, 60])).toBeGreaterThan(weight([30, 30, 30]));
    expect(weight([60, 40, 60])).toBeGreaterThan(weight(20));
    expect(weight(20)).toBeGreaterThan(weight(12));
  });

  it("설정이 OFF면 어떤 판정도 진동하지 않는다", () => {
    const vibrate = installVibrate();
    setHaptics(false);
    for (const name of Object.keys(hapticFor) as Array<keyof typeof hapticFor>) {
      hapticFor[name]();
    }
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("미지원 기기에서 판정을 받아도 안전하다", () => {
    removeVibrate();
    for (const name of Object.keys(hapticFor) as Array<keyof typeof hapticFor>) {
      expect(() => hapticFor[name]()).not.toThrow();
    }
  });
});

// ── 예외 경로 (무음 경로) ─────────────────────────────────────────────

describe("예외 경로 — 삼키되 기록한다", () => {
  it("vibrate 가 던져도 게임은 죽지 않는다", () => {
    installVibrate(() => {
      throw new Error("vibrate 실패");
    });
    expect(() => buzz(15)).not.toThrow();
  });

  it("진동 실패가 기록된다 (설정 화면에서 '왜 안 울려요' 를 추적 가능)", () => {
    installVibrate(() => {
      throw new Error("사용자 제스처 필요");
    });
    buzz(15);
    expect(hasFailed("haptics")).toBe(true);
    expect(listFailures("haptics")[0].reason).toBe("사용자 제스처 필요");
  });

  it("패턴을 받아 예외를 던지는 기기도 안전하다", () => {
    installVibrate((p) => {
      if (Array.isArray(p)) throw new Error("배열 패턴 미지원");
      return true;
    });
    expect(() => buzz([30, 30, 30])).not.toThrow();
    expect(listFailures("haptics")[0].reason).toBe("배열 패턴 미지원");
  });

  it("같은 원인은 한 번만 기록한다 (연속 MISS 로 로그가 폭주하지 않는다)", () => {
    installVibrate(() => {
      throw new Error("vibrate 실패");
    });
    for (let i = 0; i < 50; i++) hapticFor.miss();
    expect(listFailures("haptics").filter((f) => f.reason.includes("vibrate 실패")).length).toBe(1);
  });

  it("진동이 false 를 반환해도 실패로 보지 않는다 (기기 정책일 뿐)", () => {
    installVibrate(() => false);
    buzz(15);
    expect(hasFailed("haptics")).toBe(false);
  });
});
