// Lightweight procedural music engine built on the Web Audio API.
// Drives a 4-on-the-floor groove that intensifies as the chart progresses.
// 하이브리드 모드: 스테이지 MP3 트랙이 있으면 베이스 루프로 깔고,
// 절차 그루브는 뮤트 + 타격 SFX/인텐시티/덕킹 레이어만 얹는다.

import { getVoiceBuffer } from "./voiceBank";
import { useSettingsStore } from "@/stores/settingsStore";

const ROOTS = [73.42, 58.27, 43.65, 65.41]; // D2, Bb1, F1, C2
const CHORDS = [
  [146.83, 174.61, 220.0], // Dm
  [116.54, 146.83, 174.61], // Bb
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
];

/** 스테이지 → public/ 트랙 파일명. 커스텀 채보는 null(절차 그루브). */
const STAGE_TRACKS: Record<string, string> = {
  stage1: "stage1.mp3",
  stage2: "stage2.mp3",
  stage3: "stage3.mp3",
  stage4: "stage4.mp3",
  stage5: "stage5.mp3",
  daily: "daily.mp3",
};

/**
 * 트랙별 시작 오프셋(초). 곡 파일 내 첫 박 위치 실측값.
 * 차트 t=0 ↔ 파일 offset 지점이 만나 박자가 일치한다.
 */
const TRACK_OFFSETS: Record<string, number> = {
  stage1: 0.075,
  stage2: 0.06,
  stage3: 0.26,
  stage4: 0.23,
  stage5: 0.26,
  daily: 0.065,
};

function baseOfStage(stageId: string): string {
  if (stageId.startsWith("daily")) return "daily";
  if (stageId.startsWith("custom")) return "";
  return stageId;
}

export function trackForStage(stageId: string): string | null {
  const file = STAGE_TRACKS[baseOfStage(stageId)];
  if (!file) return null;
  const root = import.meta.env.BASE_URL || "/";
  const sep = root.endsWith("/") ? "" : "/";
  return `${root}${sep}${file}`;
}

/** 스테이지 트랙 시작 오프셋(초). 파일 없으면 0. */
export function offsetForStage(stageId: string): number {
  return TRACK_OFFSETS[baseOfStage(stageId)] ?? 0;
}

const MAX_BARS = 64;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private arpBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private trackSource: AudioBufferSourceNode | null = null;
  private trackBuffer: AudioBuffer | null = null;
  private hasTrack = false;
  private duckFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private bpm: number;
  private trackUrl: string | null;
  private trackOffset: number;
  private schedulerId: number | null = null;
  private nextBarIndex = 0;
  private nextBarTime = 0;
  private stopped = false;
  private intensity = 0;
  songStart = 0;

  constructor(bpm: number, trackUrl: string | null = null, trackOffset = 0) {
    this.bpm = bpm;
    this.trackUrl = trackUrl;
    this.trackOffset = Math.max(0, trackOffset);
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  async start(): Promise<number> {
    if (this.ctx) return this.songStart;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    // MISS 덕킹용 로우패스 (평상시 20kHz = bypass)
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = "lowpass";
    this.duckFilter.frequency.value = 20000;
    this.duckFilter.connect(this.master);
    this.master.connect(ctx.destination);

    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0.8;
    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = 0.8;
    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 0.0;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.drumBus.connect(this.duckFilter);
    this.bassBus.connect(this.duckFilter);
    this.arpBus.connect(this.duckFilter);
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.65;
    this.musicBus.connect(this.duckFilter);
    this.noise = this.makeNoise(ctx);

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // 트랙 로드 (실패하면 절차 그루브로 폴백)
    await this.loadTrack();

    this.songStart = ctx.currentTime + 0.12;
    this.nextBarIndex = 0;
    this.nextBarTime = this.songStart;
    this.stopped = false;
    this.intensity = 0;

    if (this.hasTrack) {
      // 트랙 모드: 절차 그루브 뮤트, 베이스 루프만 재생.
      // 파일 내 첫 박 위치(offset)부터 시작해 차트 박자와 일치시킨다.
      this.drumBus.gain.value = 0;
      this.bassBus.gain.value = 0;
      this.arpBus.gain.value = 0;
      const offset = this.trackOffset;
      const src = ctx.createBufferSource();
      src.buffer = this.trackBuffer;
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = this.trackBuffer!.duration;
      src.connect(this.musicBus);
      src.start(this.songStart, offset);
      this.trackSource = src;
    }

    this.schedulerId = window.setInterval(() => this.schedule(), 25);
    return this.songStart;
  }

  /** 트랙 MP3 로드+디코드. 성공 시 true. */
  private async loadTrack(): Promise<boolean> {
    this.hasTrack = false;
    this.trackBuffer = null;
    if (!this.trackUrl || !this.ctx) return false;
    try {
      const res = await fetch(this.trackUrl);
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      this.trackBuffer = await this.ctx.decodeAudioData(buf);
      this.hasTrack = true;
      return true;
    } catch {
      this.hasTrack = false;
      this.trackBuffer = null;
      return false;
    }
  }

  private voiceCounter = 0;
  private lastVoiceAt = 0;

  /**
   * 격한 사죄 음성 MP3 재생. 성공 시 true.
   * false면(파일 없음/스로틀/설정 OFF) 호출 측이 TTS로 폴백한다.
   */
  playApology(dogeza: boolean): boolean {
    try {
      if (!this.ctx || !this.sfxBus || this.stopped) return false;
      if (!useSettingsStore.getState().voice) return true; // OFF면 조용히 성공 처리
      const now = performance.now();
      if (now - this.lastVoiceAt < 800) return true; // 스로틀 — 스킵도 성공으로 취급(TTS 중복 방지)
      const file = dogeza
        ? "apology_dogeza.wav"
        : (["apology1.wav", "apology2.wav", "apology3.wav", "apology4.wav", "apology5.wav"] as const)[
            this.voiceCounter++ % 5
          ];
      const buf = getVoiceBuffer(file);
      if (!buf) return false;
      this.lastVoiceAt = now;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 1.25;
      src.connect(g);
      g.connect(this.sfxBus);
      // 파일 앞 무음(~60ms) 스킵 — 박자에 붙이기 위해
      const trim = Math.min(0.06, Math.max(0, buf.duration - 0.1));
      src.start(this.ctx.currentTime, trim);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.trackSource) {
      try {
        this.trackSource.stop();
      } catch {
        /* ignore */
      }
      this.trackSource = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
      this.drumBus = null;
      this.bassBus = null;
      this.arpBus = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.duckFilter = null;
    }
  }

  /** 콤보 기반 인텐시티 0~3. BGM 레이어를 점진적으로 추가. */
  setIntensity(level: number): void {
    if (!this.ctx) return;
    const l = Math.max(0, Math.min(3, Math.floor(level)));
    if (l === this.intensity) return;
    this.intensity = l;
    const t = this.ctx.currentTime;
    if (this.hasTrack) {
      // 트랙 모드: 베이스 루프 게인만 살짝 올리고 절차 레이어는 유지(뮤트)
      this.musicBus?.gain.setTargetAtTime([0.6, 0.65, 0.72, 0.78][l], t, 0.4);
      return;
    }
    const drum = [0.7, 0.85, 1.0, 1.1][l];
    const bass = [0.7, 0.85, 1.0, 1.1][l];
    const arp = [0.0, 0.5, 0.8, 1.0][l];
    this.drumBus?.gain.setTargetAtTime(drum, t, 0.4);
    this.bassBus?.gain.setTargetAtTime(bass, t, 0.4);
    this.arpBus?.gain.setTargetAtTime(arp, t, 0.4);
  }

  /** MISS/BAD 시 음악을 잠깐 눌러주는 덕킹. */
  duck(amount = 0.35): void {
    if (!this.ctx || !this.duckFilter) return;
    const t = this.ctx.currentTime;
    const f = this.duckFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(20000, t);
    f.exponentialRampToValueAtTime(500, t + 0.02);
    f.exponentialRampToValueAtTime(20000, t + amount);
  }

  /** 타격 SFX. 콤보가 오를수록 PERFECT 음높이 상승. */
  playHit(judgment: "PERFECT" | "GREAT" | "GOOD" | "BAD" | "MISS", combo = 0): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    if (judgment === "PERFECT") {
      // 펜타토닉 상승: 콤보 24까지 2옥타브
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      const step = scale[Math.min(combo, scale.length - 1)] ?? 24;
      const freq = 660 * Math.pow(2, step / 12);
      this.sfxPluck(t, freq, 0.28, 0.22);
      this.sfxPluck(t, freq * 2, 0.1, 0.15);
    } else if (judgment === "GREAT") {
      this.sfxPluck(t, 520, 0.2, 0.18);
    } else if (judgment === "GOOD") {
      this.sfxPluck(t, 420, 0.12, 0.14);
    } else if (judgment === "BAD") {
      this.sfxThud(t, 140);
      this.duck(0.25);
    } else {
      this.sfxThud(t, 90);
      this.sfxNoiseBurst(t, 0.25);
      this.duck(0.4);
    }
  }

  private schedule(): void {
    if (!this.ctx || this.stopped) return;
    if (this.hasTrack) return; // 트랙 모드: 절차 그루브 스케줄 생략 (SFX는 즉시 재생)
    const ahead = this.ctx.currentTime + 0.12;
    const barDur = (60 / this.bpm) * 4;
    while (this.nextBarTime < ahead && this.nextBarIndex < MAX_BARS) {
      this.scheduleBar(this.nextBarIndex, this.nextBarTime);
      this.nextBarTime += barDur;
      this.nextBarIndex++;
    }
    if (this.nextBarIndex >= MAX_BARS) {
      this.crash(this.nextBarTime - barDur + 3.5);
    }
  }

  private scheduleBar(bar: number, t: number): void {
    const step = (60 / this.bpm) / 2;
    const chordIdx = bar % 4;
    const root = ROOTS[chordIdx];
    const tones = CHORDS[chordIdx];

    const countIn = bar < 2;
    const snareOn = bar >= 6;
    const arpOn = bar >= 10;
    const hot = bar >= 18;

    for (let s = 0; s < 8; s++) {
      const tt = t + s * step;
      const onBeat = s % 2 === 0;

      if (countIn) {
        if (onBeat) this.hat(tt, false);
        continue;
      }

      this.hat(tt, s % 2 === 1);
      if (onBeat) this.kick(tt);
      if (snareOn && (s === 2 || s === 6)) this.snare(tt);

      if (onBeat) {
        const freq = s === 6 ? root * 2 : root;
        this.bass(tt, freq, step * 0.9, hot ? 0.5 : 0.42);
      }

      if (arpOn) {
        this.pluck(tt, tones[s % 3], hot ? 0.16 : 0.12);
      }
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private kick(t: number): void {
    if (!this.ctx || !this.drumBus) return;
    const o = this.ctx.createOscillator();
    const e = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    e.gain.setValueAtTime(0.9, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(e);
    e.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private snare(t: number): void {
    if (!this.ctx || !this.drumBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.45, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(bp);
    bp.connect(e);
    e.connect(this.drumBus);
    src.start(t);
    src.stop(t + 0.2);

    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 190;
    const oe = this.ctx.createGain();
    oe.gain.setValueAtTime(0.3, t);
    oe.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(oe);
    oe.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hat(t: number, open: boolean): void {
    if (!this.ctx || !this.drumBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const e = this.ctx.createGain();
    const dur = open ? 0.22 : 0.05;
    e.gain.setValueAtTime(open ? 0.2 : 0.16, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp);
    hp.connect(e);
    e.connect(this.drumBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private bass(t: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.bassBus) return;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(800, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp);
    lp.connect(e);
    e.connect(this.bassBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private pluck(t: number, freq: number, vol: number): void {
    if (!this.ctx || !this.arpBus) return;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(e);
    e.connect(this.arpBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private sfxPluck(t: number, freq: number, vol: number, dur: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    e.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sfxThud(t: number, freq: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.5), t + 0.12);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.5, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(e);
    e.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private sfxNoiseBurst(t: number, dur: number): void {
    if (!this.ctx || !this.sfxBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.35, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp);
    lp.connect(e);
    e.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private crash(t: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4000;
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.5, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(hp);
    hp.connect(e);
    e.connect(this.master);
    src.start(t);
    src.stop(t + 0.85);
  }
}
