/**
 * 사소하지만 실패하면 조용히 죽는 부수효과(햅틱·TTS)의 실패 기록.
 *
 * E: `voice.ts` / `haptics.ts` 는 예외를 `catch {}` 로 삼켰다.
 * 게임이 깨지지 않는다는 것은 맞지만, 그 대가로 세 가지를 잃는다:
 *
 *  1. **진단 불가** — 진동을 못 하는 기기/음성 미지원 브���저��서 왜 안 되는지
 *     아무도 모른다. 설정 화면에는 "켜짐"으로만 보인다.
 *  2. **검증 불가** — catch 블록이 테스트되지 않았으므로, 이 경로가
 *     실제로 동작하는지 확인할 방법이 없다(voice.ts 함수 커버리지 12.5%).
 *  3. **삼킨 뒤 조용히 성공** — 스로틀/설정 OFF 로 건너뛴 것과
 *     진짜로 실패한 것이 구분되지 않는다. 두 경우 모두 그냥 넘어간다.
 *
 * 해결: 예외를 삼키되 **기록한다.** `console.warn` + 접근 가능한 카운터.
 * 게임 흐름은 막지 않고, 원인은 남긴다.
 */

/** 부수효과 종류 */
export type EffectKind = "haptics" | "voice";

export interface EffectFailure {
  kind: EffectKind;
  /** 사람이 읽을 원인 (에러 메시지 또는 typeof) */
  reason: string;
  /** 최초 발생 시각 (ms). 같은 원인이 반복되면 갱신하지 않는다. */
  at: number;
}

/**
 * 원인별 첫 발생 기록.
 *
 * "실패한 횟수"가 아니라 "실패한 **종류**"를 센다. 진동이 100번 안 되면
 * 사용자에게 필요한 정보는 "이 기기는 진동을 지원하지 않는다" 한 줄이지
 * 100이 아니다. 매 프레임 로그를 찍는 것도 노이즈다.
 */
const failures = new Map<string, EffectFailure>();

/** 에러를 사람이 읽을 한 줄로 줄인다 (에러가 아닌 값도 안전하게) */
export function reasonOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  if (err === null || err === undefined) return typeof err;
  try {
    return Object.prototype.toString.call(err);
  } catch {
    return "알 수 없는 값";
  }
}

/**
 * 부수효과 실패를 기록한다. **전부 삼킨다.**
 *
 * 설계 판단: 여기서 다시 던지지 않는다.
 * 진동 실패로 게임 루프를中断시키는 것은 진동 실패보다 나쁘다.
 * 대신 원인을 남겨 diagnosing 과 테스트가 가능하게 한다.
 */
export function recordFailure(kind: EffectKind, err: unknown): void {
  const reason = reasonOf(err);
  const key = `${kind}:${reason}`;
  if (failures.has(key)) return; // 같은 원인은 최초 1회만
  const entry: EffectFailure = { kind, reason, at: Date.now() };
  failures.set(key, entry);
  console.warn(`[${kind}] 실패: ${reason}`);
}

/**
 * 부수효과 실패를 **삼키고** 값을 돌려준다 (실패하면 undefined).
 *
 * 예외를 삼키는 곳이 여기로 **한 군데**로 모인다. 그래야
 * "여기서 조용히 무시되는 것"이 무엇인지 한눈에 보인다.
 */
export function attempt<T>(kind: EffectKind, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    recordFailure(kind, err);
    return undefined;
  }
}

/** 지금까지 기록된 실패 (원인별 중복 제거) — 진단/테스트용 */
export function listFailures(kind?: EffectKind): EffectFailure[] {
  const all = [...failures.values()];
  return kind ? all.filter((f) => f.kind === kind) : all;
}

/** 해당 부수효과가 한 번이라도 실패했는가 */
export function hasFailed(kind: EffectKind): boolean {
  return listFailures(kind).length > 0;
}

/** 기록 초기화 — 테스트가 케이스 사이에 상태를 넘기지 않도록 */
export function resetFailures(): void {
  failures.clear();
}
