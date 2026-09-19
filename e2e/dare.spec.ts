import { test, expect, type Page } from "@playwright/test";

// Suppress the first-run walkthrough so this spec tests its own feature.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("walkthrough-done", "1");
    } catch {}
  });
});

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

// Center a genre and zoom in so a click reliably selects exactly it.
async function selectGenre(page: Page, name: string): Promise<void> {
  const world = await page.evaluate(async (n) => {
    const atlas = await fetch("/data/genres.json").then((r) => r.json());
    const g = atlas.genres.find((x: any) => x.name === n);
    return { x: g.x, y: g.y };
  }, name);
  await page.evaluate((w) => {
    const r = (window as any).__renderer;
    const sx = w.x * r.vp.scale + r.vp.offsetX;
    const sy = w.y * r.vp.scale + r.vp.offsetY;
    r.panBy(r.width / 2 - sx, r.height / 2 - sy);
    for (let i = 0; i < 16; i++) r.zoomBy(1.4, r.width / 2, r.height / 2);
  }, world);
  const pt = await page.evaluate((w) => {
    const r = (window as any).__renderer;
    const c = document.getElementById("map")!.getBoundingClientRect();
    return { x: c.left + w.x * r.vp.scale + r.vp.offsetX, y: c.top + w.y * r.vp.scale + r.vp.offsetY };
  }, world);
  await page.mouse.click(pt.x, pt.y);
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

// T3 + T4: the dare plays instantly, one tap stamps and advances the frontier,
// and the streak + Done state survive a reload.
test("the dare plays, one tap stamps and advances the frontier, and it survives reload", async ({
  page,
}) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const dare = page.locator("#dare");
  await expect(dare).toBeVisible();
  await expect(dare.locator(".dare-label")).toHaveText("Today's dare");
  const dareName = await dare.locator(".dare-heading").textContent();

  // Play starts audio intent inside the gesture.
  await dare.locator(".dare-play").click();
  await page.waitForFunction(() => (window as any).__nowPlaying?.playing === true, null, {
    timeout: 5_000,
  });

  const before = await litCount(page);
  const streakText = await dare.locator(".dare-streak").textContent();
  await dare.getByRole("button", { name: "Stamp it" }).click();

  // The frontier advances immediately and the card flips to Done.
  expect(await litCount(page)).toBe(before + 1);
  await expect(dare.locator(".dare-heading")).toHaveText("Frontier moved.");
  await expect(dare.locator(".dare-body")).toContainText(dareName!.trim());
  const streakAfter = await dare.locator(".dare-streak").textContent();
  expect(streakAfter).not.toBe(streakText); // the streak advanced

  // Reload: the dare is still Done and the streak persists.
  await page.reload();
  await waitForMap(page);
  await expect(dare).toBeVisible();
  await expect(dare.locator(".dare-heading")).toHaveText("Frontier moved.");
  expect(await dare.locator(".dare-streak").textContent()).toBe(streakAfter);
  expect(await litCount(page)).toBe(before + 1);
});

// T5: from an empty passport, the starter prompt lets the user pick a start,
// which lights it and reveals a playable-neighbor dare.
test("an empty passport shows the starter prompt and a pick reveals a dare", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);

  const dare = page.locator("#dare");
  await expect(dare).toBeVisible();
  await expect(dare.locator(".dare-heading")).toHaveText("Where do you want to start?");
  await expect(dare.locator(".dare-body")).toHaveText(
    "Pick a sound you love. We dare you one step past it.",
  );
  const chips = dare.locator(".dare-chip");
  expect(await chips.count()).toBeGreaterThanOrEqual(4);
  expect(await litCount(page)).toBe(0);

  await chips.first().click();

  // The start is lit and the card now shows a dare for a neighbor.
  expect(await litCount(page)).toBe(1);
  await expect(dare.locator(".dare-label")).toHaveText("Today's dare");
  await expect(dare.locator(".dare-play")).toBeVisible();
  await expect(dare.getByRole("button", { name: "Stamp it" })).toBeVisible();
});

// T6: mobile layout. The card clears the passport button and now-playing
// panel, and its controls are comfortably tappable.
test("mobile: the dare card fits, clears other panels, and has tappable targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const dare = page.locator("#dare");
  await expect(dare).toBeVisible();

  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);

  const dareBox = (await dare.boundingBox())!;
  const passportBox = (await page.locator("#passport-btn").boundingBox())!;
  expect(intersects(dareBox, passportBox)).toBe(false);

  // Targets are >=44px.
  const playBox = (await dare.locator(".dare-play").boundingBox())!;
  const stampBox = (await dare.getByRole("button", { name: "Stamp it" }).boundingBox())!;
  expect(playBox.height).toBeGreaterThanOrEqual(44);
  expect(stampBox.height).toBeGreaterThanOrEqual(44);

  // Show the now-playing panel and confirm the dare card clears it too.
  await selectGenre(page, "jazz");
  await expect(page.locator("#now-playing")).toBeVisible();
  const npBox = (await page.locator("#now-playing").boundingBox())!;
  const dareBox2 = (await dare.boundingBox())!;
  expect(intersects(dareBox2, npBox)).toBe(false);
});

// T6: collapse/expand focus management and Escape.
test("the dare card collapses to a pill, expands with focus, and Escape collapses it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const dare = page.locator("#dare");
  await expect(dare).toBeVisible();
  await expect(page.locator("#dare-panel")).toBeVisible();

  // Collapse to the pill.
  await page.locator("#dare-collapse").click();
  await expect(page.locator("#dare-pill")).toBeVisible();
  await expect(page.locator("#dare-panel")).toBeHidden();

  // Expanding moves focus into the card.
  await page.locator("#dare-pill").click();
  await expect(page.locator("#dare-panel")).toBeVisible();
  const focusInCard = await page.evaluate(
    () => !!document.getElementById("dare-content")?.contains(document.activeElement),
  );
  expect(focusInCard).toBe(true);

  // Escape collapses it back to the pill.
  await page.keyboard.press("Escape");
  await expect(page.locator("#dare-pill")).toBeVisible();
  await expect(page.locator("#dare-panel")).toBeHidden();
});
