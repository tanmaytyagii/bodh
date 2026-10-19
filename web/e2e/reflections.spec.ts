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

/** Fills this site's storage to within a few characters of the browser's quota. */
async function fillStorage(page: Page) {
  await page.evaluate(() => {
    let low = 0;
    let high = 64 * 1024 * 1024;
    while (high - low > 256) {
      const middle = Math.floor((low + high) / 2);
      try {
        window.localStorage.setItem("test-filler", "x".repeat(middle));
        low = middle;
      } catch {
        high = middle;
      }
    }
    window.localStorage.setItem("test-filler", "x".repeat(Math.max(0, low - 200)));
  });
}

const storedItems = (page: Page) =>
  page.evaluate(() => JSON.parse(window.localStorage.getItem("sw.reflections.v1") ?? "[]") as { id: string; note: string }[]);

test("when this browser will not store more, nothing is shown as saved that a reload would lose", async ({ page }) => {
  const { passage } = await (await page.request.get("/api/passages/bg.2.47")).json();

  // A verse saved while there is room, to write a note on.
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("button", { name: "Save Bhagavad Gita 2.47" }).click();
  await page.goto("/reflections");
  await fillStorage(page);

  // A note: kept in its box, and the page says it was not saved.
  const note = page.getByLabel("Your notes");
  await note.fill("A long note. ".repeat(400));
  await note.blur();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your note wasn’t saved");
  await expect(note).toHaveValue(/^A long note\./);
  expect((await storedItems(page))[0].note).toBe("");

  // An import: nothing added, and it says why.
  const exported = {
    format: "bodh-reflections",
    version: 1,
    items: [{ kind: "passage", id: "passage:bg.2.48", savedAt: "2026-03-14T10:00:00.000Z", note: "", passage: { ...passage, id: "bg.2.48", path: "/scripture/bhagavad-gita/2/48" } }],
  };
  await page.locator('input[type="file"]').setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await page.getByRole("dialog").getByRole("button", { name: "Add 1" }).click();
  await expect(page.getByText("Nothing was added: this browser’s storage for this site is full or turned off.")).toBeVisible();
  expect((await storedItems(page)).map((item) => item.id)).toEqual(["passage:bg.2.47"]);

  // Saving a verse: still a Save button, and an alert saying it was not saved.
  await page.goto("/scripture/bhagavad-gita/2/48");
  await page.getByRole("button", { name: "Save Bhagavad Gita 2.48" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Not saved: this browser’s storage");
  await expect(page.getByRole("button", { name: "Save Bhagavad Gita 2.48" })).toBeVisible();

  // Saving an answer: the button says so, and can be pressed again.
  await page.goto("/");
  await page.getByLabel("Describe your situation").fill("I keep doubting every choice I make at work.");
  await page.getByRole("button", { name: "Reflect" }).click();
  const save = page.getByRole("button", { name: "Save this reflection" });
  await save.click();
  await expect(save).toContainText("Not saved");
  await expect(page.getByText("Saved in this browser")).toHaveCount(0);

  // What the page showed is what was kept.
  await page.goto("/reflections");
  expect((await storedItems(page)).map((item) => item.id)).toEqual(["passage:bg.2.47"]);
  await expect(page.getByRole("article")).toHaveCount(1);
});
