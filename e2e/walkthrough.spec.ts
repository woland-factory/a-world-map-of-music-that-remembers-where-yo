import { test, expect, type Page, type Locator } from "@playwright/test";

// The guided first run points at the dare card's real controls. These specs
// drive the live path; every other spec suppresses it (see their beforeEach).

function seedEnv(page: Page, seed: "0" | "1"): Promise<void> {
  return page.route("**/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__ENV__ = { SEED_DEMO: "${seed}", SENTRY_DSN: "", UMAMI_URL: "", UMAMI_WEBSITE_ID: "" };`,
    }),
  );
}

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("#map")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__renderer, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__exemplarsReady === true, null, {
    timeout: 10_000,
  });
}

async function litCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = /\.\s(\d+)\slit/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

// Assert the coach-mark ring is drawn over the given control.
async function ringOver(page: Page, control: Locator): Promise<void> {
  const ring = (await page.locator(".wt-ring").boundingBox())!;
  const box = (await control.boundingBox())!;
  expect(intersects(ring, box)).toBe(true);
}

async function doneFlag(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem("walkthrough-done"));
}

test("dark first visit: pick, play, stamp walks the loop, then it is gone", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);

  const wt = page.locator("#walkthrough");
  const dare = page.locator("#dare");
  await expect(wt).toBeVisible();

  // Step 1: pick a starter.
  await expect(page.locator(".wt-text")).toHaveText("Pick a sound you love to start.");
  await ringOver(page, dare.locator(".dare-chip").first());
  await dare.locator(".dare-chip").first().click();

  // Step 2: play the dare.
  await expect(page.locator(".wt-text")).toHaveText("Play your dare to hear it.");
  await expect(dare.locator(".dare-play")).toBeVisible();
  await ringOver(page, dare.locator(".dare-play"));
  const before = await litCount(page);
  await dare.locator(".dare-play").click();
  await page.waitForFunction(() => (window as any).__nowPlaying?.playing === true, null, {
    timeout: 5_000,
  });

  // Step 3: stamp it.
  await expect(page.locator(".wt-text")).toHaveText("Stamp it to cross the frontier.");
  await ringOver(page, dare.getByRole("button", { name: "Stamp it" }));
  await dare.getByRole("button", { name: "Stamp it" }).click();

  // The frontier moved and the path is gone for good.
  expect(await litCount(page)).toBe(before + 1);
  await expect(dare.locator(".dare-heading")).toHaveText("Frontier moved.");
  await expect(wt).toBeHidden();
  expect(await doneFlag(page)).toBe("1");
});

test("lit first visit: play then stamp reaches the frontier through two steps", async ({ page }) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const wt = page.locator("#walkthrough");
  const dare = page.locator("#dare");
  await expect(wt).toBeVisible();

  // Step 1: play today's dare.
  await expect(page.locator(".wt-text")).toHaveText("Play today's dare to hear it.");
  await ringOver(page, dare.locator(".dare-play"));
  const before = await litCount(page);
  await dare.locator(".dare-play").click();
  await page.waitForFunction(() => (window as any).__nowPlaying?.playing === true, null, {
    timeout: 5_000,
  });

  // Step 2: stamp it.
  await expect(page.locator(".wt-text")).toHaveText("Stamp it to cross the frontier.");
  await ringOver(page, dare.getByRole("button", { name: "Stamp it" }));
  await dare.getByRole("button", { name: "Stamp it" }).click();

  expect(await litCount(page)).toBe(before + 1);
  await expect(dare.locator(".dare-heading")).toHaveText("Frontier moved.");
  await expect(wt).toBeHidden();
  expect(await doneFlag(page)).toBe("1");
});

test("never again: a crossing then a reload does not bring the path back", async ({ page }) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const wt = page.locator("#walkthrough");
  const dare = page.locator("#dare");
  await expect(wt).toBeVisible();
  await dare.locator(".dare-play").click();
  await page.waitForFunction(() => (window as any).__nowPlaying?.playing === true, null, {
    timeout: 5_000,
  });
  await dare.getByRole("button", { name: "Stamp it" }).click();
  await expect(wt).toBeHidden();

  await page.reload();
  await waitForMap(page);
  await expect(wt).toBeHidden();
});

test("never again: Skip on first load hides it and a reload keeps it hidden", async ({ page }) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const wt = page.locator("#walkthrough");
  await expect(wt).toBeVisible();
  await page.locator(".wt-skip").click();
  await expect(wt).toBeHidden();
  expect(await doneFlag(page)).toBe("1");
  expect(await litCount(page)).toBeGreaterThan(0); // Skip made no stamp; the seed stands

  await page.reload();
  await waitForMap(page);
  await expect(wt).toBeHidden();
});

test("a returning user with a stored passport never sees the path", async ({ page }) => {
  await seedEnv(page, "0");
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "passport",
        JSON.stringify({
          version: 3,
          stamps: [],
          streak: { count: 0, lastCompleted: null },
          frontierHistory: [],
          dare: null,
        }),
      );
    } catch {}
  });
  await page.goto("/");
  await waitForMap(page);
  await expect(page.locator("#walkthrough")).toBeHidden();
});

test("mobile + a11y: fits at 390px, focus and keyboard reach the controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const wt = page.locator("#walkthrough");
  await expect(wt).toBeVisible();

  // No horizontal scroll at 390px.
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);

  // The Skip target is comfortably tappable.
  const skipBox = (await page.locator(".wt-skip").boundingBox())!;
  expect(skipBox.height).toBeGreaterThanOrEqual(44);

  // Focus is on the highlighted control when the step appears.
  const onPlay = await page.evaluate(
    () => document.activeElement?.classList.contains("dare-play") === true,
  );
  expect(onPlay).toBe(true);

  // The step sentence lives in the aria-live container.
  await expect(page.locator("#walkthrough .wt-text")).toHaveText("Play today's dare to hear it.");

  // Tab reaches the Skip button from the focused control.
  let reachedSkip = false;
  for (let i = 0; i < 40 && !reachedSkip; i++) {
    await page.keyboard.press("Tab");
    reachedSkip = await page.evaluate(
      () => document.activeElement?.classList.contains("wt-skip") === true,
    );
  }
  expect(reachedSkip).toBe(true);

  // Escape skips the path when no dialog is open.
  await page.keyboard.press("Escape");
  await expect(wt).toBeHidden();
});
