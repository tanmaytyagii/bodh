import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

// Reflections leave this browser only as a file you export, and come back
// only through a preview you confirm. Nothing already here is overwritten,
// nothing is added twice, an import can be undone, and a file is read as
// data: never run, never shown as markup, never shown as scripture unless it
// is a passage the file describes completely.

const STORE = "sw.reflections.v1";
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]") as { id: string }[], STORE);
const clear = (page: Page) => page.evaluate((key) => window.localStorage.removeItem(key), STORE);
const fileInput = (page: Page) => page.locator('input[type="file"]');
const file = (name: string, text: string, mimeType = "text/markdown") => ({ name, mimeType, buffer: Buffer.from(text) });

async function saveAnswer(page: Page, question: string) {
  await page.goto("/");
  await page.getByLabel("Describe your situation").fill(question);
  await page.getByRole("button", { name: "Reflect" }).click();
  await page.getByRole("button", { name: "Save this reflection" }).click();
  await expect(page.getByText("Saved in this browser")).toBeVisible();
}

test("an export comes back in full and only once, and an import can be undone", async ({ page }) => {
  const question = "I keep comparing myself with my friends at work.";
  await saveAnswer(page, question);
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("button", { name: "Save Bhagavad Gita 2.47" }).click();

  await page.goto("/reflections");
  const notes = page.getByLabel("Your notes").first();
  await notes.fill("Notes survive -- even with --> in them.");
  await notes.blur();
  const before = await stored(page);
  expect(before).toHaveLength(2);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all" }).click();
  const exported = (await (await download).path()) as string;
  const text = await readFile(exported, "utf8");
  // Readable as a document, with the data to bring it back at its end.
  expect(text).toContain(question);
  expect(text).toContain("<!-- bodh-reflections-data");

  // Into an empty browser: a preview first, then everything exactly as it was.
  await clear(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  await fileInput(page).setInputFiles(exported);
  const preview = page.getByRole("dialog", { name: "Add 2 to your reflections?" });
  // Focus starts on the safe choice.
  await expect(preview.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(preview.getByText("Answers: 1")).toBeVisible();
  await expect(preview.getByText("Passages: 1")).toBeVisible();
  expect(await stored(page)).toHaveLength(0);
  await preview.getByRole("button", { name: "Add 2" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Added 2 to your reflections.");
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
  await expect(page.getByRole("article", { name: "Bhagavad Gita 2.47" })).toBeVisible();
  expect(await stored(page)).toEqual(before);

  // The same file again adds nothing, and changes nothing.
  await fileInput(page).setInputFiles(exported);
  const again = page.getByRole("dialog", { name: "Nothing new to add" });
  await expect(again.getByText("Already here, left as they are: 2")).toBeVisible();
  await expect(again.getByRole("button", { name: "Add 0" })).toBeDisabled();
  await again.getByRole("button", { name: "Cancel" }).click();
  expect(await stored(page)).toEqual(before);

  // An import can be taken back straight away.
  await clear(page);
  await page.reload();
  await fileInput(page).setInputFiles(exported);
  await page.getByRole("dialog").getByRole("button", { name: "Add 2" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("The import was undone.")).toBeVisible();
  expect(await stored(page)).toHaveLength(0);
});

test("an older Markdown export comes back as text, never as markup or scripture", async ({ page }) => {
  // The format exports had before they carried their data.
  const legacy = [
    "# Reflection - 3/14/2026",
    "",
    "> How do I stop worrying about results?",
    "",
    "## Bhagavad Gita 2.47",
    "",
    "> Thy business is with the action only, never with its fruits.",
    "",
    '**What it says:** <img src="x" onerror="window.__ran = true"> Focus on the work.',
    "",
    "## My notes",
    "",
    "Remember this before exams.",
    "",
    "---",
    "Saved from BODH. AI-assisted reflection grounded in the passages cited above. Not religious or professional advice.",
  ].join("\n");
  await page.goto("/reflections");
  await fileInput(page).setInputFiles(file("bodh-reflections.md", legacy));
  const preview = page.getByRole("dialog", { name: "Add 1 to your reflections?" });
  await expect(preview.getByText("Reflections kept as text: 1")).toBeVisible();
  await expect(preview.getByText("This file comes from an older export")).toBeVisible();
  await preview.getByRole("button", { name: "Add 1" }).click();

  const item = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "How do I stop worrying about results?" }) });
  await expect(item.getByText("Imported text")).toBeVisible();
  await expect(item.getByLabel("Your notes")).toHaveValue("Remember this before exams.");
  // Its passages are not presented as source text.
  await expect(item.getByText("Source text", { exact: true })).toHaveCount(0);
  await item.getByRole("button", { name: "Show text" }).click();
  await expect(item.getByText('<img src="x" onerror="window.__ran = true">', { exact: false })).toBeVisible();
  await expect(item.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __ran?: boolean }).__ran)).toBeUndefined();

  // Imported twice, it is still there once.
  await fileInput(page).setInputFiles(file("bodh-reflections.md", legacy));
  await expect(page.getByRole("dialog", { name: "Nothing new to add" })).toBeVisible();
});

test("files that are not exports, or are tampered with, are refused or left out", async ({ page }) => {
  await page.goto("/reflections");
  // (Next.js announces route changes in an alert of its own, outside main.)
  const alert = page.getByRole("main").getByRole("alert");
  const says = (text: string) => expect(alert).toHaveText(text, { useInnerText: true });

  await fileInput(page).setInputFiles(file("empty.md", ""));
  await says("That file is empty.");
  await fileInput(page).setInputFiles(file("notes.txt", "Just some notes I wrote.", "text/plain"));
  await says("That file isn’t a reflections export from this site.");
  await fileInput(page).setInputFiles(file("broken.md", "# Reflections\n\n<!-- bodh-reflections-data\n{not json\n-->"));
  await says("That file couldn’t be read. It may be damaged.");
  await fileInput(page).setInputFiles(
    file("future.json", JSON.stringify({ format: "bodh-reflections", version: 99, items: [] }), "application/json"),
  );
  await says("That export was made by a newer version of this site, so it can’t be read here yet.");

  // A passage made to point somewhere else is not valid, and is left out.
  const { passage } = await (await page.request.get("/api/passages/bg.2.47")).json();
  const tampered = {
    format: "bodh-reflections",
    version: 1,
    items: [
      { kind: "passage", id: "passage:bg.2.47", savedAt: "2026-03-14T10:00:00.000Z", note: "", passage },
      {
        kind: "passage",
        id: "passage:bg.2.48",
        savedAt: "2026-03-14T10:00:00.000Z",
        note: "",
        passage: { ...passage, id: "bg.2.48", path: "javascript:alert(1)" },
      },
    ],
  };
  await fileInput(page).setInputFiles(file("tampered.json", JSON.stringify(tampered), "application/json"));
  const preview = page.getByRole("dialog", { name: "Add 1 to your reflections?" });
  await expect(preview.getByText("Not valid, left out: 1")).toBeVisible();
  await preview.getByRole("button", { name: "Add 1" }).click();
  expect((await stored(page)).map((item) => item.id)).toEqual(["passage:bg.2.47"]);
});
