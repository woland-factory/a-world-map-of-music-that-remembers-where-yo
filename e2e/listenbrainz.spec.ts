import { test, expect, type Page } from "@playwright/test";

// Every /api route is mocked with page.route: the e2e web server is the
// static production build and the suite never touches the real proxy.

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("#map")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__renderer, null, { timeout: 20_000 });
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

async function litCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = /\.\s(\d+)\slit/.exec(document.getElementById("map")!.getAttribute("aria-label")!);
    return Number(m?.[1] ?? "0");
  });
}

async function twoMbids(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const atlas = await fetch("/data/genres.json").then((r) => r.json());
    return [atlas.genres[0].mbid, atlas.genres[1].mbid];
  });
}

function mockFill(page: Page, mbids: string[]): Promise<void> {
  return page.route("**/api/listenbrainz/**", (route) =>
    route.fulfill({
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        stamps: mbids.map((mbid, i) => ({ mbid, name: `g${i}`, listenCount: 10 - i })),
        pending: false,
      }),
    }),
  );
}

async function openPassport(page: Page): Promise<void> {
  await page.locator("#passport-btn").click();
  await expect(page.locator("#passport")).toBeVisible();
}

test("a valid name lights the map: count, persistence, fit, message", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const before = await litCount(page);
  const mbids = await twoMbids(page);
  await mockFill(page, mbids);

  await openPassport(page);
  await page.locator("#lb-name").fill("lb-e2e-traveler");
  // Zoom away so the success fit is observable.
  await page.evaluate(() => (window as any).__renderer.zoomBy(3, 50, 50));
  await page.locator("#lb-fill").click();

  await expect(page.locator("#lb-status")).toHaveText("Lit 2 new genres from your travels.");
  expect(await litCount(page)).toBe(before + 2);
  await expect(page.locator("#passport-countline")).toContainText(`${before + 2} of ~2,200 lit`);

  // The view returned to the zoomed-out fit.
  const scale = await page.evaluate(() => (window as any).__renderer.vp.scale);
  const fitScale = await page.evaluate(() => (window as any).__renderer.fitScale);
  expect(scale).toBeCloseTo(fitScale, 5);

  // Stamps carry today's date and no track fields; the name is nowhere in storage.
  const stored = await page.evaluate(() => window.localStorage.getItem("passport") ?? "");
  const passport = JSON.parse(stored);
  const todayStr = await page.evaluate(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  for (const s of passport.stamps) {
    expect(s.date).toBe(todayStr);
    expect(s.trackTitle).toBeUndefined();
    expect(s.artist).toBeUndefined();
  }
  const allStorage = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(allStorage).not.toContain("lb-e2e-traveler");

  await page.reload();
  await waitForMap(page);
  expect(await litCount(page)).toBe(before + 2);
  const afterReload = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(afterReload).not.toContain("lb-e2e-traveler");
});

test("the busy status shows while a slow lookup is in flight", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const mbids = await twoMbids(page);
  await page.route("**/api/listenbrainz/**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        stamps: [{ mbid: mbids[0], name: "g", listenCount: 1 }],
        pending: false,
      }),
    });
  });
  await openPassport(page);
  await page.locator("#lb-name").fill("slowpoke");
  await page.locator("#lb-fill").click();
  await expect(page.locator("#lb-status")).toHaveText("Looking up your genres.");
  await expect(page.locator("#lb-fill")).toBeDisabled();
  await expect(page.locator("#lb-status")).toHaveText("Lit 1 new genre from your travels.");
  await expect(page.locator("#lb-fill")).toBeEnabled();
});

test("empty and whitespace names show the local message and never hit /api", async ({ page }) => {
  await seedEnv(page, "0");
  const apiRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) apiRequests.push(req.url());
  });
  await page.goto("/");
  await waitForMap(page);
  await openPassport(page);

  for (const name of ["", "   "]) {
    await page.locator("#lb-name").fill(name);
    await page.locator("#lb-fill").click();
    await expect(page.locator("#lb-status")).toHaveText(
      "Type a ListenBrainz name first, or tap any genre to stamp it yourself.",
    );
  }
  expect(apiRequests).toHaveLength(0);
});

test("a mocked 404 and 502 show their exact strings and change nothing", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  const before = await litCount(page);
  await openPassport(page);

  await page.route("**/api/listenbrainz/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error:
          "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself.",
      }),
    }),
  );
  await page.locator("#lb-name").fill("nobody-here");
  await page.locator("#lb-fill").click();
  await expect(page.locator("#lb-status")).toHaveText(
    "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself.",
  );

  await page.unroute("**/api/listenbrainz/**");
  await page.route("**/api/listenbrainz/**", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "ListenBrainz didn't answer. Try again in a moment." }),
    }),
  );
  await page.locator("#lb-fill").click();
  await expect(page.locator("#lb-status")).toHaveText(
    "ListenBrainz didn't answer. Try again in a moment.",
  );

  expect(await litCount(page)).toBe(before);
  await expect(page.locator("#passport-countline")).toContainText(`${before} of ~2,200 lit`);
});

test("a fill that includes the dare genre never bumps the streak", async ({ page }) => {
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);

  // Light one genre from the starter chips so a dare gets pinned.
  await page.locator(".dare-chip").first().click();
  const dareMbid = await page.evaluate(() => {
    const p = JSON.parse(window.localStorage.getItem("passport")!);
    return p.dare?.mbid ?? null;
  });
  expect(dareMbid).not.toBeNull();
  const before = await litCount(page);

  await mockFill(page, [dareMbid]);
  await openPassport(page);
  await page.locator("#lb-name").fill("dare-filler");
  await page.locator("#lb-fill").click();
  await expect(page.locator("#lb-status")).toHaveText("Lit 1 new genre from your travels.");
  expect(await litCount(page)).toBe(before + 1);

  const state = await page.evaluate(() => {
    const p = JSON.parse(window.localStorage.getItem("passport")!);
    return { streak: p.streak.count, dareDone: p.dare?.done };
  });
  // The dare shows done without a streak bump: streaks record dares taken.
  expect(state.streak).toBe(0);
  expect(state.dareDone).toBe(true);
});

test("mobile: fill controls are reachable, labeled, tappable, no sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page, "0");
  await page.goto("/");
  await waitForMap(page);
  await openPassport(page);

  const input = page.locator("#lb-name");
  await expect(input).toBeVisible();
  await expect(page.locator("label[for=lb-name]")).toHaveText("ListenBrainz name");
  const inputBox = (await input.boundingBox())!;
  expect(inputBox.height).toBeGreaterThanOrEqual(44);
  const fillBox = (await page.locator("#lb-fill").boundingBox())!;
  expect(fillBox.height).toBeGreaterThanOrEqual(44);

  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);

  // Keyboard reachable: the input accepts focus and the form submits.
  await input.focus();
  await input.press("Enter");
  await expect(page.locator("#lb-status")).toHaveText(
    "Type a ListenBrainz name first, or tap any genre to stamp it yourself.",
  );
});
