import { test, expect, type Page } from "@playwright/test";

// Polish pass: perceived speed, tactile feedback, keyboard core action,
// focus trapping, security headers, and mobile. Every case here suppresses
// the first-run walkthrough (its own coverage lives in walkthrough.spec.ts).
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

async function totalGenres(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = /A map of (\d+) music/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
}

// Center a genre and zoom in so a click reliably selects exactly it.
async function selectGenre(page: Page, name: string): Promise<{ x: number; y: number }> {
  const world = await page.evaluate(async (n) => {
    const atlas = await fetch("/data/genres.json").then((r) => r.json());
    const g = atlas.genres.find((x: any) => x.name === n);
    return { x: g.x, y: g.y, id: g.id };
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
  return world;
}

const DATA_FILES = ["/data/genres.json", "/data/exemplars.json"];

// Total bytes pulled over the wire for a data file this navigation, summed
// across any matching resource entries. A cold load transfers the body; a
// warm load revalidates and serves from cache, so the bytes collapse.
// (This test uses no page.route: routing disables the browser HTTP cache.)
async function dataTransfer(page: Page, needle: string): Promise<number> {
  return page.evaluate(
    (n) =>
      performance
        .getEntriesByType("resource")
        .filter((r) => r.name.includes(n))
        .reduce((sum, r) => sum + (r as PerformanceResourceTiming).transferSize, 0),
    needle,
  );
}

test("committed data serves from cache on a repeat visit, and the preload hint is present", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMap(page);

  // The atlas download is hinted so it overlaps module parse.
  const preload = page.locator('head link[rel="preload"][href="/data/genres.json"]');
  await expect(preload).toHaveCount(1);

  // Cold: the bodies are pulled over the wire.
  const cold: Record<string, number> = {};
  for (const f of DATA_FILES) {
    cold[f] = await dataTransfer(page, f);
    expect(cold[f], `${f} cold transfer`).toBeGreaterThan(5_000);
  }

  // Second visit within the cache window: the browser revalidates and serves
  // the body from cache, so the warm transfer is a small fraction of the cold.
  await page.goto("/");
  await waitForMap(page);
  for (const f of DATA_FILES) {
    const warm = await dataTransfer(page, f);
    expect(warm, `${f} was re-downloaded on repeat visit`).toBeLessThan(cold[f] / 2);
  }
});

test("tapping a genre draws the selected ring and opens now-playing in the same interaction", async ({
  page,
}) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const world = await selectGenre(page, "jazz");
  // The node answers on the canvas immediately, independent of audio.
  await expect(page.locator("#now-playing")).toBeVisible();
  const selected = await page.evaluate(() => (window as any).__renderer.selected);
  expect(selected).toBe(world.id);

  // Closing clears the ring.
  await page.locator("#np-close").click();
  const cleared = await page.evaluate(() => (window as any).__renderer.selected);
  expect(cleared).toBeNull();
});

test("the keyboard reaches the map core action: Enter selects, then a keyboard stamp lights it", async ({
  page,
}) => {
  await seedEnv(page, "0"); // empty: the centre genre is unstamped, so Stamp shows
  await page.goto("/");
  await waitForMap(page);
  expect(await litCount(page)).toBe(0);

  await page.locator("#map").focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#now-playing")).toBeVisible();
  const selected = await page.evaluate(() => (window as any).__renderer.selected);
  expect(selected).not.toBeNull();

  // The Stamp button is reachable and operable by keyboard, and it lights the
  // centre genre.
  const stamp = page.locator("#np-stamp");
  await stamp.focus();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("np-stamp");
  await page.keyboard.press("Enter");
  expect(await litCount(page)).toBe(1);
});

test("the passport sheet traps Tab, closes on Escape, and restores focus to its opener", async ({
  page,
}) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  // Open from the keyboard so the opener is deterministically the focus.
  await page.locator("#passport-btn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#passport")).toBeVisible();

  // Tab many times: focus never leaves the sheet.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      document.getElementById("passport")!.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }
  // Shift+Tab too.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+Tab");
    const inside = await page.evaluate(() =>
      document.getElementById("passport")!.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }

  // Escape closes the sheet.
  await page.keyboard.press("Escape");
  await expect(page.locator("#passport")).toBeHidden();

  // Reopen and close via the Close button: focus returns to the opener.
  await page.locator("#passport-btn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#passport")).toBeVisible();
  await page.locator("#passport-close").click();
  await expect(page.locator("#passport")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("passport-btn");
});

test("the poster modal traps Tab above the passport and Escape closes it first", async ({
  page,
}) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  await page.locator("#passport-btn").click();
  await page.locator("#poster-open").click();
  await expect(page.locator("#poster")).toBeVisible();

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      document.getElementById("poster")!.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }

  // Escape closes the poster first, leaving the passport open behind it.
  await page.keyboard.press("Escape");
  await expect(page.locator("#poster")).toBeHidden();
  await expect(page.locator("#passport")).toBeVisible();
});

test("the static surface sends the response security headers", async ({ page }) => {
  const root = await page.request.get("/");
  const h = root.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  // No nginx/version leak in the Server header.
  expect(h["server"] ?? "").not.toMatch(/\d/);

  // The headers ride the data surface too.
  const data = await page.request.get("/data/genres.json");
  expect(data.headers()["x-content-type-options"]).toBe("nosniff");
});

test.describe("mobile at 390px", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("no horizontal scroll on the sheets, a tappable legend toggle, and audio on tap", async ({
    page,
  }) => {
    await seedEnv(page, "1");
    await page.goto("/");
    await waitForMap(page);

    const noScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    // Legend toggle is a comfortable target.
    const toggle = (await page.locator("#legend-toggle").boundingBox())!;
    expect(toggle.height).toBeGreaterThanOrEqual(44);

    // Passport sheet: no horizontal scroll.
    await page.locator("#passport-btn").click();
    await expect(page.locator("#passport")).toBeVisible();
    expect(await noScroll()).toBe(true);

    // Poster modal above it: still no horizontal scroll.
    await page.locator("#poster-open").click();
    await expect(page.locator("#poster")).toBeVisible();
    expect(await noScroll()).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#passport")).toBeHidden();

    // A genre tap starts audio on the mobile viewport.
    await selectGenre(page, "jazz");
    await page.waitForFunction(() => (window as any).__nowPlaying?.playing === true, null, {
      timeout: 5_000,
    });
  });
});

test("pan stays smooth at full genre count on a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "1"); // a full-ish passport lit is the heavier case
  await page.goto("/");
  await waitForMap(page);

  // Capture real per-frame timing while panning at fit (all ~2,197 dots in
  // view). Each frame nudges the viewport, forcing a redraw.
  const stats = await page.evaluate(async () => {
    const r = (window as any).__renderer;
    r.fit();
    const deltas: number[] = [];
    let last = performance.now();
    await new Promise<void>((resolve) => {
      let n = 0;
      const step = (now: number) => {
        deltas.push(now - last);
        last = now;
        r.panBy(3, 0);
        if (++n >= 40) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    deltas.shift(); // drop the first interval (scheduling warm-up)
    deltas.sort((a, b) => a - b);
    return { median: deltas[Math.floor(deltas.length / 2)], frames: deltas.length };
  });

  // A smooth redraw holds well under ~30fps worst case even on the shared
  // host. Median (robust to jitter spikes) proves no sustained stutter.
  expect(stats.frames).toBeGreaterThan(30);
  expect(stats.median).toBeLessThan(34);
});

test("signature moment: SEED_DEMO shows lit territory over a dark world within the load budget", async ({
  page,
}) => {
  await seedEnv(page, "1");
  const start = Date.now();
  await page.goto("/");
  // The skeleton holds the frame; the map replaces it with lit-over-dark.
  await waitForMap(page);
  const shownIn = Date.now() - start;

  const lit = await litCount(page);
  const total = await totalGenres(page);
  expect(lit).toBeGreaterThan(0); // territory is already lit
  expect(lit).toBeLessThan(total); // and the world is still mostly dark
  expect(total).toBeGreaterThan(2000);

  // Reset view frames the whole atlas: lit against dark, no hand-crafted input.
  await page.locator("#reset-view").click();
  expect(await litCount(page)).toBe(lit);
  // A generous ceiling for the shared host; the point is it is not minutes.
  expect(shownIn).toBeLessThan(30_000);
});
