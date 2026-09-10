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
  },
  preview: {
    host: "127.0.0.1",
  },
});
