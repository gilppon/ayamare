import { describe, expect, it } from "vitest";
import { laneFromKeyboardEvent } from "./constants";

const DEFAULT_MAP = { a: 0, s: 1, d: 2, " ": 3 };

describe("laneFromKeyboardEvent", () => {
  it("영문 키 매핑", () => {
    expect(laneFromKeyboardEvent({ key: "a", code: "KeyA" }, DEFAULT_MAP)).toBe(0);
    expect(laneFromKeyboardEvent({ key: " ", code: "Space" }, DEFAULT_MAP)).toBe(3);
  });

  it("한글 IME 상태에서도 e.code로 판정 (ㅁ→A)", () => {
    expect(laneFromKeyboardEvent({ key: "ㅁ", code: "KeyA" }, DEFAULT_MAP)).toBe(0);
    expect(laneFromKeyboardEvent({ key: "ㄴ", code: "KeyS" }, DEFAULT_MAP)).toBe(1);
    expect(laneFromKeyboardEvent({ key: "ㅇ", code: "KeyD" }, DEFAULT_MAP)).toBe(2);
  });

  it("커스텀 키맵 우선", () => {
    const custom = { j: 0, k: 1, l: 2, ";": 3 };
    expect(laneFromKeyboardEvent({ key: "j", code: "KeyJ" }, custom)).toBe(0);
    // 커스텀에 없어도 기본/코드로 폴백
    expect(laneFromKeyboardEvent({ key: "a", code: "KeyA" }, custom)).toBe(0);
  });

  it("모르는 키는 undefined", () => {
    expect(laneFromKeyboardEvent({ key: "q", code: "KeyQ" }, DEFAULT_MAP)).toBe(undefined);
  });
});
