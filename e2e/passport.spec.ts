import { test, expect, type Page } from "@playwright/test";

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("#map")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__renderer, null, { timeout: 20_000 });
  // Exemplars load in parallel; wait until the index is ready so taps hear.
  await page.waitForFunction(() => (window as any).__exemplarsReady === true, null, {
    timeout: 10_000,
  });
}

function seedEnv(page: Page, seed: "0" | "1"): Promise<void> {
  return page.route("**/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__ENV__ = { SEED_DEMO: "${seed}", SENTRY_DSN: "", UMAMI_URL: "", UMAMI_WEBSITE_ID: "" };`,
    }),
  );
}

// Data-driven picks: a genre that has a preview, and one that does not.
async function pickGenres(page: Page): Promise<{ withPreview: string; noPreview: string }> {
  return page.evaluate(async () => {
    const [atlas, exemplars] = await Promise.all([
      fetch("/data/genres.json").then((r) => r.json()),
      fetch("/data/exemplars.json").then((r) => r.json()),
    ]);
    const withPreview = atlas.genres.find((g: any) => exemplars.exemplars[g.mbid]);
    const noPreview = atlas.genres.find((g: any) => !exemplars.exemplars[g.mbid]);
    return { withPreview: withPreview.name, noPreview: noPreview.name };
  });
}

// Center a genre and zoom in hard so its neighbors separate, then return the
// screen point of its node so a click reliably hits exactly that genre.
async function focusGenre(page: Page, name: string): Promise<{ x: number; y: number }> {
  const world = await page.evaluate(async (n) => {
    const atlas = await fetch("/data/genres.json").then((r) => r.json());
    const g = atlas.genres.find((x: any) => x.name === n);
    return { x: g.x, y: g.y };
  }, name);

  await page.evaluate((w) => {
    const r = (window as any).__renderer;
    const cw = r.width;
    const ch = r.height;
    const sx = w.x * r.vp.scale + r.vp.offsetX;
    const sy = w.y * r.vp.scale + r.vp.offsetY;
    r.panBy(cw / 2 - sx, ch / 2 - sy);
    for (let i = 0; i < 16; i++) r.zoomBy(1.4, cw / 2, ch / 2);
  }, world);

  const info = await page.evaluate((w) => {
    const r = (window as any).__renderer;
    const c = document.getElementById("map")!.getBoundingClientRect();
    return {
      x: c.left + w.x * r.vp.scale + r.vp.offsetX,
      y: c.top + w.y * r.vp.scale + r.vp.offsetY,
    };
  }, world);
  return info;
}

test("tapping a genre with a preview plays it and reveals the track", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const { withPreview } = await pickGenres(page);
  const pt = await focusGenre(page, withPreview);
  await page.mouse.click(pt.x, pt.y);

  await expect(page.locator("#now-playing")).toBeVisible();
  await expect(page.locator("#np-title")).toHaveText(withPreview);
  const hook = await page.evaluate(() => (window as any).__nowPlaying);
  expect(hook.hasPreview).toBe(true);
  expect(hook.playing).toBe(true);
  expect(hook.trackTitle).not.toBeNull();
});

test("a genre without a preview shows an honest resting state", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const { noPreview } = await pickGenres(page);
  const pt = await focusGenre(page, noPreview);
  await page.mouse.click(pt.x, pt.y);

  await expect(page.locator("#now-playing")).toBeVisible();
  await expect(page.locator("#np-track")).toHaveText("Silent for now. Stamp it to remember.");
  await expect(page.locator("#np-stamp")).toBeVisible();
  const hook = await page.evaluate(() => (window as any).__nowPlaying);
  expect(hook.hasPreview).toBe(false);
});

test("stamping lights the genre immediately and survives a reload", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const litBefore = await page.evaluate(() => {
    const m = /\.\s(\d+)\slit/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
  const { withPreview } = await pickGenres(page);
  const pt = await focusGenre(page, withPreview);
  await page.mouse.click(pt.x, pt.y);
  await page.locator("#np-stamp").click();

  const litAfter = await page.evaluate(() => {
    const m = /\.\s(\d+)\slit/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
  expect(litAfter).toBe(litBefore + 1);
  await expect(page.locator("#np-stamped")).toBeVisible();

  await page.reload();
  await waitForMap(page);
  const litReload = await page.evaluate(() => {
    const m = /\.\s(\d+)\slit/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
  expect(litReload).toBe(litBefore + 1);
});

test("dragging pans without selecting a genre", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("#now-playing")).toBeHidden();
});

test("the passport lists seeded stamps with dates and tracks, and See your map fits", async ({
  page,
}) => {
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  await page.locator("#passport-btn").click();
  await expect(page.locator("#passport")).toBeVisible();
  await expect(page.locator("#passport-countline")).toContainText("of ~2,200 lit");
  const rows = page.locator("#passport-list .ps-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  // At least one row shows the track that earned it (middot separator).
  await expect(page.locator("#passport-list .ps-meta").first()).toContainText("·");
  await expect(page.locator("#passport-list .ps-date").first()).toHaveText(/\d{4}-\d{2}-\d{2}/);

  // Zoom away from the fit, then "See your map" should frame the zoom-out.
  await page.evaluate(() => (window as any).__renderer.zoomBy(3, 100, 100));
  const zoomed = await page.evaluate(() => (window as any).__renderer.vp.scale);
  await page.locator("#passport-see").click();
  await expect(page.locator("#passport")).toBeHidden();
  const after = await page.evaluate(() => (window as any).__renderer.vp.scale);
  const fitScale = await page.evaluate(() => (window as any).__renderer.fitScale);
  expect(after).not.toBe(zoomed);
  expect(after).toBeCloseTo(fitScale, 5);
});

test("the empty passport shows designed, directive copy", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  await page.locator("#passport-btn").click();
  await expect(page.locator("#passport-empty")).toBeVisible();
  await expect(page.locator("#passport-empty h3")).toHaveText("Your map is dark");
  await expect(page.locator("#passport-empty p")).toHaveText(
    "Tap a genre to hear it. Stamp the ones you love.",
  );
});

test("export downloads a passport file and import restores it, no network", async ({ page }) => {
  await seedEnv(page, "1");
  const external: string[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.host !== new URL(page.url() || "http://127.0.0.1").host && u.protocol !== "data:") {
      external.push(req.url());
    }
  });
  await page.goto("/");
  await waitForMap(page);
  await page.locator("#passport-btn").click();

  const before = external.length;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#passport-export").click(),
  ]);
  expect(download.suggestedFilename()).toBe("music-passport.json");

  // Craft an import that lights one known genre by mbid.
  const mbid = await page.evaluate(async () => {
    const ex = await fetch("/data/exemplars.json").then((r) => r.json());
    return Object.keys(ex.exemplars)[0];
  });
  const payload = JSON.stringify({
    version: 2,
    stamps: [{ genreId: -1, mbid, date: "2025-01-02", trackTitle: "T", artist: "A" }],
  });
  await page.setInputFiles("#passport-file", {
    name: "music-passport.json",
    mimeType: "application/json",
    buffer: Buffer.from(payload),
  });
  await expect(page.locator("#passport-msg")).toHaveText("Passport restored.");
  await expect(page.locator("#passport-countline")).toContainText("1 of ~2,200 lit");
  // No request left the origin during export/import.
  expect(external.length).toBe(before);
});

test("mobile: no horizontal scroll, tappable targets, managed focus, Escape closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "1");
  await page.goto("/");
  await waitForMap(page);

  const btn = page.locator("#passport-btn");
  const box = (await btn.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);

  await btn.click();
  await expect(page.locator("#passport")).toBeVisible();
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);
  // Focus moved into the sheet.
  const focusInSheet = await page.evaluate(
    () => !!document.getElementById("passport")?.contains(document.activeElement),
  );
  expect(focusInSheet).toBe(true);
  // Action buttons are comfortably tappable.
  const exportBox = (await page.locator("#passport-export").boundingBox())!;
  expect(exportBox.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(page.locator("#passport")).toBeHidden();
});
