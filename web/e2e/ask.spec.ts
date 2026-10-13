import { expect, test } from "@playwright/test";

const QUESTION =
  "I am preparing for placements. My friends are getting great offers, but I keep failing interviews. " +
  "I feel jealous, anxious, and sometimes think I am not good enough. What should I do?";

test("asking a question returns verified passages and can be saved", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Ancient wisdom. Your life, today." })).toBeVisible();

  const input = page.getByLabel("Describe your situation");
  await input.fill(QUESTION);
  await page.getByRole("button", { name: "Reflect" }).click();

  // With a language model: structured guidance. Without one: passages only,
  // clearly labelled as having no AI interpretation. (Looked for in the answer:
  // the landing page below the question box quotes the same label.)
  await expect(page.getByRole("article", { name: "Question 1" }).getByText(/What the Gita offers|Passages only/).first()).toBeVisible({ timeout: 45_000 });

  const verse = page.locator("article[aria-label^='Bhagavad Gita']").first();
  await expect(verse).toBeVisible();
  await expect(verse.getByText("Source text")).toBeVisible();
  await expect(verse.locator("[lang=sa]").first()).not.toBeEmpty();
  await expect(verse.getByRole("link", { name: /Printed page/ })).toHaveAttribute("href", /wikisource\.org\/wiki\/Page:/);

  await page.getByRole("button", { name: "Save this reflection" }).click();
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  await page.goto("/reflections");
  await expect(page.getByText(QUESTION.slice(0, 40))).toBeVisible();
});

test("a message indicating risk leads with real-world support", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your situation").fill("I failed again and I don't want to live anymore");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("heading", { name: "Please reach out to someone now" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("14416 or 1-800-891-4416")).toBeVisible();
  await expect(page.locator("article[aria-label^='Bhagavad Gita']")).toHaveCount(0);
});

test("example prompts fill the question box", async ({ page }) => {
  let sent = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/ask/stream")) sent += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /How can I act without being controlled by fear/ }).click();
  await expect(page.getByLabel("Describe your situation")).toHaveValue("How can I act without being controlled by fear?");
  await expect(page.getByLabel("Describe your situation")).toBeFocused();
  // Filling is all an example does: nothing is sent until the person chooses to.
  await page.waitForTimeout(500);
  expect(sent).toBe(0);
  await expect(page.getByText("You asked")).toHaveCount(0);
});
