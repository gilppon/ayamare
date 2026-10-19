import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// P-02: 오디오 총량 ≈ 9.3MB + bg.jpg 0.7MB. 전부 precache 하면 모바일 첫 설치가
// 사실상 다운로드 게임이 된다. MP3/WAV 는 런타임 CacheFirst 로 넘기고,
// 앱 껍데기(JS/CSS/HTML/아이콘/배경)만 설치 시점에 캐시한다.
const AUDIO_FILES = [
  "stage1.mp3",
  "stage2.mp3",
  "stage3.mp3",
  "stage4.mp3",
  "stage5.mp3",
  "daily.mp3",
  "apology1.wav",
  "apology2.wav",
  "apology3.wav",
  "apology4.wav",
  "apology5.wav",
  "apology_dogeza.wav",
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // I-01: bg.jpg(1376x768)를 1024x1024 아이콘으로 선언하던 것을 정사각 SVG 로 교체
      includeAssets: ["bg.jpg", "pwa-icon.svg", "icon-512.svg"],
      manifest: {
        name: "SUMIMASEN! 사죄의회",
        short_name: "SUMIMASEN!",
        description: "기자들의 질문에 맞춰 정확한 각도로 사과하는 코미디 리듬게임.",
        theme_color: "#070a12",
        background_color: "#070a12",
        display: "fullscreen",
        orientation: "landscape",
        lang: "ko",
        icons: [
          {
            src: "icon-512.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // 오디오는 precache 에서 제외 (설치 용량 축소)
        globPatterns: ["**/*.{js,css,html,svg,jpg,woff2}"],
        navigateFallbackDenylist: [/^\/[^/?]+\.(mp3|wav|json)$/i],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // P-02: 스테이지 트랙/사죄 음성만 캐시한다. 목록에 없는 오디오는
            // (에디터에서 불러온 사용자 파일 등) 캐시하지 않는다.
            urlPattern: ({ url }: { url: URL }) => {
              const file = url.pathname.split("/").pop() ?? "";
              return AUDIO_FILES.includes(file);
            },
            handler: "CacheFirst",
            options: {
              cacheName: "audio-tracks",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
    viteSingleFile(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
