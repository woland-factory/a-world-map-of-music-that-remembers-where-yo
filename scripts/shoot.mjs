// Capture a labeled screenshot of the running map for LAYOUT_NOTES.
// Run inside the Playwright container against the served app, e.g.
//   SHOOT_URL=http://127.0.0.1:8080 node scripts/shoot.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const url = process.env.SHOOT_URL || "http://127.0.0.1:8080";
mkdirSync("docs", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
// Suppress the first-run walkthrough so it does not cover the map in the shot.
await page.addInitScript(() => {
  try {
    localStorage.setItem("walkthrough-done", "1");
  } catch {}
});
await page.goto(url);
await page.waitForFunction(() => !!window.__renderer, null, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "docs/layout.png" });
await browser.close();
console.log("wrote docs/layout.png");
