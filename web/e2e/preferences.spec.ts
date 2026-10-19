import { expect, test, type Page } from "@playwright/test";

import { withoutWebGL } from "./helpers";

// Reading preferences and the interface language belong to this browser.
// They are set in Settings, in the header's panel on wide screens or in the
// menu on phones, applied before the first paint, and never change the texts:
// scripture, translations and replies stay exactly as they are.

const VERSE = "/scripture/bhagavad-gita/2/47";
const html = (page: Page) => page.locator("html");
const card = (page: Page) => page.getByRole("article", { name: "Bhagavad Gita 2.47" }).first();
const fontSize = (page: Page) =>
  card(page)
    .locator("blockquote")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

/** The language and reading controls: the header's panel on wide screens, the menu on phones. */
async function openPreferences(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: /^(Menu|मेनू)$/ }).click();
    return page.getByRole("navigation", { name: /^(Main|मुख्य)/ });
  }
  await page.getByRole("button", { name: /Reading and language|पढ़ने और भाषा की सेटिंग/ }).click();
  return page.locator("[popover]:popover-open");
}

test("text size, Sanskrit and transliteration are chosen once, kept, and restored", async ({ page }) => {
  await page.goto(VERSE);
  const standard = await fontSize(page);
  await expect(card(page).locator("[lang=sa]")).toBeVisible();

  await page.goto("/settings");
  const reading = page.getByRole("region", { name: "Reading" });
  const restore = reading.getByRole("button", { name: "Restore defaults" });
  await expect(restore).toBeDisabled();
  await reading.getByText("Larger", { exact: true }).click();
  await reading.getByText("Sanskrit", { exact: true }).click();
  await expect(reading.getByRole("switch", { name: "Sanskrit" })).not.toBeChecked();
  await expect(html(page)).toHaveAttribute("data-text-size", "xl");
  await expect(html(page)).toHaveAttribute("data-hide-sanskrit", "");

  // Another page, loaded afresh, has them from its first paint.
  await page.goto(VERSE);
  await expect(html(page)).toHaveAttribute("data-text-size", "xl");
  expect(await fontSize(page)).toBeGreaterThan(standard * 1.15);
  await expect(card(page).locator("[lang=sa]")).toBeHidden();
  await expect(card(page).locator("[lang=sa-Latn]")).toBeVisible();
  // The text itself is untouched.
  const { passage } = await (await page.request.get("/api/passages/bg.2.47")).json();
  expect((await card(page).locator("blockquote").textContent())?.trim()).toBe(passage.translation.trim());

  await page.goto("/settings");
  await restore.click();
  await expect(html(page)).not.toHaveAttribute("data-text-size", /.+/);
  await expect(html(page)).not.toHaveAttribute("data-hide-sanskrit", /.*/);
  await expect(restore).toBeDisabled();
  await page.goto(VERSE);
  await expect(card(page).locator("[lang=sa]")).toBeVisible();
  expect(await fontSize(page)).toBe(standard);
});

test("the interface switches to Hindi and back, keeping what you typed", async ({ page, isMobile }) => {
  await page.goto("/");
  const draft = "Exams next week, और ध्यान नहीं लग रहा।";
  await page.getByLabel("Describe your situation").fill(draft);

  let panel = await openPreferences(page, isMobile);
  await panel.getByText("हिन्दी", { exact: true }).click();
  await expect(html(page)).toHaveAttribute("data-locale", "hi");
  await page.keyboard.press("Escape");

  // The labels change; what you typed, and where you were, do not.
  await expect(page.getByRole("heading", { level: 1, name: "प्राचीन ज्ञान। आपका जीवन, आज।" })).toBeVisible();
  const box = page.getByLabel("अपनी परिस्थिति बताइए");
  await expect(box).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "विचार करें" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  // Hindi labels are marked as Hindi, so they are read in a Hindi voice.
  await expect(page.getByRole("heading", { level: 1 }).locator("[lang=hi]")).toBeVisible();

  // Scripture is never translated: the day's passages are as printed.
  const leaf = page.locator("#teachings article[data-passage]").first();
  const id = await leaf.getAttribute("data-passage");
  const { passage } = await (await page.request.get(`/api/passages/${id}`)).json();
  expect((await leaf.locator("blockquote").textContent())?.trim()).toBe(passage.translation.trim());

  // The choice is kept, from the first paint of the next visit.
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-locale", "hi");
  await expect(page.getByRole("heading", { level: 1, name: "प्राचीन ज्ञान। आपका जीवन, आज।" })).toBeVisible();

  panel = await openPreferences(page, isMobile);
  await panel.getByText("English", { exact: true }).click();
  await expect(html(page)).not.toHaveAttribute("data-locale", /.*/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "Ancient wisdom. Your life, today." })).toBeVisible();
});

test("Ask about this verse fills the question in the interface's language", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("sw.locale", "hi"));
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("link", { name: /इस श्लोक के बारे में पूछें/ }).first().click();
  await expect(page.getByLabel("अपनी परिस्थिति बताइए")).toHaveValue(
    "Bhagavad Gita 2.47 मेरी परिस्थिति पर कैसे लागू हो सकता है? मेरी स्थिति यह है: ",
  );
});

const SCREENS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
];

for (const [locale, language] of [
  ["en", "English"],
  ["hi", "Hindi"],
] as const) {
  test(`the headline keeps each half on one line in ${language}, on every screen`, async ({ page, isMobile }) => {
    test.skip(isMobile, "viewports are set explicitly here");
    // Only the words are measured: the still drawing stands in for the 3D instrument, which would redraw at every size.
    await withoutWebGL(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((value) => window.localStorage.setItem("sw.locale", value), locale);
    await page.goto("/");
    const lines = () =>
      page.locator(`#hero-title [data-locale-text=${locale}]`).evaluate((label) =>
        [...label.querySelectorAll(":scope .block:not(:has(.block))")].map((half) => {
          const range = document.createRange();
          range.selectNodeContents(half);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        }),
      );
    for (const size of SCREENS) {
      await page.setViewportSize(size);
      // Measured once the new size has been laid out: a frame mid-resize can still have the old one.
      await expect.poll(lines, { message: `${locale} at ${size.width}×${size.height}` }).toEqual([1, 1]);
    }
  });
}
