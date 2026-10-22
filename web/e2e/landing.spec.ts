import { expect, test, type Page } from "@playwright/test";

// The landing page is a story in five chapters. Its content is real: passages
// come from the corpus as printed, and every control leads somewhere that works.

const scrollTo = (page: Page, id: string) =>
  page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ block: "start" }), id);

test("the landing page tells its story in five chapters", async ({ page }) => {
  await page.goto("/");
  const headings = [
    page.getByRole("heading", { level: 1, name: "Ancient wisdom. Your life, today." }),
    page.getByRole("heading", { level: 2, name: "Read the words themselves." }),
    page.getByRole("heading", { level: 2, name: "Find your way in." }),
    page.getByRole("heading", { level: 2, name: "From reflection to understanding." }),
    page.getByRole("heading", { level: 2, name: "What would you like to understand?" }),
  ];
  let previous = -Infinity;
  for (const heading of headings) {
    await expect(heading).toBeVisible();
    const top = await heading.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    expect(top).toBeGreaterThan(previous);
    previous = top;
  }
});

test("the chapter rail shows where you are, and takes you to a chapter", async ({ page, isMobile }) => {
  test.skip(isMobile, "the rail is shown on large screens");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Chapters" });
  await expect(rail.getByRole("link", { name: /Invitation/ })).toHaveAttribute("aria-current", "step");
  await scrollTo(page, "themes");
  await expect(rail.getByRole("link", { name: /Themes/ })).toHaveAttribute("aria-current", "step");
  await expect(rail.getByRole("link", { name: /Invitation/ })).not.toHaveAttribute("aria-current", "step");
  await rail.getByRole("link", { name: /Understanding/ }).click();
  await expect(page).toHaveURL(/#understanding$/);
  await expect(rail.getByRole("link", { name: /Understanding/ })).toHaveAttribute("aria-current", "step");
});

test("the teachings are passages from the corpus, exactly as stored", async ({ page }) => {
  await page.goto("/");
  const leaves = page.locator("#teachings article[data-passage]");
  await expect(leaves).toHaveCount(3);
  for (const leaf of await leaves.all()) {
    const id = await leaf.getAttribute("data-passage");
    const { passage } = await (await page.request.get(`/api/passages/${id}`)).json();
    await expect(leaf).toHaveAttribute("aria-label", passage.ref);
    expect((await leaf.locator("blockquote").textContent())?.trim()).toBe(passage.translation.trim());
    // The label, not the citation link, which also reads "Source text" when there is no printed page.
    await expect(leaf.getByText("Source text", { exact: true }).and(leaf.locator(":not(a *)"))).toBeVisible();
    if (passage.sanskrit) await expect(leaf.locator("[lang=sa]")).not.toBeEmpty();
    await expect(leaf.getByRole("link", { name: /Printed page|Source text/ })).toHaveAttribute(
      "href",
      passage.citation.scan_url ?? passage.citation.url,
    );
    await expect(leaf.getByRole("link", { name: passage.ref })).toHaveAttribute("href", passage.path);
  }
});

test("choosing a path shows its themes, by pointer or keyboard", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Paths" });
  const panel = page.locator("#themes").getByRole("tabpanel");
  await tabs.getByRole("tab", { name: "Hard choices" }).click();
  await expect(tabs.getByRole("tab", { name: "Hard choices" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("heading", { name: "Hard choices" })).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(tabs.getByRole("tab", { name: "Self and character" })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "Self and character" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("heading", { name: "Self and character" })).toBeVisible();

  // Every theme it lists is a real page.
  const first = panel.getByRole("link").first();
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/concepts\/[a-z-]+$/);
  expect((await page.request.get(href as string)).status()).toBe(200);
});

test("the method is told step by step, with the step in view marked", async ({ page, isMobile }) => {
  test.skip(isMobile, "the step list is shown on large screens");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.getElementById("step-examine")?.scrollIntoView({ block: "center" }));
  const steps = page.getByRole("navigation", { name: "Steps" });
  await expect(steps.getByRole("link", { name: /Examine their context and source/ })).toHaveAttribute("aria-current", "step");
});

test("the last chapter returns you to the question box", async ({ page }) => {
  await page.goto("/");
  await scrollTo(page, "return");
  await page.locator("#return").getByRole("button", { name: "Ask a question" }).click();
  const input = page.getByLabel("Describe your situation");
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
});

test("content moves into place with the scroll, and holds still for reduced motion", async ({ page }) => {
  // With motion, a passage below the screen waits slightly lower down until it scrolls into view.
  await page.goto("/");
  const leaf = page.locator("#teachings article[data-passage]").first();
  await expect(leaf).not.toHaveCSS("transform", "none");
  await page.evaluate(() => document.getElementById("teachings")?.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
  await expect(leaf).toHaveCSS("transform", "none");

  // With reduced motion, nothing is ever displaced.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#teachings article[data-passage]").first()).toHaveCSS("transform", "none");
});
