import { expect, test, type Page } from "@playwright/test";

// Renders a full structured answer without depending on a language model:
// the stream request is intercepted and answered with a test fixture built
// from real passages served by the API. (Test-only; the app never shows
// canned answers.)

async function fixtureAnswer(page: Page) {
  const passage = async (id: string) => (await (await page.request.get(`/api/passages/${id}`)).json()).passage;
  const [p247, p248, p422] = await Promise.all([passage("bg.2.47"), passage("bg.2.48"), passage("bg.4.22")]);
  return {
    id: "fixture-answer",
    kind: "guidance",
    language: "en",
    summary: "TEST FIXTURE in short: keep preparing, and let the outcome go [[bg.2.47]].",
    situation: "TEST FIXTURE. Repeated rejection while friends succeed, which feeds envy and self-doubt [[bg.2.47]].",
    teachings: [
      {
        passage: p247,
        what_it_says: "TEST FIXTURE explanation of the verse.",
        context: "TEST FIXTURE context: Krishna answering Arjuna.",
        interpretation_notes: null,
        why_it_applies: "TEST FIXTURE reason.",
        application: "TEST FIXTURE application, see also [[bg.2.48]].",
        limits: "TEST FIXTURE limits.",
      },
    ],
    path_forward_intro: "TEST FIXTURE introduction to the steps.",
    steps: [
      { title: "TEST step one", detail: "Detail for today.", timeframe: "today" },
      { title: "TEST step two", detail: "Detail for the week.", timeframe: "this_week" },
    ],
    framework: "TEST FIXTURE framework.",
    reflective_question: "TEST FIXTURE reflective question?",
    message: null,
    related: [{ passage: p422, reason: "TEST FIXTURE reason for 4.22." }],
    passages: [p247, p248, p422],
    evidence: "strong",
    evidence_note: null,
    alternative_readings: "TEST FIXTURE alternative reading.",
    suggested_follow_ups: ["TEST follow-up question?"],
    safety: null,
    verification: { checked: true, issues: ["removed citation of bg.99.99, which was not provided"], cited_ids: ["bg.2.47"] },
    generated_by: { provider: "test", model: "fixture" },
    retrieval: { queries: [], concepts: [], evidence: "strong", passage_ids: ["bg.2.47", "bg.4.22"] },
    notice: null,
    timings_ms: {},
  };
}

test("a structured answer renders every section with clear labels", async ({ page }) => {
  await page.goto("/");
  const answer = await fixtureAnswer(page);
  await page.route("**/api/ask/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        `event: status\ndata: {"stage":"understanding"}\n\n` +
        `event: answer\ndata: ${JSON.stringify(answer)}\n\n` +
        `event: done\ndata: {}\n\n`,
    }),
  );

  await page.getByLabel("Describe your situation").fill("I keep failing interviews.");
  await page.getByRole("button", { name: "Reflect" }).click();

  // The answer opens with the model's summary, labelled as interpretation, its citation a link.
  const inShort = page.getByRole("region", { name: "In short" });
  await expect(inShort).toBeVisible();
  await expect(inShort.getByText("TEST FIXTURE in short")).toBeVisible();
  await expect(inShort.getByText("AI interpretation")).toBeVisible();
  await expect(inShort.getByRole("link", { name: "BG 2.47" })).toHaveAttribute("href", "/scripture/bhagavad-gita/2/47");

  await expect(page.getByRole("heading", { name: "1. What the Gita offers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. A path forward" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. To reflect on" })).toBeVisible();

  // Source text and AI interpretation are visibly distinct.
  const verse = page.locator("article[aria-label='Bhagavad Gita 2.47']");
  await expect(verse.getByText("Source text", { exact: true })).toBeVisible();
  await expect(page.getByText("Written by the model from the passage above")).toBeVisible();

  await expect(page.getByText("TEST step two")).toBeVisible();
  await expect(page.getByText("This week")).toBeVisible();
  await expect(page.getByRole("button", { name: "TEST follow-up question?" })).toBeVisible();

  // The rest is folded under Go deeper: nothing is left out, and it is one click away.
  const deeper = page.locator("details").filter({ has: page.locator("summary", { hasText: "Go deeper" }) });
  await expect(deeper.getByRole("heading", { name: "Understanding your situation" })).toBeHidden();
  await deeper.locator("summary").click();
  await expect(deeper.getByRole("heading", { name: "Understanding your situation" })).toBeVisible();
  // Citation markers become links to the cited verse.
  await expect(deeper.getByRole("link", { name: "BG 2.48" })).toHaveAttribute("href", "/scripture/bhagavad-gita/2/48");
  await expect(deeper.getByText("TEST FIXTURE alternative reading.")).toBeVisible();
  await expect(deeper.getByText("1 problem corrected before display")).toBeVisible();

  // Read all the way through, each passage is shown once.
  const shown = await page
    .getByRole("article", { name: "Question 1" })
    .locator("article[aria-label]")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(shown.length).toBeGreaterThan(0);
  expect(new Set(shown).size).toBe(shown.length);
});

test("a follow-up sends the conversation so far, and Start over clears it", async ({ page }) => {
  await page.goto("/");
  const answer = await fixtureAnswer(page);
  const bodies: { question: string; history: { role: string; content: string; passage_ids?: string[] }[] }[] = [];
  await page.route("**/api/ask/stream", async (route) => {
    bodies.push(route.request().postDataJSON());
    const reply =
      bodies.length === 1
        ? answer
        : {
            ...answer,
            id: "fixture-follow-up",
            kind: "follow_up",
            message: "TEST FIXTURE follow-up reply, still about [[bg.2.47]].",
            suggested_follow_ups: [],
          };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: `event: answer\ndata: ${JSON.stringify(reply)}\n\nevent: done\ndata: {}\n\n`,
    });
  });

  await page.getByLabel("Describe your situation").fill("I keep failing interviews.");
  await page.getByRole("button", { name: "Reflect" }).click();
  await page.getByRole("button", { name: "TEST follow-up question?" }).click();

  await expect(page.getByText("TEST FIXTURE follow-up reply")).toBeVisible();
  await expect(page.getByText("You followed up")).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1].question).toBe("TEST follow-up question?");
  expect(bodies[1].history[0]).toMatchObject({ role: "user", content: "I keep failing interviews." });
  expect(bodies[1].history[1].role).toBe("assistant");
  expect(bodies[1].history[1].passage_ids).toContain("bg.2.47");

  // The follow-up's citation links to the verse from the first answer.
  await expect(page.getByRole("link", { name: "BG 2.47" }).last()).toHaveAttribute("href", "/scripture/bhagavad-gita/2/47");

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ancient wisdom. Your life, today." })).toBeVisible();
  await expect(page.getByLabel("Describe your situation")).toHaveValue("");
});

test("a structured answer fits phones and tablets without sideways scrolling", async ({ page, isMobile }) => {
  test.skip(isMobile, "viewports are set explicitly here");
  await page.goto("/");
  const answer = await fixtureAnswer(page);
  await page.route("**/api/ask/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: `event: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`,
    }),
  );
  await page.getByLabel("Describe your situation").fill("I keep failing interviews.");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("heading", { name: "1. What the Gita offers" })).toBeVisible();

  for (const width of [360, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px wide`).toBeLessThanOrEqual(1);
  }
});
