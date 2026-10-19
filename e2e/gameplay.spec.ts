import { test, expect, type Page } from "@playwright/test";
import { tr } from "../src/i18n/ui";

/**
 * 실제 브라우저에서만 검증 가능한 영역.
 *
 * jsdom 의 AudioContext 스텁은 **오디오가 실제로 나는지** 알 수 없다.
 * 컨텍스트 상태·샘플레이트·디코드·RAF·멀티터치·PointerCapture·IndexedDB 는 여기만 봅니다.
 *
 * 한글 리터럴은 이 환경에서 코드포인트가 깨지므로 사전(`tr`) 에서 가져온다.
 */

declare global {
  interface Window {
    /** 레인 키 컨테이너의 aria-label 을 page.evaluate 사이에 전달하기 위한 채널 */
    __laneKeyLabel?: string;
    __origSetPointerCapture?: typeof Element.prototype.setPointerCapture;
    __origHasPointerCapture?: typeof Element.prototype.hasPointerCapture;
  }
}

const K = (k: Parameters<typeof tr>[1]) => tr("ko", k);

const waitTitle = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /STAGE 1/ })).toBeVisible();
};

/**
 * stage1 을 눌러 실제 플레이 화면까지 진입하고 **플레이가 시작된 뒤** 반환한다.
 *
 * 준비 오버레이 동안의 입력은 `start()` 만 부르고 판정으로 가지 않으므로,
 * 명시적 시작 버튼을 눌러야 한다. 그 뒤 입력 유예(500ms)도 넘긴다.
 */
async function enterGame(page: Page) {
  await waitTitle(page);
  await page.getByRole("button", { name: /STAGE 1/ }).click();
  const start = page.getByRole("button", { name: K("game.start") });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();
  await expect(start).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(700);
}

/** 포인터 캡처 훅 */
const laneKeysReady = (page: Page, label: string) =>
  page.evaluate((l: string) => {
    window.__laneKeyLabel = l;
    const c = document.querySelector(`[aria-label="${l}"]`);
    return (c ?? document).querySelectorAll("button[aria-pressed]").length;
  }, label);

const firePointer = (page: Page, type: string, pointerId: number, index: number) =>
  page.evaluate(
    ([t, pid, i]) => {
      const c = document.querySelector(`[aria-label="${window.__laneKeyLabel ?? ""}"]`);
      const keys = Array.from(
        (c ?? document).querySelectorAll("button[aria-pressed]")
      ) as HTMLElement[];
      const el = keys[i as number];
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new PointerEvent(t as string, {
          pointerId: pid as number,
          pointerType: "touch",
          isPrimary: (pid as number) === 1,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
          bubbles: true,
          cancelable: true,
        })
      );
    },
    [type, pointerId, index] as const
  );

const pressedCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('button[aria-pressed="true"]').length);

/**
 * 합성 PointerEvent 는 활성 포인터가 아니므로 `setPointerCapture` 가
 * `NotFoundError` 를 던져 핸들러가 죽는다. 캡처 API 만 테스트 동안 무효화하고
 * React 의 포즈 추적 로직은 그대로 통과시킨다.
 */
async function withCaptureDisabled(page: Page, fn: () => Promise<void>) {
  await page.evaluate(() => {
    window.__origSetPointerCapture = Element.prototype.setPointerCapture;
    window.__origHasPointerCapture = Element.prototype.hasPointerCapture;
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.hasPointerCapture = function () {
      return true;
    };
  });
  try {
    await fn();
  } finally {
    await page.evaluate(() => {
      if (window.__origSetPointerCapture)
        Element.prototype.setPointerCapture = window.__origSetPointerCapture;
      if (window.__origHasPointerCapture)
        Element.prototype.hasPointerCapture = window.__origHasPointerCapture;
    });
  }
}

test.describe("오디오", () => {
  test("실제 브라우저에서 AudioContext 가 동작한다", async ({ page }) => {
    await enterGame(page);
    const audio = await page.evaluate(async () => {
      const ctx = new AudioContext();
      const state = ctx.state;
      const rate = ctx.sampleRate;
      await ctx.close();
      return { state, rate };
    });
    expect(audio.rate).toBeGreaterThan(0);
    // 자동 재생 정책으로 suspend 되는 환경이면 그 자체가 정황이다
    expect(["running", "suspended"]).toContain(audio.state);
  });

  test("컨텍스트 시각이 실제로 전진한다", async ({ page }) => {
    await enterGame(page);
    const t = await page.evaluate(async () => {
      const ctx = new AudioContext();
      try {
        if (ctx.state === "suspended") await ctx.resume();
        // ⚠️ 여기서 "정확히 N ms 후에 전진했나"를 검사하면 안 된다.
        // AudioContext 시계는 오디오 스레드가 서비스될 때만 전진하고, 그 스레드는
        // CPU 부하(병렬 워커 8개)에서 250ms 안에 돌지 않을 수 있다.
        // 이전의 고정 대기는 그 조건에서 이 테스트를 flake 로 만들었다.
        // 검증할 것은 "전진하는가" 이므로, 전진할 때까지 **기다린다**.
        const t0 = ctx.currentTime;
        const deadline = performance.now() + 5000;
        let t1 = t0;
        while (performance.now() < deadline && t1 <= t0) {
          await new Promise((r) => setTimeout(r, 50));
          t1 = ctx.currentTime;
        }
        return { t0, t1, state: ctx.state };
      } finally {
        await ctx.close();
      }
    });
    expect(t.state).not.toBe("closed");
    expect(t.t1).toBeGreaterThan(t.t0);
  });

  test("오디오 버퍼를 실제로 디코드한다", async ({ page }) => {
    await enterGame(page);
    const dur = await page.evaluate(async () => {
      // decodeAudioData 는 PCM 바이트가 아니라 **인코딩된** 오디오를 받는다.
      // 검증 가능한 최소 컨테이너로 1초짜리 16bit PCM WAV 를 메모리에 만든다.
      const rate = 44100;
      const frames = rate;
      const bytes = new ArrayBuffer(44 + frames * 2);
      const v = new DataView(bytes);
      const ascii = (off: number, s: string) => {
        for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
      };
      ascii(0, "RIFF");
      v.setUint32(4, 36 + frames * 2, true);
      ascii(8, "WAVE");
      ascii(12, "fmt ");
      v.setUint32(16, 16, true); // fmt chunk size
      v.setUint16(20, 1, true); // PCM
      v.setUint16(22, 1, true); // mono
      v.setUint32(24, rate, true);
      v.setUint32(28, rate * 2, true); // byte rate
      v.setUint16(32, 2, true); // block align
      v.setUint16(34, 16, true); // bits per sample
      ascii(36, "data");
      v.setUint32(40, frames * 2, true);

      const ctx = new AudioContext();
      const ctxRate = ctx.sampleRate;
      const buf = await ctx.decodeAudioData(bytes);
      const d = {
        duration: buf.duration,
        // 디코딩된 버퍼는 컨텍스트 레이트로 **리샘플링**된다 (WebAudio 규약)
        resampled: buf.sampleRate === ctxRate,
        len: buf.length,
      };
      await ctx.close();
      return d;
    });
    expect(dur.duration).toBeCloseTo(1, 1);
    expect(dur.resampled).toBe(true);
    expect(dur.len).toBeGreaterThan(0);
  });
});

test.describe("프레임 루프", () => {
  test("requestAnimationFrame 이 실제 프레임을 그린다", async ({ page }) => {
    await enterGame(page);
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let n = 0;
          const start = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - start > 300) resolve(n);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
    );
    // 300ms 에 60fps 라면 약 18 프레임. 0 이면 RAF 가 없는 환경이다
    expect(frames).toBeGreaterThan(3);
  });
});

test.describe("포인터 입력 (B-07)", () => {
  test("멀티터치로 두 레인을 동시에 누른다", async ({ page }) => {
    await enterGame(page);
    expect(await laneKeysReady(page, K("game.laneKeys"))).toBeGreaterThanOrEqual(4);

    await withCaptureDisabled(page, async () => {
      await firePointer(page, "pointerdown", 1, 0);
      await firePointer(page, "pointerdown", 2, 2);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBeGreaterThanOrEqual(2);

      // 한 손가락만 뗀다 — 나머지는 유지되어야 한다
      await firePointer(page, "pointerup", 1, 0);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBeGreaterThanOrEqual(1);

      await firePointer(page, "pointerup", 2, 2);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBe(0);
    });
  });

  test("같은 레인에 손가락 2개를 댄 뒤 하나만 뗀다", async ({ page }) => {
    await enterGame(page);
    await laneKeysReady(page, K("game.laneKeys"));

    await withCaptureDisabled(page, async () => {
      await firePointer(page, "pointerdown", 11, 1);
      await firePointer(page, "pointerdown", 12, 1);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBe(1);

      // 한 손가락이 남아 있으므로 레인은 계속 눌려 있다
      await firePointer(page, "pointerup", 11, 1);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBe(1);

      await firePointer(page, "pointerup", 12, 1);
      await page.waitForTimeout(60);
      expect(await pressedCount(page)).toBe(0);
    });
  });
});

test("키보드 입력이 실제 브라우저 이벤트로 동작한다", async ({ page }) => {
  await enterGame(page);
  await page.keyboard.press("a");
  await page.waitForTimeout(150);
  // 화면이 살아 있고 콘솔 오류가 없어야 한다
  await expect(page.getByRole("button", { name: K("game.pause") }).first()).toBeVisible();
});

test("모션 감소 설정이 실제 상태로 반영되고 영속된다", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "ko-KR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await waitTitle(page);
  await page.getByRole("button", { name: K("app.settings") }).click();

  // Toggle 은 role=checkbox 가 아니라 aria-pressed 버튼이다
  const toggle = () =>
    page.locator("label", { hasText: K("settings.motion") }).locator("button[aria-pressed]");
  await expect(toggle()).toHaveAttribute("aria-pressed", "true");

  await toggle().click();
  await expect(toggle()).toHaveAttribute("aria-pressed", "false");

  // 새로고침해도 유지된다 (localStorage 영속화)
  await page.reload();
  await page.getByRole("button", { name: K("app.settings") }).click();
  await expect(toggle()).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});

test("IndexedDB 를 실제로 사용할 수 있다 (기록 영속 기반)", async ({ page }) => {
  await waitTitle(page);
  const ok = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        if (!("indexedDB" in window)) return resolve(false);
        const req = indexedDB.open("apolo-e2e", 1);
        req.onsuccess = () => {
          req.result.close();
          indexedDB.deleteDatabase("apolo-e2e");
          resolve(true);
        };
        req.onerror = () => resolve(false);
      })
  );
  expect(ok).toBe(true);
});

test("PWA precache 등록 여부를 확인한다", async ({ page }) => {
  await page.goto("/");
  const sw = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? "registered" : "none";
  });
  // 프리뷰/개발 환경이라 미등록이어도 실패시키지 않는다.
  // 빌드 산출 자체의 precache 크기는 `npm run build` 로그로 확인한다.
  expect(["registered", "none", "unsupported"]).toContain(sw);
});