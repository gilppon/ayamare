import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 성능 프로브 전용 설정.
 *
 * `mergeConfig` 를 쓰면 배열형 키(`include`/`exclude`)가 **합쳐져** 기본 실행과
 * 똑같이 전체 파일이 돈다. 그래서 여기서는 독립 설정으로 작성한다.
 *
 * 프로브는 **절대 시간**을 측정하므로 공유 CI 러너에서는 flakiness 가 크다.
 * 기본 `npm test` 에서 제외하고(`*.bench.tsx`) 여기서만 돌린다.
 *
 *   npm run test:perf
 *   PERF_OUT=perf.json npm run test:perf   # 결과를 파일로
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.bench.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // 4개 규모 × (워밍업 1 + 5회 반복) 을 돌려 시간이 걸린다
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});