import { expect, test, type Page } from "@playwright/test";

import { BRAND } from "../src/lib/brand";

import { withoutWebGL } from "./helpers";

// The Ask page has two views at one address: the invitation, and the
// conversation (#conversation). These tests ask real questions of the API; on
// a server without a language model the answers are passages only. Requests
// are only ever held back or failed here, never answered with made-up content.
// The API allows 20 questions a minute from one address, so each test asks as
// few as it can and checks several things with each answer.

const QUESTION = "How do I handle uncertainty about my future?";

const invitation = (page: Page) => page.getByRole("heading", { level: 1, name: "Ancient wisdom. Your life, today." });
const questionHeading = (page: Page, text = QUESTION) => page.getByRole("heading", { level: 2, name: `“${text}”` });
const returnLink = (page: Page) => page.getByRole("button", { name: "Return to your conversation" });

async function ask(page: Page, question = QUESTION) {
  await page.getByLabel("Describe your situation").fill(question);
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("article", { name: "Question 1" }).getByText(/What the Gita offers|Passages only/).first()).toBeVisible({ timeout: 45_000 });
}

test("the invitation asks for a question, with nothing from before on it", async ({ page }) => {
  await page.goto("/");
  await expect(invitation(page)).toBeVisible();
  await expect(page.getByLabel("Describe your situation")).toBeEditable();
  await expect(page.getByRole("button", { name: "Reflect" })).toBeVisible();
  await expect(page.getByText("Private — not stored on our server.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Or begin with" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByText("You asked")).toHaveCount(0);
  await expect(returnLink(page)).toHaveCount(0);
});

test("the invitation and an answer stay distinct, through the logo, Ask, back, forward and refresh", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await ask(page);
  await expect(page).toHaveURL(/#conversation$/);
  await expect(questionHeading(page)).toBeVisible();

  // A refresh keeps the answer.
  await page.reload();
  await expect(questionHeading(page)).toBeVisible();

  // The logo opens the invitation, empty, with the answer one step back.
  await page.getByRole("link", { name: BRAND.name, exact: true }).click();
  await expect(invitation(page)).toBeVisible();
  await expect(page).not.toHaveURL(/#conversation/);
  await expect(page.getByLabel("Describe your situation")).toHaveValue("");
  await expect(page.getByText("You asked")).toHaveCount(0);
  await page.goBack();
  await expect(questionHeading(page)).toBeVisible();
  await page.goForward();
  await expect(invitation(page)).toBeVisible();

  // The conversation is offered, not lost.
  await returnLink(page).click();
  await expect(questionHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/#conversation$/);

  // Ask in the navigation does the same as the logo.
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Ask/ }).click();
  await expect(invitation(page)).toBeVisible();

  // New question, from the answer, opens the invitation ready to type.
  await returnLink(page).click();
  await page.getByRole("button", { name: "New question" }).click();
  await expect(invitation(page)).toBeVisible();
  await expect(page.getByLabel("Describe your situation")).toBeFocused();

  // Arriving afresh shows the invitation, and offers the conversation.
  await page.goto("/");
  await expect(invitation(page)).toBeVisible();
  await expect(page.getByText("You asked")).toHaveCount(0);
  await returnLink(page).click();
  await expect(questionHeading(page)).toBeVisible();
});

test("the logo brings back the invitation from another page too, with the conversation offered", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await ask(page);

  // Next.js keeps the Ask page, with its state, while another page is open.
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole("banner").getByRole("link", { name: BRAND.name, exact: true }).click();
  await expect(invitation(page)).toBeVisible();
  await expect(page).not.toHaveURL(/#conversation/);
  await expect(page.getByText("You asked")).toHaveCount(0);

  await returnLink(page).click();
  await expect(questionHeading(page)).toBeVisible();
});

test("while the answer is prepared, progress shows, and stopping returns the question", async ({ page }) => {
  await page.goto("/");
  // Hold the request, so the question stays in progress until it is stopped.
  await page.route("**/api/ask/stream", () => new Promise<void>(() => undefined));
  await page.getByLabel("Describe your situation").fill(QUESTION);
  await page.getByRole("button", { name: "Reflect" }).click();
  const current = page.getByRole("article", { name: "Current question" });
  await expect(current).toHaveAttribute("aria-busy", "true");
  await expect(current.getByRole("list", { name: "Progress" })).toBeVisible();
  await expect(questionHeading(page)).toBeVisible();
  await current.getByRole("button", { name: "Stop" }).click();
  await expect(invitation(page)).toBeVisible();
  await expect(page.getByLabel("Describe your situation")).toHaveValue(QUESTION);
});

test("an error keeps the question, says what happened, and can be tried again", async ({ page }) => {
  await page.goto("/");
  let calls = 0;
  await page.route("**/api/ask/stream", async (route) => {
    calls += 1;
    if (calls === 1) await route.fulfill({ status: 503, body: "" });
    else await route.continue();
  });
  await page.getByLabel("Describe your situation").fill(QUESTION);
  // A double press sends the question once.
  await page.getByRole("button", { name: "Reflect" }).dblclick();
  const problem = page.getByRole("alert").filter({ hasText: "not available right now" });
  await expect(problem).toBeVisible();
  await expect(invitation(page)).toBeVisible();
  await expect(page.getByLabel("Describe your situation")).toHaveValue(QUESTION);
  expect(calls).toBe(1);

  await problem.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("article", { name: "Question 1" }).getByText(/What the Gita offers|Passages only/).first()).toBeVisible({ timeout: 45_000 });
  await expect(questionHeading(page)).toBeVisible();
  expect(calls).toBe(2);
});

test("an answer reads as one column, leads to its sources, survives a theme change, and continues", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await ask(page);

  // A quiet note first, not a coloured panel.
  const note = page.getByRole("note").first();
  await expect(note.getByRole("heading")).toHaveText(
    /Passages only — no AI interpretation|Interpretation written from these passages/,
  );
  expect(await note.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  // The passages, one after another in a single column.
  const passages = page.getByRole("article", { name: "Question 1" }).locator("article");
  const boxes = await passages.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), top: box.top, bottom: box.bottom };
    }),
  );
  expect(boxes.length).toBeGreaterThan(1);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].left).toBe(boxes[0].left);
    expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
  }

  // A passage leads to its verse page, and back returns to the answer.
  const first = passages.first();
  const ref = await first.getAttribute("aria-label");
  await first.getByRole("link", { name: /Context & details/ }).click();
  await expect(page).toHaveURL(/\/scripture\//);
  await expect(page.getByRole("heading", { level: 1, name: ref as string })).toBeVisible();
  await page.goBack();
  await expect(questionHeading(page)).toBeVisible();

  // Following the device into dark mode keeps the answer where it is.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(questionHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/#conversation$/);

  // A follow-up, sent from the keyboard, continues the conversation.
  const followUp = page.getByLabel("Ask a follow-up, challenge an interpretation, or add detail");
  await followUp.fill("What does acting without attachment look like day to day?");
  await followUp.press("ControlOrMeta+Enter");
  await expect(page.getByRole("article", { name: "Question 2" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("You followed up")).toBeVisible();
});

test("an answer fits every screen, with the instrument clear of the reading", async ({ page, isMobile }) => {
  test.skip(isMobile, "viewports are set explicitly here");
  // The still drawing sits exactly where the 3D instrument does, and can be measured.
  await withoutWebGL(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await ask(page);

  for (const size of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 2560, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    // The browser applies the new size's media queries at its next frame.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollTo(0, 0))))),
    );
    const label = `${size.width}×${size.height}`;
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), label).toBeLessThanOrEqual(1);

    const drawing = await page.locator(".scene-fallback").boundingBox();
    const turn = await page.getByRole("article", { name: "Question 1" }).boundingBox();
    expect(drawing && turn, label).toBeTruthy();
    if (!drawing || !turn) return;
    // The instrument fills the middle 90% of its drawing.
    const instrument = {
      left: drawing.x + drawing.width * 0.05,
      bottom: drawing.y + drawing.height * 0.95,
    };
    if (size.width >= 1280) {
      // Beside the reading column.
      expect(instrument.left, label).toBeGreaterThanOrEqual(turn.x + turn.width);
    } else {
      // Above the question.
      expect(instrument.bottom, label).toBeLessThanOrEqual(turn.y + 1);
    }
  }
});
