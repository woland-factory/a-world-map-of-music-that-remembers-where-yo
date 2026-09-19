import { test, expect, type Page } from "@playwright/test";

// Suppress the first-run walkthrough so these specs test their own feature.
// Its own coverage lives in e2e/walkthrough.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("walkthrough-done", "1");
    } catch {}
  });
});

// Read the renderer viewport that main.ts exposes for tests.
async function viewport(page: Page): Promise<{ scale: number; offsetX: number; offsetY: number }> {
  return page.evaluate(() => (window as any).__renderer.vp);
}

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("#map")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__renderer, null, { timeout: 20_000 });
}

test("shows the skeleton first, then the map", async ({ page }) => {
  // Delay the atlas so the skeleton is observable before data resolves.
  await page.route("**/data/genres.json", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#skeleton")).toBeVisible();
  await expect(page.locator(".skeleton-caption")).toHaveText("Charting the atlas of music.");
  await waitForMap(page);
  await expect(page.locator("#skeleton")).toBeHidden();
});

test("no horizontal scroll at a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await waitForMap(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(overflow).toBe(true);
});

test("drag pans the map", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const before = await viewport(page);
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const after = await viewport(page);
  expect(after.offsetX).not.toBe(before.offsetX);
});

test("zoom control changes the scale", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const before = await viewport(page);
  await page.locator("#zoom-in").click();
  const after = await viewport(page);
  expect(after.scale).toBeGreaterThan(before.scale);
});

test("keyboard zooms the map", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const before = await viewport(page);
  await page.locator("#map").focus();
  await page.keyboard.press("+");
  const after = await viewport(page);
  expect(after.scale).toBeGreaterThan(before.scale);
});

test("failed atlas load shows the error state with a working reload", async ({ page }) => {
  await page.route("**/data/genres.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let's try that again" })).toBeVisible();
  const reload = page.locator("#reload");
  await expect(reload).toBeVisible();
  // Let the reload succeed this time.
  await page.unroute("**/data/genres.json");
  await reload.click();
  await waitForMap(page);
});

test("SEED_DEMO lights the map on first load", async ({ page }) => {
  // Override runtime config so the demo passport seeds.
  await page.route("**/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.__ENV__ = { SEED_DEMO: "1", SENTRY_DSN: "", UMAMI_URL: "", UMAMI_WEBSITE_ID: "" };',
    }),
  );
  await page.goto("/");
  await waitForMap(page);
  const label = await page.locator("#map").getAttribute("aria-label");
  expect(label).not.toBeNull();
  const lit = Number(/\.\s(\d+)\slit/.exec(label!)?.[1] ?? "0");
  expect(lit).toBeGreaterThan(0);
});
