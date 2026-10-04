/**
 * 격한 사죄 음성 MP3 뱅크 (public/voice/*.mp3).
 * TTS 지연(0.1~0.3s) 없이 박자에 붙는 절규용.
 * 파일이 없으면 null을 반환하고 호출 측이 TTS로 폴백한다.
 */

export const VOICE_FILES = [
  "apology1.wav",
  "apology2.wav",
  "apology3.wav",
  "apology4.wav",
  "apology5.wav",
  "apology_dogeza.wav",
] as const;

function voiceUrl(file: string): string {
  const root = import.meta.env.BASE_URL || "/";
  const sep = root.endsWith("/") ? "" : "/";
  return `${root}${sep}${file}`;
}

let bankPromise: Promise<Map<string, AudioBuffer>> | null = null;
const syncCache = new Map<string, AudioBuffer>();

/** 앱 시작 시 한 번 호출해 미리 디코드. 실패해도 throw하지 않음. */
export function loadVoiceBank(): Promise<Map<string, AudioBuffer>> {
  if (!bankPromise) {
    bankPromise = (async () => {
      const bank = new Map<string, AudioBuffer>();
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctor();
        try {
          await Promise.all(
            VOICE_FILES.map(async (file) => {
              try {
                const res = await fetch(voiceUrl(file));
                if (!res.ok) return;
                const buf = await res.arrayBuffer();
                const audio = await ctx.decodeAudioData(buf);
                bank.set(file, audio);
                // 단일 캐시: 비동기 뱅크와 동기 조회가 같은 Map을 공유
                if (!syncCache.has(file)) syncCache.set(file, audio);
              } catch {
                /* 개별 실패 무시 */
              }
            })
          );
        } finally {
          ctx.close().catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
      return bank;
    })();
  }
  return bankPromise;
}

/** 동기 조회. 미로드/실패 시 null (TTS 폴백용). */
export function getVoiceBuffer(file: string): AudioBuffer | null {
  return syncCache.get(file) ?? null;
}

export async function ensureVoiceBank(): Promise<void> {
  try {
    const bank = await loadVoiceBank();
    bank.forEach((buf, file) => {
      if (!syncCache.has(file)) syncCache.set(file, buf);
    });
  } catch {
    /* ignore */
  }
}

export function voiceBankSize(): number {
  return syncCache.size;
}
