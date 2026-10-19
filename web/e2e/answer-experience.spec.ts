import { expect, test, type Page } from "@playwright/test";

// The answer as it arrives and as it is read: the passages found are shown
// while the reply is written, a passages-only answer says why each passage
// appeared, "Ask about this verse" carries the verse into the question, and
// on a phone the next question stays a tap away. Answers come from the API;
// where a reply is held back, the passages in it are real ones fetched from
// the API, never made up.

const ask = async (page: Page, question: string) => {
  await page.getByLabel("Describe your situation").fill(question);
  await page.getByRole("button", { name: "Reflect" }).click();
};

const turn = (page: Page) => page.getByRole("article", { name: "Question 1" });

test("while the reply is written, the passages it rests on can already be read", async ({ page }) => {
  // The stream sends what it has found, then holds: the reply is still being written.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/ask/stream")) return original(input, init);
      const passages = await Promise.all(
        ["bg.2.47", "bg.2.48"].map(async (id) => (await (await original(`/api/passages/${id}`)).json()).passage),
      );
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          for (const event of [
            `event: status\ndata: {"stage":"retrieving"}\n\n`,
            `event: passages\ndata: ${JSON.stringify({ passages, retrieval: null })}\n\n`,
            `event: status\ndata: {"stage":"writing"}\n\n`,
          ])
            controller.enqueue(encoder.encode(event));
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
  });
  await page.goto("/");
  await ask(page, "I keep worrying about whether my work will succeed.");

  const found = page.getByRole("region", { name: "2 passages found" });
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("The interpretation is being written from these passages")).toBeVisible();
  for (const id of ["bg.2.47", "bg.2.48"]) {
    const { passage } = await (await page.request.get(`/api/passages/${id}`)).json();
    const card = found.getByRole("article", { name: passage.ref });
    await expect(card).toBeVisible();
    // Exactly as stored, and nothing to act on until the answer is in.
    expect((await card.locator("blockquote").textContent())?.trim()).toBe(passage.translation.trim());
    await expect(card.getByRole("button", { name: `Copy ${passage.ref}` })).toHaveCount(0);
  }
  await expect(page.getByRole("region", { name: "In short" })).toHaveCount(0);
});

test("a passages-only answer says why each passage appeared, from what search recorded", async ({ page }) => {
  await page.goto("/");
  await ask(page, "karmanye vadhikaraste");
  const answer = turn(page);
  await expect(answer.getByText("Passages only — no AI interpretation")).toBeVisible({ timeout: 45_000 });

  const verse = answer.getByRole("article", { name: "Bhagavad Gita 2.47" });
  await expect(verse.getByText("Why it appeared:")).toBeVisible();
  await expect(verse.getByText("it matches the Sanskrit you typed")).toBeVisible();
  // A theme it was found through links to the theme.
  await expect(verse.getByRole("link", { name: "Action without attachment to results" })).toHaveAttribute(
    "href",
    "/concepts/action-without-attachment",
  );
  // Every passage gives a reason; none is presented as more authoritative.
  const cards = answer.getByRole("article");
  const count = await cards.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) await expect(cards.nth(i).getByText("Why it appeared:")).toBeVisible();
});

test("Ask about this verse fills the question, and the answer reads that verse", async ({ page }) => {
  const bodies: { question: string; passage_ids?: string[] }[] = [];
  await page.route("**/api/ask/stream", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("link", { name: "Ask about this verse" }).first().click();

  // The question box, filled and ready to finish; nothing has been sent.
  const box = page.getByLabel("Describe your situation");
  await expect(box).toHaveValue("How might Bhagavad Gita 2.47 apply to my situation? Here is what is going on: ");
  await expect(box).toBeFocused();
  await expect(page.getByText("About Bhagavad Gita 2.47")).toBeVisible();
  // The address is clean again: the prefill leaves nothing behind.
  await expect(page).toHaveURL(/\/$/);
  expect(bodies).toHaveLength(0);

  await box.press("End");
  await box.pressSequentially("I worry about results at work.");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(turn(page).getByText("Passages only — no AI interpretation")).toBeVisible({ timeout: 45_000 });
  expect(bodies).toHaveLength(1);
  expect(bodies[0].passage_ids).toEqual(["bg.2.47"]);
  await expect(turn(page).getByRole("article", { name: "Bhagavad Gita 2.47" }).getByText("you asked about this passage")).toBeVisible();
  // Answered, the question is no longer "about" the verse.
  await expect(page.getByText("About Bhagavad Gita 2.47")).toHaveCount(0);
});

test("the passage a question is about can be taken off it before sending", async ({ page }) => {
  const bodies: { passage_ids?: string[] }[] = [];
  await page.route("**/api/ask/stream", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("link", { name: "Ask about this verse" }).first().click();
  await page.getByRole("button", { name: "Remove “Bhagavad Gita 2.47” from the question" }).click();
  await expect(page.getByText("About Bhagavad Gita 2.47")).toHaveCount(0);
  await page.getByLabel("Describe your situation").fill("How do I stop worrying about outcomes?");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(turn(page).getByText("Passages only — no AI interpretation")).toBeVisible({ timeout: 45_000 });
  expect(bodies[0].passage_ids ?? []).toEqual([]);
});

test("a reply to someone at risk leads with support, and gives no summary", async ({ page }) => {
  await page.goto("/");
  await ask(page, "I don't want to live anymore");
  await expect(page.getByRole("heading", { name: "Please reach out to someone now" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "In short" })).toHaveCount(0);
  await expect(page.locator("button", { hasText: "Ask a follow-up" })).toHaveCount(0);
});

test("on a phone, a follow-up stays a tap away while reading", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the dock is for phones");
  await page.goto("/");
  await ask(page, "How do I handle uncertainty about my future?");
  await expect(turn(page).getByText("Passages only — no AI interpretation")).toBeVisible({ timeout: 45_000 });

  // Hidden, the dock is transparent and inert, so it is out of reach of pointers and assistive technology.
  const dock = page.locator("button", { hasText: "Ask a follow-up" });
  const shown = (yes: boolean) => expect(dock.locator("xpath=..")).toHaveCSS("opacity", yes ? "1" : "0");
  // Not at the top of the answer…
  await shown(false);
  await expect(dock.locator("xpath=..")).toHaveAttribute("inert", "");
  // …but once reading is under way.
  await turn(page).getByRole("article").nth(1).scrollIntoViewIfNeeded();
  await shown(true);
  await expect(dock).toBeInViewport();
  await dock.click();
  const followUp = page.getByLabel("Ask a follow-up, challenge an interpretation, or add detail");
  await expect(followUp).toBeFocused();
  await expect(followUp).toBeInViewport();
  // While typing, it steps aside.
  await shown(false);
});
