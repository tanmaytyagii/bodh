import { expect, test, type Page } from "@playwright/test";

// Appearance: System (the default) follows the device; Light and Dark are
// explicit choices that persist in this browser.

const html = (page: Page) => page.locator("html");
const stored = (page: Page) => page.evaluate(() => window.localStorage.getItem("sw.theme"));
// Click the visible segment that holds the (visually hidden) radio input.
const choose = (page: Page, name: "System" | "Light" | "Dark") =>
  page.locator("label").filter({ has: page.getByRole("radio", { name, exact: true }) }).click();

test("the device setting is followed by default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect(await stored(page)).toBeNull();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/explore");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: /^System/ })).toBeChecked();
  await expect(page.getByText("Following your device, which is set to dark.")).toBeVisible();
});

test("live changes to the device setting are followed while System is selected", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/scripture/bhagavad-gita/2/47");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("an explicit choice persists across reloads and navigation, whatever the device does", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  await choose(page, "Light");
  await expect(page.getByRole("radio", { name: /^Light/ })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect(await stored(page)).toBe("light");

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: /^Light/ })).toBeChecked();

  // Client-side navigation keeps it.
  await page.getByRole("contentinfo").getByRole("link", { name: "Sources & licences" }).click();
  await expect(page).toHaveURL(/\/about#sources$/);
  await expect(html(page)).toHaveAttribute("data-theme", "light");

  // So does a full page load, and the device changing.
  await page.goto("/concepts");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("choosing System again resumes following the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await choose(page, "Dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Always dark, whatever your device is set to.")).toBeVisible();

  await choose(page, "System");
  await expect(page.getByRole("radio", { name: /^System/ })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect(await stored(page)).toBe("system");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("a choice made in another tab is picked up", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.emulateMedia({ colorScheme: "light" });
  await second.emulateMedia({ colorScheme: "light" });
  await first.goto("/settings");
  await second.goto("/explore");
  await choose(first, "Dark");
  await expect(html(second)).toHaveAttribute("data-theme", "dark");
});

test("the saved theme is applied before the first paint, without hydration errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.emulateMedia({ colorScheme: "light" });
  // Saved preference: dark, the opposite of the device. Record when <html>
  // gets its theme: it must happen while <head> is parsed, before <body> exists.
  await page.addInitScript(() => {
    window.localStorage.setItem("sw.theme", "dark");
    const log: { theme: string | null; body: boolean }[] = [];
    Object.assign(window, { __themeLog: log });
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === document.documentElement) {
          log.push({ theme: document.documentElement.getAttribute("data-theme"), body: document.body !== null });
        }
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
  });

  for (const path of ["/", "/explore", "/scripture/bhagavad-gita/2/47", "/concepts", "/settings"]) {
    await page.goto(path);
    const log = await page.evaluate(() => (window as unknown as { __themeLog: unknown[] }).__themeLog);
    expect(log[0], path).toEqual({ theme: "dark", body: false });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background, path).toBe("rgb(15, 16, 18)");
  }
  expect(errors).toEqual([]);
});

test("the theme choice works with the keyboard and is announced", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await page.getByRole("radio", { name: /^System/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^Light/ })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^Dark/ })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
});
