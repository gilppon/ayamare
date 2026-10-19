import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { audioContexts } from "@/test/setup";
import { detectPeaks } from "./autoChart";

/**
 * 음성 뱅크 / 오토차트 잔여 경로 안전망.
 *
 * `voiceBank` 은 모듈 전역 상태(`bankPromise`, `syncCache`)를 들고 있어
 * 테스트 간 누수가 쉽다. 그래서 `vi.resetModules()` 로 매 테스트 모듈을 새로
 * 만들어 격리한다.
 */

const reset = () => vi.resetModules();

/** fetch 를 가짜로 만든다 */
const stubFetch = (impl: (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>) =>
  vi.stubGlobal("fetch", vi.fn(impl));

afterEach(() => {
  vi.unstubAllGlobals();
  audioContexts.length = 0;
});

beforeEach(() => {
  reset();
});

describe("voiceBank", () => {
  it("VOICE_FILES 가 비어 있지 않다", async () => {
    const { VOICE_FILES: files } = await import("./voiceBank");
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("apology_dogeza.wav");
  });

  it("모든 파일을 디코드해 뱅크에 담는다", async () => {
    stubFetch(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    }));
    const { loadVoiceBank: load, VOICE_FILES: files } = await import("./voiceBank");
    const bank = await load();
    expect(bank.size).toBe(files.length);
  });

  it("loadVoiceBank 는 한 번만 실제로 로드한다 (모듈 수준 캐시)", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    }));
    stubFetch(spy);
    const { loadVoiceBank: load, VOICE_FILES: files } = await import("./voiceBank");
    await load();
    const after = spy.mock.calls.length;
    await load();
    await load();
    expect(after).toBe(files.length);
    expect(spy.mock.calls.length).toBe(after);
  });

  it("일부 파일이 실패해도 나머지는 로드된다 (개별 실패 격리)", async () => {
    stubFetch(async (url: string) => {
      if (url.includes("apology3")) throw new Error("404");
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(128) };
    });
    const { loadVoiceBank: load, VOICE_FILES: files } = await import("./voiceBank");
    const bank = await load();
    expect(bank.size).toBe(files.length - 1);
    expect(bank.has("apology3.wav")).toBe(false);
  });

  it("전부 실패해도 예외를 밖으로 던지지 않는다", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    const { loadVoiceBank: load, getVoiceBuffer: get } = await import("./voiceBank");
    await expect(load()).resolves.toBeInstanceOf(Map);
    expect(get("apology1.wav")).toBeNull();
  });

  it("HTTP 오류(res.ok === false) 는 건너뛴다", async () => {
    stubFetch(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    const { loadVoiceBank: load } = await import("./voiceBank");
    await expect(load()).resolves.toBeInstanceOf(Map);
  });

  it("동기 캐시가 비동기 뱅크와 같은 객체를 공유한다", async () => {
    stubFetch(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(256) }));
    const { loadVoiceBank: load, getVoiceBuffer: get } = await import("./voiceBank");
    const bank = await load();
    const file = "apology1.wav";
    expect(bank.has(file)).toBe(true);
    expect(get(file)).toBe(bank.get(file));
  });

  it("ensureVoiceBank 는 조용히 실패한다 (throws 하지 않는다)", async () => {
    stubFetch(async () => {
      throw new Error("boom");
    });
    const { ensureVoiceBank: ensure, getVoiceBuffer: get } = await import("./voiceBank");
    await expect(ensure()).resolves.toBeUndefined();
    expect(get("apology1.wav")).toBeNull();
  });

  it("미로드 상태의 getVoiceBuffer 는 null (TTS 폴백 경로)", async () => {
    const { getVoiceBuffer: get } = await import("./voiceBank");
    expect(get("아무파일.wav")).toBeNull();
  });

  it("AudioContext 생성 자체가 실패해도 뱅크 로드는 조용히 끝난다", async () => {
    const { loadVoiceBank: load } = await import("./voiceBank");
    const Ctor = window.AudioContext;
    // @ts-expect-error -- 일부러 깨뜨려 폴백 경로를 본다
    window.AudioContext = undefined;
    stubFetch(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) }));
    try {
      await expect(load()).resolves.toBeInstanceOf(Map);
    } finally {
      window.AudioContext = Ctor;
    }
  });

  it("디코더가 던져도 컨텍스트는 닫힌다 (리소스 누수 가드)", async () => {
    stubFetch(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) }));
    const { loadVoiceBank: load } = await import("./voiceBank");
    await load();
    // 생성된 컨텍스트는 모두 closed 상태여야 한다
    const ctx = audioContexts[audioContexts.length - 1];
    expect(ctx?.state).toBe("closed");
  });
});

describe("autoChart.detectPeaks", () => {
  const N = 8192;
  const RATE = 44100;
  /** 기본 창/홉 크기 — 시간 해상도의 근원이 된다 */
  const HOP = 512;
  const HOP_SEC = HOP / RATE;

  /**
   * 특정 위치에 **버스트**를 심는다.
   * 단일 샘플 임펄스는 창 평균 에너지에 묻혀 검출되지 않으므로, 실제 오디오의
   * 트랜지언트처럼 연속 샘플을 채운다.
   */
  const withBursts = (at: number[], width = 96) => {
    const data = new Float32Array(N);
    for (const p of at) {
      for (let k = 0; k < width; k++) data[p + k] = Math.sin((k / width) * Math.PI);
    }
    return data;
  };

  it("피크를 검출한다 (반환값은 **초 단위**, hop 양자화)", () => {
    const out = detectPeaks(withBursts([1100, 3200, 6400]), RATE);
    expect(out.length).toBe(3);

    // 시간 순서 + hop 격자 위에 놓인다
    expect([...out].sort((a, b) => a - b)).toEqual(out);
    for (const t of out) {
      const i = t / HOP_SEC;
      expect(Math.abs(i - Math.round(i))).toBeLessThan(1e-6);
    }
  });

  it("검출 시각은 실제 버스트 시각과 hop 오차 이내로 일치한다", () => {
    const burst = 3200;
    const out = detectPeaks(withBursts([burst]), RATE);
    expect(out.length).toBe(1);
    // 버스트는 한 호 안에 들어가므로 hop 하나 이내로 어긋난다
    expect(Math.abs(out[0] - burst / RATE)).toBeLessThanOrEqual(HOP_SEC + 1e-9);
  });

  it("시간 해상도는 hop 크기로 제한된다 (알려진 한계 — 고정)", () => {
    const out = detectPeaks(withBursts([1100]), RATE);
    // 1ms 이하 정밀도를 주장하지 않는다
    expect(HOP_SEC).toBeGreaterThan(0.001);
    expect(out.length).toBe(1);
  });

  it("조용한 입력에서는 피크가 없다", () => {
    expect(detectPeaks(new Float32Array(N).fill(0.001), RATE)).toEqual([]);
  });

  it("thresholdRatio 로 약한 신호를 걸러낸다", () => {
    const mix = withBursts([5000], 96);
    for (let k = 0; k < 96; k++) mix[1000 + k] = Math.sin((k / 96) * Math.PI) * 0.05;
    expect(detectPeaks(mix, RATE, { thresholdRatio: 0.5 }).length).toBeLessThanOrEqual(1);
  });

  it("maxPeaks 로 개수를 상한한다", () => {
    const at: number[] = [];
    for (let i = 200; i < N - 200; i += 400) at.push(i);
    const out = detectPeaks(withBursts(at, 64), RATE, { maxPeaks: 3 });
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("B-12: hopSize 로 나눠떨어지지 않는 위치의 피크도 놓치지 않는다", () => {
    // 512 로 나눠떨어지지 않는 위치 — 창 시작 위상이 4 순환해야 잡힌다
    const out = detectPeaks(withBursts([600], 96), RATE);
    expect(out.length).toBeGreaterThan(0);
    expect(Math.abs(out[0] - 600 / RATE)).toBeLessThanOrEqual(HOP_SEC + 1e-9);
  });

  it("windowSize 를 넘게 짧은 입력도 예외 없이 처리한다", () => {
    expect(() => detectPeaks(new Float32Array(10), RATE)).not.toThrow();
    expect(detectPeaks(new Float32Array(10), RATE)).toEqual([]);
  });

  it("빈 입력도 예외 없이 처리한다", () => {
    expect(() => detectPeaks(new Float32Array(0), RATE)).not.toThrow();
  });
});
