/**
 * 테스트 전역 환경 설정.
 * jsdom 은 AudioContext / matchMedia / requestAnimationFrame 을 제공하지 않는다.
 * 게임 코드가 이 API 들에 의존하므로 최소한의 스텁을 마련한다.
 */

import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { useProgressStore } from "@/stores/progressStore";
import { useMetaStore } from "@/stores/metaStore";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * `progressStore` 는 IndexedDB(persist) 를 쓰기 때문에 마운트 후 **비동기로
 * 재하이드레이션**하며, 그 결과가 테스트의 `setState` 를 덮어쓴다
 * (예: 스트릭 배지가 테스트 중 사라짐). 테스트에서는 영속화를 끈다.
 */
useProgressStore.persist.setOptions({
  storage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
});

// jsdom 에 없는 브라우저 API 스텁 -------------------------------------------

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!("vibrate" in navigator)) {
  Object.defineProperty(navigator, "vibrate", {
    value: () => true,
    configurable: true,
  });
}

/** 스텁 오디오 버퍼 — 실제 WebAudio 와 같은 `duration` 수의를 갖는다. */
export class StubAudioBuffer {
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  private readonly data: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = Math.max(1, channels);
    this.length = Math.max(0, length);
    this.sampleRate = sampleRate;
    this.duration = this.length / sampleRate;
    this.data = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch] ?? new Float32Array(0);
  }
}

/** 재생 설정 기록 — 루프 구간·시작 오프셋을 단언하기 위한 것 */
export interface StubSourceRecord {
  kind: "buffer" | "osc";
  buffer: StubAudioBuffer | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  startedAt: number | null;
  offset: number | null;
  stoppedAt: number | null;
  params: Record<string, number>;
}

class AudioParamStub {
  value: number;
  readonly events: { method: string; value: number; time: number }[] = [];
  constructor(v = 0, private readonly label = "") {
    this.value = v;
  }
  private log(method: string, value: number, time = 0) {
    this.events.push({ method, value, time });
  }
  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.log("setValueAtTime", value, time);
    return this;
  }
  setTargetAtTime(value: number, startTime: number) {
    this.value = value;
    this.log("setTargetAtTime", value, startTime);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.value = value;
    this.log("linearRamp", value, time);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.value = value;
    this.log("exponentialRamp", value, time);
    return this;
  }
  cancelScheduledValues(time: number) {
    this.log("cancelScheduledValues", 0, time);
    return this;
  }
  setValueCurveAtTime() {
    return this;
  }
  getLabel() {
    return this.label;
  }
}

class StubNode {
  connect() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

export class AudioContextStub {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = new StubNode();
  /** 이 컨텍스트가 만든 모든 BufferSource/Oscillator 기록 */
  readonly sources: StubSourceRecord[] = [];
  /** 생성된 AudioParam 들 (필터·컴프레서 등) — 덕킹/리미터 검증용 */
  readonly params: AudioParamStub[] = [];

  /** 테스트에서 곡 시각을 직접 전진시키기 위한 훅 */
  advance(seconds: number) {
    this.currentTime += seconds;
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
  createGain(value = 1) {
    return { gain: new AudioParamStub(value), connect: () => {}, disconnect: () => {} };
  }
  createBiquadFilter() {
    const node = {
      type: "",
      frequency: this.param(0),
      Q: this.param(0),
      detune: this.param(0),
      connect: () => {},
      disconnect: () => {},
    };
    return node;
  }
  createDynamicsCompressor() {
    return {
      threshold: this.param(0),
      knee: this.param(0),
      ratio: this.param(1),
      attack: this.param(0),
      release: this.param(0),
      connect: () => {},
      disconnect: () => {},
    };
  }
  private param(v: number) {
    const p = new AudioParamStub(v);
    this.params.push(p);
    return p;
  }
  createOscillator() {
    const rec: StubSourceRecord = {
      kind: "osc",
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      startedAt: null,
      offset: null,
      stoppedAt: null,
      params: {},
    };
    this.sources.push(rec);
    const frequency = this.param(0);
    return {
      type: "",
      frequency,
      connect: () => {},
      start: (when?: number) => {
        rec.startedAt = when ?? this.currentTime;
      },
      stop: (when?: number) => {
        rec.stoppedAt = when ?? this.currentTime;
      },
    };
  }
  createBufferSource() {
    const rec: StubSourceRecord = {
      kind: "buffer",
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      startedAt: null,
      offset: null,
      stoppedAt: null,
      params: {},
    };
    this.sources.push(rec);
    return {
      get buffer() {
        return rec.buffer;
      },
      set buffer(b: StubAudioBuffer | null) {
        rec.buffer = b;
      },
      get loop() {
        return rec.loop;
      },
      set loop(v: boolean) {
        rec.loop = v;
      },
      get loopStart() {
        return rec.loopStart;
      },
      set loopStart(v: number) {
        rec.loopStart = v;
      },
      get loopEnd() {
        return rec.loopEnd;
      },
      set loopEnd(v: number) {
        rec.loopEnd = v;
      },
      connect: () => {},
      start: (when?: number, offset?: number) => {
        rec.startedAt = when ?? this.currentTime;
        rec.offset = offset ?? 0;
      },
      stop: (when?: number) => {
        rec.stoppedAt = when ?? this.currentTime;
      },
    };
  }
  createBuffer(channels: number, length: number, sampleRate?: number): StubAudioBuffer {
    return new StubAudioBuffer(channels, length, sampleRate ?? this.sampleRate);
  }
  /** 실제 바이트 크기로 버퍼를 만든다 — 테스트가 "트랙 길이"를 지정할 수 있게. */
  async decodeAudioData(data: ArrayBuffer): Promise<StubAudioBuffer> {
    const bytes = data?.byteLength ?? 0;
    return new StubAudioBuffer(1, Math.floor(bytes / 4), this.sampleRate);
  }
}

if (!("AudioContext" in window)) {
  Object.defineProperty(window, "AudioContext", {
    value: AudioContextStub,
    configurable: true,
    writable: true,
  });
}

/**
 * 생성된 AudioContext 인스턴스 목록 — 테스트에서 곡 시각 전진에 사용.
 *
 * ⚠️ **테스트 간 초기화 필수.** 컨텍스트가 남으면 `advanceAudio` 가 옛 컨텍스트까지
 * 함께 전진해, 테스트가 `audioContexts.at(-1)` 로 잡은 컨텍스트의 곡 시각과
 * 실제 타이머가 어긋난다. 증상은 "판정이 경계에서 1타만 의도치 않게 나온다" 같은
 * 말하기 어려운 형태로 나타난다 (B 세션에서 실제로 겪음).
 */
export const audioContexts: AudioContextStub[] = [];

/** 현재 테스트에서 사용할 컨텍스트 (마지막에 생성된 것) */
export function currentAudioContext(): AudioContextStub {
  const ctx = audioContexts[audioContexts.length - 1];
  if (!ctx) throw new Error("AudioContext 가 아직 생성되지 않았다 — 게임 시작 전인가?");
  return ctx;
}

beforeEach(() => {
  audioContexts.length = 0;
});

afterEach(() => {
  audioContexts.length = 0;
});
type AudioCtor = new () => AudioContextStub;
const OriginalCtor = (window as unknown as { AudioContext: AudioCtor }).AudioContext;
class TrackedAudioContext extends OriginalCtor {
  constructor() {
    super();
    audioContexts.push(this);
  }
}
Object.defineProperty(window, "AudioContext", {
  value: TrackedAudioContext,
  configurable: true,
  writable: true,
});

/** 모든 AudioContext 의 곡 시각을 전진시킨다 (게임 루프 진행용) */
export function advanceAudio(seconds: number) {
  for (const ctx of audioContexts) ctx.advance(seconds);
}

if (!("speechSynthesis" in window)) {
  Object.defineProperty(window, "speechSynthesis", {
    // jsdom 에는 구현이 없어 값을 읽는 접근자가 정의되지 않는다
    value: { speak: () => {}, cancel: () => {}, getVoices: () => [], speaking: false },
    configurable: true,
    writable: true,
  });
}

// 테스트 간 상태 누수 방지 ---------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  audioContexts.length = 0;
  // 영속화 스토어는 매 테스트 초기 상태로 되돌린다
  useSettingsStore.setState({ lang: "ko" });
  useMetaStore.setState({
    points: 0,
    capital: 0,
    ownedSkills: ["none"],
    equippedSkill: "none",
  });
  useProgressStore.setState({
    totalRuns: 0,
    bestCombo: 0,
    totalDogeza: 0,
    totalPerfect: 0,
    bestAccuracy: 0,
    dailyRuns: 0,
    singlePerfectBest: 0,
    lastPlayDate: null,
    streak: 0,
    claimed: {},
    lastNewlyCompleted: [],
    runHistory: [],
    bestByStage: {},
  } as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
