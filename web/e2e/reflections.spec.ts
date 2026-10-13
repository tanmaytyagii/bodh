import { expect, test, type Page } from "@playwright/test";

// Saved reflections live in this browser. Deleting asks first, in a dialog,
// and says what happened.

async function saveOne(page: Page, question: string) {
  await page.goto("/");
  await page.getByLabel("Describe your situation").fill(question);
  await page.getByRole("button", { name: "Reflect" }).click();
  await page.getByRole("button", { name: "Save this reflection" }).click();
  await expect(page.getByText("Saved in this browser")).toBeVisible();
}

test("a saved reflection can be deleted, after confirming", async ({ page }) => {
  const question = "I keep postponing a difficult conversation with my brother.";
  await saveOne(page, question);
  await page.goto("/reflections");
  await expect(page.getByRole("heading", { name: question })).toBeVisible();

  // Cancelling keeps it.
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this reflection?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();

  // Confirming removes it, and the page says so.
  await page.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("sw.reflections.v1"))).toBe("[]");
});

test("all saved reflections can be deleted from Settings", async ({ page }) => {
  await saveOne(page, "My exams are next week and I cannot focus at all.");
  await page.goto("/settings");
  await expect(page.getByText("1 reflection is saved in this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Delete all" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete all saved reflections?" });
  await dialog.getByRole("button", { name: "Delete all" }).click();
  await expect(page.getByText("Deleted 1 saved reflection.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete all" })).toBeDisabled();
  await page.goto("/reflections");
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
});
