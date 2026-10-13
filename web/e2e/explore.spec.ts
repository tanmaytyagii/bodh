import { expect, test } from "@playwright/test";

test("search finds a half-remembered verse", async ({ page }) => {
  await page.goto("/explore?q=karmanye+vadhikaraste");
  const first = page.locator("article[aria-label^='Bhagavad Gita']").first();
  await expect(first).toHaveAttribute("aria-label", "Bhagavad Gita 2.47");
});

test("a chapter lists every verse with its Sanskrit", async ({ page }) => {
  await page.goto("/scripture/bhagavad-gita/2");
  await expect(page.getByRole("heading", { name: "Yoga by the Sankhya" })).toBeVisible();
  await expect(page.locator("ol > li[id^='v']")).toHaveCount(72);
});

test("a verse page shows text, context, provenance and a working citation", async ({ page }) => {
  await page.goto("/scripture/bhagavad-gita/2/47");
  await expect(page.getByText("Thy business is with the action only").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Surrounding verses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Scan of the printed page ↗" })).toHaveAttribute(
    "href",
    "https://en.wikisource.org/wiki/Page:Bhagavad_Gita_-_Annie_Besant_4th_edition.djvu/45",
  );
  await expect(page.getByText("Cite as:")).toBeVisible();
});

test("unknown verses return 404", async ({ page }) => {
  const response = await page.goto("/scripture/bhagavad-gita/2/99");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page isn’t here" })).toBeVisible();
});

test("themes are labelled as editorial", async ({ page }) => {
  await page.goto("/concepts/equanimity");
  await expect(page.getByText("Editorial theme")).toBeVisible();
  await expect(page.locator("article[aria-label^='Bhagavad Gita']").first()).toBeVisible();
});

test("an Upanishad verse shows its translation, commentary status and story", async ({ page }) => {
  await page.goto("/scripture/katha-upanishad/2/1");
  const verse = page.locator("article[aria-label='Katha Upanishad 1.2.1']");
  await expect(verse.getByText("The good is one thing and the pleasant another")).toBeVisible();
  await expect(verse.getByText("Translation only")).toBeVisible();
  await expect(verse.getByRole("link", { name: "Source text ↗" })).toHaveAttribute("href", /gutenberg\.org.*#id\d+/);
  await page.getByRole("link", { name: "Nachiketas and Death" }).click();
  await expect(page.getByRole("heading", { name: "Nachiketas and Death" })).toBeVisible();
  await expect(page.getByText("Editorial summary")).toBeVisible();
});

test("unknown themes and stories return 404", async ({ page }) => {
  expect((await page.goto("/concepts/no-such-theme"))?.status()).toBe(404);
  expect((await page.goto("/stories/no-such-story"))?.status()).toBe(404);
});

test("every source page names the edition its text comes from", async ({ page }) => {
  for (const source of ["bhagavad-gita", "isha-upanishad", "katha-upanishad", "kena-upanishad"]) {
    await page.goto(`/scripture/${source}`);
    await expect(page.getByRole("heading", { name: "About this edition" })).toBeVisible();
  }
  await expect(page.getByText(/Swami Paramananda/).first()).toBeVisible();
});
