import { defineConfig, devices } from "@playwright/test";

/**
 * E2E — 실제 브라우저에서만 검증 가능한 것들.
 *
 * jsdom 이 대체하지 못하는 영역이 정확히 여기다:
 *  - WebAudio 실제 동작(컨텍스트 상태, 버퍼 디코드, 루프)
 *  - Pointer Events 멀티터ouch
 *  - service worker / PWA precache
 *  - IndexedDB 영속화
 *  - `prefers-reduced-motion` 실제 반영
 *
 * `vite preview`(빌드 결과)로 돌린다 — 개발 서버와 달리 SW·리소스 경로가
 * 프로덕션과 같으므로 PWA 검증에 의미가 있다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    // 게임은 오디오 컨텍스트를 쓰므로 자동 재생 정책 해제가 필요하다
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // 앱이 `navigator.language` 로 언어를 감지한다. 로케일을 고정하지 않으면
        // 머신/CI 언어에 따라 부팅 언어가 바뀌어 테스트가 흔들린다.
        locale: "ko-KR",
      },
    },
  ],
  webServer: {
    // Windows 에서 `localhost` 는 ::1 로만 해석되어 127.0.0.1 연결이 거부된다.
    // IPv4 로 명시적으로 바인딩한다.
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});