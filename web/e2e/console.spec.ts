import { expect, test } from "@playwright/test";

// Pages render without errors or warnings from React or Next.js in the console.
const PAGES = [
  "/",
  "/explore",
  "/explore?q=anger",
  "/scripture/bhagavad-gita",
  "/scripture/bhagavad-gita/2",
  "/scripture/bhagavad-gita/2/47",
  "/scripture/katha-upanishad/2/1",
  "/concepts",
  "/concepts/equanimity",
  "/stories/nachiketas-and-death",
  "/reflections",
  "/about",
  "/settings",
];

// Headless Chromium has no display, so it reads each WebGL frame back to composite it,
// and its GL driver reports that as a performance message. That comes from the test
// browser, not from the app; every other warning or error still fails the test.
const HEADLESS_GL_NOISE = /GL Driver Message \(OpenGL, Performance/;

for (const colorScheme of ["light", "dark"] as const) {
  test(`key pages log no console errors (${colorScheme} theme)`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      if (HEADLESS_GL_NOISE.test(message.text())) return;
      problems.push(`${page.url()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`${page.url()}: ${error}`));
    await page.emulateMedia({ colorScheme });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/") {
        // Scroll through the whole landing story, so the scene and the motion run.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 600) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(120);
        }
      }
    }
    expect(problems).toEqual([]);
  });
}
