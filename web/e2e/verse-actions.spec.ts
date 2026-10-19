import { expect, test, type Page } from "@playwright/test";

import { BRAND } from "../src/lib/brand";

// The same actions under every passage: copy it with its source, share it,
// save it once, and ask about it. On a verse's page the arrow keys move
// between verses. Themes and stories cite their verses as chips and can
// start a question too.

const VERSE = "/scripture/bhagavad-gita/2/47";
const REF = "Bhagavad Gita 2.47";

test("a verse is copied with its translator, its source and a link to it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { passage } = await (await page.request.get("/api/passages/bg.2.47")).json();
  await page.goto(VERSE);
  await page.getByRole("button", { name: `Copy ${REF}` }).click();
  await expect(page.getByRole("button", { name: `Copied ${REF}` })).toBeVisible();

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.startsWith(REF)).toBe(true);
  expect(text).toContain(passage.translation);
  expect(text).toContain(`Translated by ${passage.translator}`);
  expect(text).toContain(passage.citation.label);
  expect(text.trimEnd()).toMatch(/\/scripture\/bhagavad-gita\/2\/47$/);
});

test("a verse is saved to your reflections once, and opens from there", async ({ page }) => {
  await page.goto(VERSE);
  await page.getByRole("button", { name: `Save ${REF}` }).click();
  const saved = page.getByRole("link", { name: `${REF} is saved` });
  await expect(saved).toBeVisible();
  // Once saved, there is nothing to save again.
  await expect(page.getByRole("button", { name: `Save ${REF}` })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sw.reflections.v1") ?? "[]"));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ kind: "passage", id: "passage:bg.2.47", passage: { id: "bg.2.47" } });

  await saved.click();
  await expect(page).toHaveURL(/\/reflections$/);
  const item = page.getByRole("article", { name: REF });
  await expect(item.getByRole("heading", { name: REF })).toBeVisible();
  await expect(item.getByText("Source text", { exact: true })).toBeVisible();
  await expect(item.getByRole("link", { name: `${REF} is saved` })).toBeVisible();
});

test("without a share sheet, a verse is shared as an image or a link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
  await page.goto(VERSE);
  await page.getByRole("button", { name: `Share ${REF}` }).click();

  const dialog = page.getByRole("dialog", { name: `Share ${REF}` });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole("img", { name: `${REF}, as an image to share` });
  await expect(image).toBeVisible();
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(500);
  // Nothing is offered that the browser cannot do.
  await expect(dialog.getByRole("button", { name: "Share link" })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toBe(`${BRAND.slug}-bg.2.47.png`);

  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/scripture\/bhagavad-gita\/2\/47$/);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

/** Presses a key until the address shows the page it leads to: a page answers keys only once it is interactive. */
async function pressUntil(page: Page, key: string, path: string) {
  await expect(async () => {
    if (new URL(page.url()).pathname !== path) await page.keyboard.press(key);
    expect(new URL(page.url()).pathname).toBe(path);
  }).toPass({ intervals: [500, 1_000, 1_000], timeout: 15_000 });
}

test("← and → open the previous and next verse, but never while typing or with a modifier", async ({ page }) => {
  const path = () => new URL(page.url()).pathname;
  await page.goto(VERSE);
  await pressUntil(page, "ArrowRight", "/scripture/bhagavad-gita/2/48");
  await expect(page.getByRole("heading", { level: 1, name: "Bhagavad Gita 2.48" })).toBeVisible();
  await pressUntil(page, "ArrowLeft", VERSE);
  await expect(page.getByRole("heading", { level: 1, name: REF })).toBeVisible();

  // A modifier leaves the key to the browser, and a field keeps its arrows.
  await page.keyboard.press("Shift+ArrowRight");
  await page.evaluate(() => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "probe");
    document.querySelector("main")?.append(field);
    field.focus();
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  expect(path()).toBe(VERSE);

  // At the first verse there is nothing before it.
  await page.goto("/scripture/bhagavad-gita/1/2");
  await pressUntil(page, "ArrowLeft", "/scripture/bhagavad-gita/1/1");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(500);
  expect(path()).toBe("/scripture/bhagavad-gita/1/1");
});

test("a theme cites its verses as chips, and a question can start from it", async ({ page }) => {
  await page.goto("/concepts/action-without-attachment");
  // The summary's references are chips that open the verse.
  await expect(page.getByRole("link", { name: "BG 2.48", exact: true }).first()).toHaveAttribute(
    "href",
    "/scripture/bhagavad-gita/2/48",
  );
  await page.getByRole("link", { name: "Ask about this", exact: true }).click();
  const box = page.getByLabel("Describe your situation");
  await expect(box).toHaveValue(/^I am facing something like “Action without attachment to results”\. .* Here is what is going on: $/);
  await expect(page.getByText("About Action without attachment to results")).toBeVisible();
});

test("a story can start a question about itself", async ({ page }) => {
  await page.goto("/stories/nachiketas-and-death");
  await page.getByRole("link", { name: "Ask about this story" }).click();
  await expect(page.getByLabel("Describe your situation")).toHaveValue(
    "What could the story of Nachiketas and Death teach me about my situation? Here is what is going on: ",
  );
  await expect(page.getByText("About Nachiketas and Death")).toBeVisible();
});
