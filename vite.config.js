import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // ffmpeg.wasm usa un worker propio: Vite no debe pre-empaquetarlo
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
