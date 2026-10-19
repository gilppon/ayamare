import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // 게임 코드가 window/matchMedia/localStorage/RAF 를 쓰므로 DOM 환경이 필요하다.
    // 순수 로직 테스트도 같은 환경에서 돌리면 AudioContext 등 부재 리스크가 없지만,
    // 훅 통합 테스트를 위해 jsdom 으로 통일한다.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // 성능 프로브는 절대 시간을 재므로 기본 실행에서 제외한다.
    // `npm run test:perf` (vitest.perf.config.ts) 에서만 돈다.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.bench.tsx"],
    // 커버리지 게이트 — 미검증 핵심 로직이 늘지 않게 최소선을 고정한다.
    // (chart.ts / constants.ts 는 데이터 정의가 많아 비율이 낮게 나오므로
    //  include 로 핵심 파일만 좁혀 실질적인 회귀만 막는다)
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: process.env.CI ? ["text-summary", "lcov"] : ["text-summary"],
      include: [
        "src/game/**/*.ts",
        "src/stores/**/*.ts",
        "src/components/game/**/*.ts",
        "src/components/game/**/*.tsx",
      ],
      exclude: ["**/*.test.*", "**/*.bench.*", "src/test/**"],
      thresholds: {
        lines: 70,
        functions: 80,
        branches: 70,
        statements: 70,
      },
    },
  },
});