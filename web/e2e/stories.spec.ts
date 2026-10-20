import { expect, test } from "@playwright/test";

// Stories are editorial retellings of narratives in the texts. Each is
// grounded in verbatim excerpts, shown as printed with a link to their source,
// and every reference in the retelling opens the verse it names.

type Passage = { id: string; ref: string; path: string; citation: { url: string; scan_url: string | null } };
type Story = { id: string; title: string; excerpts: Passage[] };

test("Explore lists every story, and each opens with its excerpts and their sources", async ({ page }) => {
  const stories: Story[] = await (await page.request.get("/api/stories")).json();
  expect(stories.length).toBeGreaterThanOrEqual(4);

  await page.goto("/explore");
  const list = page.getByRole("region", { name: "Stories" });
  for (const story of stories) {
    await expect(list.getByRole("link", { name: new RegExp(story.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toHaveAttribute(
      "href",
      `/stories/${story.id}`,
    );
  }

  for (const { id } of stories) {
    const story: Story = await (await page.request.get(`/api/stories/${id}`)).json();
    await page.goto(`/stories/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: story.title })).toBeVisible();
    await expect(page.getByText("Editorial summary")).toBeVisible();
    const excerpts = page.getByRole("region", { name: /The story in the text/ });
    for (const passage of story.excerpts) {
      const card = excerpts.getByRole("article", { name: passage.ref, exact: true });
      await expect(card.getByRole("link", { name: passage.ref, exact: true })).toHaveAttribute("href", passage.path);
      await expect(card.getByRole("link", { name: /Printed page|Source text/ })).toHaveAttribute(
        "href",
        passage.citation.scan_url ?? passage.citation.url,
      );
    }
  }
});

test("a story's references open the verses they name", async ({ page }) => {
  await page.goto("/stories/the-gods-and-the-mystery");
  await expect(page.getByRole("link", { name: "Kena 3.6", exact: true }).first()).toHaveAttribute(
    "href",
    "/scripture/kena-upanishad/3/6",
  );
  await page.goto("/stories/arjuna-at-kurukshetra");
  await expect(page.getByRole("link", { name: "BG 2.7", exact: true }).first()).toHaveAttribute(
    "href",
    "/scripture/bhagavad-gita/2/7",
  );
});

test("a verse in a story leads to the story, and the story back to the verse", async ({ page }) => {
  await page.goto("/scripture/bhagavad-gita/11/12");
  await page.getByRole("link", { name: "The Vision of the Universal Form" }).click();
  await expect(page).toHaveURL(/\/stories\/the-universal-form$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Vision of the Universal Form" })).toBeVisible();
  await page.getByRole("article", { name: "Bhagavad Gita 11.12", exact: true }).getByRole("link", { name: "Bhagavad Gita 11.12", exact: true }).click();
  await expect(page).toHaveURL(/\/scripture\/bhagavad-gita\/11\/12$/);
  await expect(page.getByText("If the splendour of a thousand suns").first()).toBeVisible();
});
