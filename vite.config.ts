import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["bg.jpg", "pwa-icon.svg", "stage1.mp3", "stage2.mp3", "stage3.mp3", "stage4.mp3", "stage5.mp3", "daily.mp3", "apology*.wav"],
      manifest: {
        name: "SUMIMASEN! 사죄회견",
        short_name: "SUMIMASEN!",
        description: "기자들의 질문에 맞춰 정확한 각도로 사과하는 코미디 리듬게임.",
        theme_color: "#070a12",
        background_color: "#070a12",
        display: "fullscreen",
        orientation: "landscape",
        lang: "ko",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "bg.jpg",
            sizes: "1024x1024",
            type: "image/jpeg",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,jpg,mp3,wav,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
