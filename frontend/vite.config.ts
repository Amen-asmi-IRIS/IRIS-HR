/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // The source is a Windows folder mounted into a Linux container: file events do not cross, so poll.
    // What the journeys and the build write is not source: a report saved in the middle of a run must not reload the page.
    watch: { usePolling: true, interval: 1000, ignored: ["**/playwright-report/**", "**/test-results/**", "**/dist/**"] },
    proxy: {
      "/api": { target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    // Nothing is inlined as a data: URI, so the content-security policy can stay strict.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
