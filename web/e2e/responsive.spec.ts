import { expect, test, type Page } from "@playwright/test";

import { withScrollbars } from "./helpers";

// The Ask screen is composed for the whole viewport: on every size, the question
// box and its button sit in the first screen, clear of the fixed header, with no
// sideways scrolling, whichever kind of scrollbar the browser has.

// Scrollbars are drawn, so that classic ones take their room (see withScrollbars).
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const VIEWPORTS = [
  { name: "small phone", width: 360, height: 740 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet, portrait", width: 768, height: 1024 },
  { name: "tablet, landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
  { name: "ultrawide", width: 2560, height: 1080 },
];

for (const viewport of VIEWPORTS) {
  for (const scrollbars of ["overlay", "classic"] as const) {
    test(`the Ask screen fits a ${viewport.name} (${viewport.width}×${viewport.height}), with ${scrollbars} scrollbars`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "viewports are set explicitly here");
      await withScrollbars(page, scrollbars);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      // The page is as wide as the scrollbar leaves it.
      const gutter = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
      expect(gutter).toBe(scrollbars === "classic" ? 17 : 0);
      const input = await page.getByLabel("Describe your situation").boundingBox();
      const submit = await page.getByRole("button", { name: "Reflect" }).boundingBox();
      expect(input && submit).toBeTruthy();
      if (!input || !submit) return;
      expect(input.y).toBeGreaterThan(64);
      expect(submit.y + submit.height).toBeLessThanOrEqual(viewport.height);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

/**
 * Where the 3D instrument is drawn, in page pixels: the box around the opaque
 * pixels of the scene, less the outermost 1% on each side. In the light theme
 * only the instrument itself (its rings, bowl and core) is opaque; its halo,
 * and the dust drifting well beyond it, are faint. Null until it is drawn.
 */
async function instrumentBox(page: Page) {
  // The scene alone, at full strength, over nothing.
  const isolate = await page.addStyleTag({
    content: `html, body { background: transparent !important; }
      body * { visibility: hidden !important; }
      .stage canvas { visibility: visible !important; }
      .stage, .stage * { opacity: 1 !important; transition: none !important; }`,
  });
  const png = await page.locator(".stage canvas").screenshot({ omitBackground: true });
  await isolate.evaluate((element) => (element as HTMLStyleElement).remove());
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const columns = new Array<number>(width).fill(0);
    const rows = new Array<number>(height).fill(0);
    let opaque = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] >= 153) {
          columns[x]++;
          rows[y]++;
          opaque++;
        }
      }
    }
    if (opaque < 200) return null;
    const edge = (counts: number[], share: number) => {
      let sum = 0;
      return counts.findIndex((count) => (sum += count) > opaque * share);
    };
    return { left: edge(columns, 0.01), right: edge(columns, 0.99), top: edge(rows, 0.01), bottom: edge(rows, 0.99) };
  }, png.toString("base64"));
}

test("with a classic scrollbar, the 3D instrument rests where the conversation leaves room for it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "viewports are set explicitly here");
  // The media queries see the whole window, the page and the scene 17px less:
  // from 1280px the column leaves the margin to the instrument, below it the
  // space above the question.
  await withScrollbars(page, "classic");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator(".stage")).toHaveAttribute("data-scene", "ready", { timeout: 45_000 });
  // The question is held, so the conversation keeps it while the scene thinks.
  await page.route("**/api/ask/stream", () => new Promise<void>(() => undefined));
  await page.getByLabel("Describe your situation").fill("How do I handle uncertainty about my future?");
  await page.getByRole("button", { name: "Reflect" }).click();
  const turn = page.getByRole("article", { name: "Current question" });
  await expect(turn).toBeVisible();

  for (const width of [1279, 1280, 1296]) {
    await page.setViewportSize({ width, height: 900 });
    // The browser applies the new size's media queries at its next frame.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const column = await turn.boundingBox();
    expect(column).toBeTruthy();
    if (!column) return;
    const label = `${width}×900`;
    if (width >= 1280) {
      // Beside the reading column.
      await expect.poll(async () => (await instrumentBox(page))?.left ?? 0, { message: label }).toBeGreaterThanOrEqual(column.x + column.width);
    } else {
      // Above the question.
      await expect.poll(async () => (await instrumentBox(page))?.bottom ?? Infinity, { message: label }).toBeLessThanOrEqual(column.y);
    }
  }
});

for (const viewport of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[6]]) {
  test(`key pages have no sideways scrolling on a ${viewport.name}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "viewports are set explicitly here");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of ["/", "/explore", "/explore?q=anger", "/scripture/bhagavad-gita/2", "/scripture/bhagavad-gita/2/47", "/concepts", "/stories/nachiketas-and-death"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
}

test("a half-verse mark stays on the line of the word before it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/scripture/bhagavad-gita/2/47");
  const verse = page.locator("article[aria-label='Bhagavad Gita 2.47']");
  // Compared exactly: Playwright's text matchers would treat the no-break space as a space.
  expect(await verse.locator("[lang=sa]").first().textContent()).toContain("कदाचन\u00a0।");
  expect(await verse.locator("[lang=sa-Latn]").first().textContent()).toContain("kadācana\u00a0|");
});
