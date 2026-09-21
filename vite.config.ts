import { defineConfig } from "vite";

// The SPA lives in web/. Built output goes to repo-root dist/ so the
// Dockerfile can copy a single directory into nginx.
export default defineConfig({
  root: "web",
  publicDir: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    host: "127.0.0.1",
    // The ListenBrainz proxy. In the dev compose the api container is
    // reached by service name; standalone dev falls back to localhost.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8081",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    // Mirror the production nginx security headers so the preview surface
    // (what the e2e suite serves) matches what ships. nginx.conf is the
    // production source of truth; test/nginx-headers.test.ts guards it.
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  },
});
