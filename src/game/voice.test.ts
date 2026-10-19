import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APOLOGY_LINES,
  DOGEZA_LINE,
  isSupported,
  nextApologyLine,
  pickJaVoice,
  primeVoices,
  resetVoiceState,
  speakApology,
  stopVoice,
} from "./voice";
import { hasFailed, listFailures, resetFailures } from "./effects";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * E — 무음 경로 테스트.
 *
 * `voice.ts` 는 예전까지 함수 커버리지 12.5% 였다. 예외를 `catch {}` 로
 * 삼켰기 때문이 아니라, **모듈 최상위 부수효과**가 있어 테스트가 격리되지
 * 않았고 스로틀·음성 선택·예외 경로가 아예 실행되지 않았기 때문이다.
 *
 * 이 파일이 검증하는 것:
 *  1. 스로틀이 실제로 발화를 막는가 (겹쳐서 발화되면 음질이 무너진다)
 *  2. 음성 우선순위가 규칙대로인가 (가나 발음은 Google 日本語가 안정적)
 *  3. 실패가 **조용히 사라지지 않는가** — 삼키되 기록한다
 */

// ── 테스트 doubles ────────────────────────────────────────────────────

interface FakeVoice {
  name: string;
  lang: string;
}

function makeVoice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

/** jsdom 에는 speechSynthesis 가 없으므로 가짜를 심는다 */
function installSpeechSynthesis(voices: FakeVoice[] = []) {
  const state = {
    speaking: false,
    spoken: [] as Array<{ text: string; lang: string; voiceName: string }>,
    cancelCount: 0,
    voicesChangedHandler: null as null | (() => void),
    speakThrows: false,
  };

  const getVoices = vi.fn(() => voices.map((v) => makeVoice(v.name, v.lang)));
  const speak = vi.fn((u: SpeechSynthesisUtterance) => {
    if (state.speakThrows) throw new Error("speak 실패");
    state.spoken.push({
      text: u.text,
      lang: u.lang,
      voiceName: u.voice?.name ?? "",
    });
    state.speaking = true;
  });
  const cancel = vi.fn(() => {
    state.cancelCount++;
    state.speaking = false;
  });

  const synth = {
    get speaking() {
      return state.speaking;
    },
    getVoices,
    speak,
    cancel,
    set onvoiceschanged(h: null | (() => void)) {
      state.voicesChangedHandler = h;
    },
    get onvoiceschanged() {
      return state.voicesChangedHandler;
    },
  };

  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
    writable: true,
  });
  // spy 를 함께 돌려준다 — 테스트가 install 이전 mock 을 잡지 않도록
  return Object.assign(state, { getVoices, speak, cancel });
}

function removeSpeechSynthesis() {
  Reflect.deleteProperty(window, "speechSynthesis" as unknown as PropertyKey);
}

/** SpeechSynthesisUtterance 는 jsdom 에 없으므로 최소 구현을 심는다 */
function installUtterance() {
  class FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Reflect.set(window, "SpeechSynthesisUtterance", FakeUtterance);
  Reflect.set(globalThis, "SpeechSynthesisUtterance", FakeUtterance);
}

const setVoice = (on: boolean) => useSettingsStore.setState({ voice: on });

beforeEach(() => {
  resetVoiceState();
  resetFailures();
  installUtterance();
  installSpeechSynthesis();
  setVoice(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ── 지원 여부 ─────────────────────────────────────────────────────────

describe("TTS 지원 판정", () => {
  it("speechSynthesis 가 있으면 지원한다", () => {
    installSpeechSynthesis();
    expect(isSupported()).toBe(true);
  });

  it("speechSynthesis 가 없으면 미지원이다", () => {
    removeSpeechSynthesis();
    expect(isSupported()).toBe(false);
  });
});

// ── 음성 선택 ─────────────────────────────────────────────────────────

describe("일본어 음성 선택", () => {
  const V = [
    ["Microsoft Haruka", "ja-JP"],
    ["Google 日本語", "ja-JP"],
    ["Samantha", "en-US"],
    ["Kyoko", "ja-JP"],
  ] as const;

  it("Google 日本語를 최우선한다 (가나 발음이 가장 안정적)", () => {
    const picked = pickJaVoice(V.map(([n, l]) => makeVoice(n, l)));
    expect(picked?.name).toBe("Google 日本語");
  });

  it("구글 음성이 없으면 일본어 목록의 첫 것을 쓴다", () => {
    const picked = pickJaVoice([
      makeVoice("Microsoft Haruka", "ja-JP"),
      makeVoice("Kyoko", "ja-JP"),
    ]);
    expect(picked?.name).toBe("Microsoft Haruka");
  });

  it("'Google 日本語' 없으면 영어 이름의 Google 일본어 음성을 쓴다", () => {
    const picked = pickJaVoice([
      makeVoice("Google UK English Female", "en-GB"),
      makeVoice("Google Nihongo", "ja-JP"),
    ]);
    expect(picked?.name).toBe("Google Nihongo");
  });

  it("일본어 음성이 하나도 없으면 null (발화는 브라우저 기본음성으로)", () => {
    expect(pickJaVoice([makeVoice("Samantha", "en-US")])).toBeNull();
  });

  it("빈 목록이면 null", () => {
    expect(pickJaVoice([])).toBeNull();
  });

  it("ja-XX 대소문자를 가리지 않는다", () => {
    const picked = pickJaVoice([
      makeVoice("Yuki", "JA-jp"),
      makeVoice("Other", "en-US"),
    ]);
    expect(picked?.name).toBe("Yuki");
  });
});

// ── 대사 로테이션 ─────────────────────────────────────────────────────

describe("대사 로테이션", () => {
  it("순번대로 순환한다", () => {
    const got = APOLOGY_LINES.map(() => nextApologyLine());
    expect(got).toEqual([...APOLOGY_LINES]);
  });

  it("길이를 넘어도 처음으로 돌아간다", () => {
    const got = Array.from({ length: APOLOGY_LINES.length + 2 }, () => nextApologyLine());
    expect(got[APOLOGY_LINES.length]).toBe(APOLOGY_LINES[0]);
    expect(got[APOLOGY_LINES.length + 1]).toBe(APOLOGY_LINES[1]);
  });

  it("도게자 대사는 로테이션과 별개다", () => {
    expect(DOGEZA_LINE).not.toBe(nextApologyLine());
  });

  it("resetVoiceState 를 부르면 처음부터 다시 시작한다", () => {
    nextApologyLine();
    nextApologyLine();
    resetVoiceState();
    expect(nextApologyLine()).toBe(APOLOGY_LINES[0]);
  });
});

// ── 발화 ─────────────────────────────────────────────────────────────

describe("speakApology", () => {
  it("설정이 켜져 있으면 실제로 발화한다", () => {
    const synth = installSpeechSynthesis();
    speakApology("すみません");
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.spoken[0].text).toBe("すみません");
  });

  it("일본어로 발화하고 속도·음높이를 조정한다 (사죄 느낌)", () => {
    installSpeechSynthesis();
    speakApology("すみません");
    const spy = vi.spyOn(window.speechSynthesis, "speak");
    resetVoiceState();
    speakApology("ごめん", true);
    const u = spy.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(u.lang).toBe("ja-JP");
    expect(u.rate).toBeGreaterThan(1);
    expect(u.pitch).toBeLessThan(1);
    expect(u.volume).toBeGreaterThan(0);
  });

  it("선택된 일본어 음성을 attaches 한다", () => {
    installSpeechSynthesis([{ name: "Google 日本語", lang: "ja-JP" }]);
    speakApology("すみません");
    expect(installSpeechSynthesis).toBeDefined();
    // speak 로 전달된 utterance 에 음성이 붙었는지 확인
    const spy = vi.spyOn(window.speechSynthesis, "speak");
    resetVoiceState();
    speakApology("すみません", true);
    const u = spy.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(u.voice?.name).toBe("Google 日本語");
  });

  it("음성 설정이 OFF면 아무 것도 하지 않는다", () => {
    const synth = installSpeechSynthesis();
    setVoice(false);
    speakApology("すみません");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speechSynthesis 가 없으면 조용히 아무 것도 하지 않는다", () => {
    removeSpeechSynthesis();
    expect(() => speakApology("すみません")).not.toThrow();
  });

  it("이미 말하는 중이면 먼저 끊는다 (겹치면 음질이 무너진다)", () => {
    const synth = installSpeechSynthesis();
    synth.speaking = true;
    speakApology("すみません");
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("말하는 중이 아니면 끊지 않는다 (불필요한 cancel 방지)", () => {
    const synth = installSpeechSynthesis();
    synth.speaking = false;
    speakApology("すみません");
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  // 스로틀 — 실제로 발화가 막히는가
  it("스로틀: MIN_INTERVAL_MS 안에서는 발화하지 않는다 (콤보 연속 방지)", () => {
    const synth = installSpeechSynthesis();
    speakApology("1回目");
    speakApology("2回目");
    speakApology("3回目");
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("스로틀: force=true 는 스로틀을 무시한다 (도게자는 항상 들려야 함)", () => {
    const synth = installSpeechSynthesis();
    speakApology("1回目");
    speakApology("도게자", true);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.spoken[1].text).toBe("도게자");
  });

  it("스로틀: 시간이 충분히 지나면 다시 발화한다", () => {
    const synth = installSpeechSynthesis();
    const spy = vi.spyOn(performance, "now");
    spy.mockReturnValue(1000);
    speakApology("1回目");
    spy.mockReturnValue(1500); // 500ms 경과 — MIN_INTERVAL_MS(800) 미만
    speakApology("2回目");
    spy.mockReturnValue(2000); // 1000ms 경과 — 스로틀 해제
    speakApology("3回目");
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.spoken[1].text).toBe("3回目");
  });

  it("스로틀: force 여도 스로틀 타이머는 갱신된다", () => {
    const synth = installSpeechSynthesis();
    const spy = vi.spyOn(performance, "now");
    spy.mockReturnValue(1000);
    speakApology("일반", true); // force로 발화
    spy.mockReturnValue(1500);
    speakApology("일반2"); // 500ms 경과 — 방금 갱신됐으므로 막혀야 한다
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});

// ── 예외 경로 (무음 경로) ─────────────────────────────────────────────

describe("예외 경로 — 삼키되 기록한다", () => {
  it("speak 가 던져도 게임은 죽지 않는다", () => {
    const synth = installSpeechSynthesis();
    synth.speakThrows = true;
    expect(() => speakApology("すみません")).not.toThrow();
  });

  it("발화 실패가 기록된다 (조용히 사라지지 않는다)", () => {
    const synth = installSpeechSynthesis();
    synth.speakThrows = true;
    speakApology("すみません");
    expect(hasFailed("voice")).toBe(true);
    expect(listFailures("voice")[0].reason).toContain("speak 실패");
  });

  it("실패 원인이 서로 다르면 각각 기록된다", () => {
    const synth = installSpeechSynthesis();
    synth.speakThrows = true;
    speakApology("1");
    synth.speakThrows = false;
    const spy = vi.spyOn(window.speechSynthesis, "getVoices");
    spy.mockImplementation(() => {
      throw new Error("getVoices 실패");
    });
    speakApology("2", true);
    const reasons = listFailures("voice").map((f) => f.reason);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("같은 원인은 한 번만 기록한다 (로그 폭주 방지)", () => {
    const synth = installSpeechSynthesis();
    synth.speakThrows = true;
    for (let i = 0; i < 20; i++) speakApology("x", true);
    expect(listFailures("voice").filter((f) => f.reason.includes("speak 실패")).length).toBe(1);
  });
});

// ── stopVoice ────────────────────────────────────────────────────────

describe("stopVoice", () => {
  it("진행 중인 발화를 멈춘다", () => {
    const synth = installSpeechSynthesis();
    stopVoice();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("speechSynthesis 가 없으면 조용히 아무 것도 하지 않는다", () => {
    removeSpeechSynthesis();
    expect(() => stopVoice()).not.toThrow();
  });

  it("cancel 이 던져도 게임은 죽지 않는다", () => {
    installSpeechSynthesis();
    const spy = vi.spyOn(window.speechSynthesis, "cancel");
    spy.mockImplementation(() => {
      throw new Error("cancel 실패");
    });
    expect(() => stopVoice()).not.toThrow();
    expect(hasFailed("voice")).toBe(true);
  });
});

// ── primeVoices (음성 목록 예열) ─────────────────────────────────────

describe("primeVoices — 음성 목록 예열", () => {
  it("음성 목록을 미리 읽는다 (첫 발화 지연 방지)", () => {
    const synth = installSpeechSynthesis();
    primeVoices();
    expect(synth.getVoices).toHaveBeenCalled();
  });

  it("voiceschanged 콜백을 등록한다 (비동기 로드 대응)", () => {
    const synth = installSpeechSynthesis();
    primeVoices();
    expect(synth.voicesChangedHandler).toBeInstanceOf(Function);
  });

  it("voiceschanged 가 발화되면 다시 읽는다", () => {
    const synth = installSpeechSynthesis();
    primeVoices();
    const before = synth.getVoices.mock.calls.length;
    synth.voicesChangedHandler?.();
    expect(synth.getVoices.mock.calls.length).toBeGreaterThan(before);
  });

  it("speechSynthesis 가 없으면 조용히 아무 것도 하지 않는다", () => {
    removeSpeechSynthesis();
    expect(() => primeVoices()).not.toThrow();
  });

  it("getVoices 가 던져도 게임은 죽지 않는다", () => {
    installSpeechSynthesis();
    const spy = vi.spyOn(window.speechSynthesis, "getVoices");
    spy.mockImplementation(() => {
      throw new Error("getVoices 실패");
    });
    expect(() => primeVoices()).not.toThrow();
    expect(hasFailed("voice")).toBe(true);
  });
});
