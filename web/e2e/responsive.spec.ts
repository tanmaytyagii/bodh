import { expect, test } from "@playwright/test";

// The Ask screen is composed for the whole viewport: on every size, the question
// box and its button sit in the first screen, clear of the fixed header, with no
// sideways scrolling.

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
  test(`the Ask screen fits a ${viewport.name} (${viewport.width}×${viewport.height})`, async ({ page, isMobile }) => {
    test.skip(isMobile, "viewports are set explicitly here");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    const input = await page.getByLabel("Describe your situation").boundingBox();
    const submit = await page.getByRole("button", { name: "Reflect" }).boundingBox();
    expect(input && submit).toBeTruthy();
    if (!input || !submit) return;
    expect(input.y).toBeGreaterThan(64);
    expect(submit.y + submit.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

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
