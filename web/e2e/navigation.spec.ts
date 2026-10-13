import { expect, test } from "@playwright/test";

test("the current section is marked in the main navigation", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop navigation");
  await page.goto("/scripture/bhagavad-gita/2");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

test("the mobile menu opens, navigates, and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "small screens only");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "Ask" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Themes" }).click();
  await expect(page).toHaveURL(/\/concepts$/);
  await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");

  // Escape closes it and returns focus to the button.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.keyboard.press("Escape");
  const button = page.getByRole("button", { name: "Menu" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
});
