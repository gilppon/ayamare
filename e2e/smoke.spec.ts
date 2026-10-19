import { test, expect, type Page } from "@playwright/test";
import { tr } from "../src/i18n/ui";

/**
 * 부팅 · 타이틀 · 설정 — 실제 브라우저 스모크.
 *
 * **한글 리터럴을 쓰지 않는다.** 이 환경(그리고 CI 로그 경로)에서 소스 코드포인트가
 * 깨지는 일이 반복돼, 사전에서 직접 가져온다. 사전을 못 읽는 계층에서 검증하는 셈이라
 * 사전 키 배선까지 함께 확인된다.
 */

const K = (k: Parameters<typeof tr>[1]) => tr("ko", k);

const waitTitle = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /STAGE 1/ })).toBeVisible();
};

test("부팅하면 타이틀 화면이 나타난다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /STAGE 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /STAGE 5/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /DAILY/ })).toBeVisible();
});

test("페이지 타이틀과 html lang 이 한국어로 설정된다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(K("app.title"));
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});

test("런타임 오류 없이 로드된다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /STAGE 1/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("탭 전환이 실제로 화면을 바꾼다", async ({ page }) => {
  await waitTitle(page);
  await page.getByRole("button", { name: K("title.tabRecords") }).click();
  await expect(page.getByText(K("rec.totalRuns")).first()).toBeVisible();
});

test("설정 패널을 열고 언어를 바꾼다", async ({ page }) => {
  await waitTitle(page);
  await page.getByRole("button", { name: K("app.settings") }).click();
  await expect(page.getByRole("button", { name: /English/ })).toBeVisible();
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(tr("en", "app.title"));
});

test("에디터로 들어가고 제목 입력을 받는다", async ({ page }) => {
  await waitTitle(page);
  await page.getByRole("button", { name: /UGC/ }).click();
  await expect(page.getByPlaceholder(K("ed.titlePh"))).toBeVisible();
});

test("PWA manifest 가 서빙된다", async ({ page, request }) => {
  await page.goto("/");
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
});

/** 앱이 `navigator.language` 로 부팅 언어를 정하는지 — jsdom 은 이걸 재현 못 한다 */
test.describe("부팅 언어 자동 감지", () => {
  test("영어 브라우저면 영어로 부팅한다", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(tr("en", "app.title"));
    await ctx.close();
  });

  test("일본어 브라우저면 일본어로 부팅한다", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page).toHaveTitle(tr("ja", "app.title"));
    await ctx.close();
  });

  test("선택한 언어는 localStorage 에 남는다", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: K("app.settings") }).click();
    await page.getByRole("button", { name: /English/ }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await ctx.close();
  });
});