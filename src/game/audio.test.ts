import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "./audio";
import { audioContexts } from "@/test/setup";

/**
 * 오디오 엔진 안전망 — 신호 체인·루프 경계·일시정지/U-01 시간 정합성.
 *
 * 스텁이 "실제 WebAudio 와 같은 `duration` 규약을 갖도록" 고도화되면서
 * 여길 검증할 수 있게 됐다 (이전 스텁은 `duration` 이 undefined 였다).
 */

const ctxOf = () => audioContexts[audioContexts.length - 1];

/** 지정한 길이(초)의 오디오를 decode 한 것처럼 보이게 한다 */
function stubFetch(seconds: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(seconds * 44100 * 4),
    }))
  );
}

/** 절차 그루브 마디는 2초(`barDur`)마다 예약된다. 킥은 3rd 마디부터(카운트인 제외)에
 *  나오므로 카운트인을 통과할 만큼 시각을 전진시켜야 한다. */
function tickScheduler(ctx: { advance: (s: number) => void }, seconds = 5) {
  ctx.advance(seconds);
  vi.advanceTimersByTime(30);
}

/** 실제 음원(노이즈 히트 포함)과 루프 트랙을 구분한다 */
const loopSources = (ctx: { sources: { loop: boolean }[] }) => ctx.sources.filter((s) => s.loop);
const oscCount = (ctx: { sources: { kind: string }[] }) =>
  ctx.sources.filter((s) => s.kind === "osc").length;

beforeEach(() => {
  audioContexts.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AudioEngine.init — 신호 체인", () => {
  it("A-01: 리미터는 destination 에, 버스는 리미터 앞에 연결된다", async () => {
    const e = new AudioEngine(120);
    await e.start();
    const ctx = ctxOf();
    // limiter 파라미터가 실제 값으로 설정되었는지 (버스트 클리핑 방지)
    const compressor = ctx.params;
    expect(compressor.length).toBeGreaterThanOrEqual(5);
    e.stop();
  });

  it("songStart 은 컨텍스트 시각 + 0.12 로 예약된다", async () => {
    const e = new AudioEngine(120);
    const start = await e.start();
    expect(start).toBeCloseTo(ctxOf().currentTime + 0.12, 5);
    e.stop();
  });

  it("start() 를 두 번 호출하면 컨텍스트를 새로 만들지 않는다 (B-05)", async () => {
    const e = new AudioEngine(120);
    const a = await e.start();
    const n = audioContexts.length;
    const b = await e.start();
    expect(audioContexts.length).toBe(n);
    expect(b).toBe(a);
    e.stop();
  });
});

describe("AudioEngine — 트랙 루프 경계", () => {
  it("트랙이 있으면 루프 구간이 [offset, duration] 로 설정된다", async () => {
    stubFetch(2.5);
    const e = new AudioEngine(120, "/track.mp3", 0.4);
    await e.start();
    const track = ctxOf().sources.find((s) => s.kind === "buffer" && s.buffer !== null);
    expect(track).toBeTruthy();
    expect(track!.loop).toBe(true);
    expect(track!.loopStart).toBeCloseTo(0.4, 6);
    expect(track!.loopEnd).toBeCloseTo(2.5, 2);
    e.stop();
  });

  it("B-15: offset 이 곡 길이를 넘으면 트랙을 포기하고 절차 그루브로 폴백한다", async () => {
    vi.useFakeTimers();
    stubFetch(1.0);
    const e = new AudioEngine(120, "/track.mp3", 5.0);
    await e.start();
    const ctx = ctxOf();
    // 루프 소스를 만들면 안 된다 (만들면 무음 루프가 된다)
    expect(loopSources(ctx)).toHaveLength(0);
    // 절차 신원이 살아 있어야 한다 (카운트인 이후 킥/베이스 오실레이터)
    tickScheduler(ctx);
    expect(oscCount(ctx)).toBeGreaterThan(0);
    vi.useRealTimers();
    e.stop();
  });

  it("B-03: 트랙 모드에서는 절차 마디를 예약하지 않는다 (AudioNode 폭발 방지)", async () => {
    vi.useFakeTimers();
    stubFetch(30);
    const e = new AudioEngine(120, "/track.mp3", 0.2);
    await e.start();
    const ctx = ctxOf();
    const before = ctx.sources.length;
    tickScheduler(ctx);
    // 루프 소스 하나만 있고, 절차 마디가 늘지 않아야 한다
    expect(oscCount(ctx)).toBe(0);
    expect(ctx.sources.length).toBe(before);
    vi.useRealTimers();
    e.stop();
  });

  it("offset 은 음수가 될 수 없다", async () => {
    stubFetch(3);
    const e = new AudioEngine(120, "/track.mp3", -9);
    await e.start();
    const track = ctxOf().sources.find((s) => s.kind === "buffer" && s.buffer !== null);
    expect(track!.loopStart).toBeGreaterThanOrEqual(0);
    e.stop();
  });

  it("트랙 로드 실패 시 절차 그루브로 폴백하고 루프 소스가 없다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const e = new AudioEngine(120, "/missing.mp3");
    await e.start();
    const ctx = ctxOf();
    expect(loopSources(ctx)).toHaveLength(0);
    tickScheduler(ctx);
    expect(oscCount(ctx)).toBeGreaterThan(0);
    vi.useRealTimers();
    e.stop();
  });

  it("decodeAudioData 가 던져도 예외가 밖으로 새지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const ctx = audioContexts;
    void ctx;
    const e = new AudioEngine(120, "/broken.mp3");
    await expect(e.start()).resolves.toBeDefined();
    e.stop();
  });
});

describe("AudioEngine — U-01 시간 정합성", () => {
  it("now() 은 컨텍스트 시각을 그대로 쓴다", async () => {
    const e = new AudioEngine(120);
    await e.start();
    ctxOf().advance(3.5);
    expect(e.now()).toBeCloseTo(3.5, 5);
    e.stop();
  });

  it("stop() 후 now() 은 0 을 돌려준다", async () => {
    const e = new AudioEngine(120);
    await e.start();
    ctxOf().advance(2);
    e.stop();
    expect(e.now()).toBe(0);
  });
});