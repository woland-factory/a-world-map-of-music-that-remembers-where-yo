import { test, expect, type Page } from "@playwright/test";
import { statSync } from "node:fs";

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("#map")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__renderer, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__exemplarsReady === true, null, {
    timeout: 10_000,
  });
}

function seedEnv(page: Page): Promise<void> {
  return page.route("**/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__ENV__ = { SEED_DEMO: "1", SENTRY_DSN: "", UMAMI_URL: "", UMAMI_WEBSITE_ID: "" };`,
    }),
  );
}

async function openPoster(page: Page): Promise<void> {
  await page.locator("#passport-btn").click();
  await expect(page.locator("#passport")).toBeVisible();
  await page.locator("#poster-open").click();
  await expect(page.locator("#poster")).toBeVisible();
}

test("the poster previews at print size and downloads over 20 kB, zero non-origin requests", async ({
  page,
}) => {
  await seedEnv(page);
  const external: string[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.host !== new URL(page.url() || "http://127.0.0.1").host && u.protocol !== "data:") {
      external.push(req.url());
    }
  });
  await page.goto("/");
  await waitForMap(page);
  await openPoster(page);
  const before = external.length;

  const img = page.locator("#poster-img");
  await expect(img).toBeVisible();
  const size = await img.evaluate((el: HTMLImageElement) => ({
    w: el.naturalWidth,
    h: el.naturalHeight,
  }));
  expect(size).toEqual({ w: 1080, h: 1350 });
  await expect(page.locator("#poster-wait")).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#poster-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("music-map-poster.png");
  const path = await download.path();
  expect(statSync(path!).size).toBeGreaterThan(20_000);

  // Nothing left the origin between opening the modal and the download.
  expect(external.length).toBe(before);
});

test("Escape closes the poster before the passport sheet and restores focus", async ({ page }) => {
  await seedEnv(page);
  await page.goto("/");
  await waitForMap(page);
  await openPoster(page);

  // Focus moved into the modal on open.
  const focusInModal = await page.evaluate(
    () => !!document.getElementById("poster")?.contains(document.activeElement),
  );
  expect(focusInModal).toBe(true);

  // Grab the object URL, then close: the URL must be dead afterwards.
  await expect(page.locator("#poster-img")).toBeVisible();
  const objectUrl = await page
    .locator("#poster-img")
    .evaluate((el: HTMLImageElement) => el.src);
  expect(objectUrl).toMatch(/^blob:/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#poster")).toBeHidden();
  await expect(page.locator("#passport")).toBeVisible();

  const focusedId = await page.evaluate(() => document.activeElement?.id);
  expect(focusedId).toBe("poster-open");

  const urlState = await page.evaluate(async (src) => {
    try {
      await fetch(src);
      return "alive";
    } catch {
      return "revoked";
    }
  }, objectUrl);
  expect(urlState).toBe("revoked");

  await page.keyboard.press("Escape");
  await expect(page.locator("#passport")).toBeHidden();
});

test("mobile 390px: the modal fits with tappable controls and no sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedEnv(page);
  await page.goto("/");
  await waitForMap(page);
  await openPoster(page);
  await expect(page.locator("#poster-img")).toBeVisible();

  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);

  const inner = (await page.locator(".poster-inner").boundingBox())!;
  expect(inner.width).toBeLessThanOrEqual(390);
  expect(inner.y).toBeGreaterThanOrEqual(0);
  expect(inner.y + inner.height).toBeLessThanOrEqual(800);

  const closeBox = (await page.locator("#poster-close").boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  const dlBox = (await page.locator("#poster-download").boundingBox())!;
  expect(dlBox.height).toBeGreaterThanOrEqual(44);
});
