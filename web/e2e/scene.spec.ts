import { expect, test, type Page } from "@playwright/test";

// The celestial scene is decorative and must never stand between a person and
// the question box: it loads after the page, has a still fallback, follows the
// conversation, and holds still for people who ask for reduced motion.

const stage = (page: Page) => page.locator(".stage");

async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (this: HTMLCanvasElement, type: string, options?: unknown) {
        if (type.includes("webgl")) return null;
        return (original as (this: HTMLCanvasElement, type: string, options?: unknown) => RenderingContext | null).call(
          this,
          type,
          options,
        );
      },
    });
  });
}

test("without WebGL, a still drawing stands in and asking works as usual", async ({ page }) => {
  await withoutWebGL(page);
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-scene", "fallback");
  await expect(page.locator(".scene-fallback")).toBeVisible();
  await expect(page.locator(".stage canvas")).toHaveCount(0);

  await page.getByLabel("Describe your situation").fill("I keep putting off a difficult decision.");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("article", { name: "Question 1" }).getByText(/What the Gita offers|Passages only/).first()).toBeVisible({ timeout: 45_000 });
});

test("the 3D scene loads after the page and follows the conversation", async ({ page }) => {
  await page.goto("/");
  // The question box is usable straight away, whatever the scene is doing.
  await expect(page.getByLabel("Describe your situation")).toBeEditable();
  await expect(stage(page)).toHaveAttribute("data-mode", "hero");
  await expect(stage(page)).toHaveAttribute("data-scene", "ready", { timeout: 45_000 });
  await expect(page.locator(".stage canvas")).toHaveCount(1);

  // Hold the answer back briefly so the "thinking" state can be seen.
  await page.route("**/api/ask/stream", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.getByLabel("Describe your situation").fill("I feel stuck in my career and don't know what to change.");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(stage(page)).toHaveAttribute("data-mode", "thinking");
  await expect(stage(page)).toHaveAttribute("data-mode", "reading", { timeout: 45_000 });
  await expect(page.getByRole("article", { name: "Question 1" }).getByText(/What the Gita offers|Passages only/).first()).toBeVisible();
});

async function stageFrames(page: Page): Promise<[Buffer, Buffer]> {
  await expect(stage(page)).toHaveAttribute("data-scene", "ready", { timeout: 45_000 });
  await page.waitForTimeout(1200);
  const first = await stage(page).screenshot();
  await page.waitForTimeout(900);
  const second = await stage(page).screenshot();
  return [first, second];
}

test("with reduced motion the scene holds still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-motion", "reduced");
  const [first, second] = await stageFrames(page);
  expect(first.equals(second)).toBe(true);
});

test("without a reduced-motion preference the scene moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-motion", "full");
  const [first, second] = await stageFrames(page);
  expect(first.equals(second)).toBe(false);
});

test("reading pages have no 3D scene", async ({ page }) => {
  for (const path of ["/scripture/bhagavad-gita/2/47", "/concepts", "/reflections", "/about", "/settings"]) {
    await page.goto(path);
    await expect(stage(page), path).toHaveCount(0);
  }
});

test("the scene steps back for a reply to someone at risk", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your situation").fill("I failed again and I don't want to live anymore");
  await page.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("heading", { name: "Please reach out to someone now" })).toBeVisible({ timeout: 15_000 });
  await expect(stage(page)).toHaveAttribute("data-quiet", "true");
  await expect(stage(page)).toHaveCSS("opacity", "0");
});

test("the scene follows the landing story as the page scrolls", async ({ page }) => {
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-scene", "ready", { timeout: 45_000 });
  await expect(stage(page)).toHaveAttribute("data-chapter", "0");
  await page.evaluate(() => document.getElementById("teachings")?.scrollIntoView({ block: "start" }));
  await expect(stage(page)).toHaveAttribute("data-chapter", "1");
  await page.evaluate(() => document.getElementById("return")?.scrollIntoView({ block: "start" }));
  await expect(stage(page)).toHaveAttribute("data-chapter", "4");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(stage(page)).toHaveAttribute("data-chapter", "0");
});

test("nothing is drawn while the page is in a background tab", async ({ page }) => {
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await setVisibility("visible");
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
});

test("with reduced motion the still instrument stays faint behind the middle chapters", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const layer = page.locator(".stage-layer");
  await expect(layer).toHaveCSS("opacity", "1");
  await page.evaluate(() => document.getElementById("understanding")?.scrollIntoView({ block: "start" }));
  await expect
    .poll(async () => Number(await layer.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThanOrEqual(0.15);
});
