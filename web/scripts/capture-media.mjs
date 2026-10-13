// Captures the README's screenshots, the link-preview image and the demo
// recording from a running BODH, so they always show the real application.
//
//   make api                      # in one terminal
//   make web                      # in another (or npm run build && npm run start)
//   cd web && node scripts/capture-media.mjs
//
// It writes to ../assets/. BASE_URL points it at another address (default
// http://localhost:3000). The answer it shows is whatever the API returns:
// with LLM_PROVIDER=none, verified passages without AI interpretation.

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium, devices } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ASSETS = fileURLToPath(new URL("../../assets/", import.meta.url));
const SHOTS = `${ASSETS}screenshots/`;
const DEMO = `${ASSETS}demo/`;
const QUESTION = "I keep comparing myself with my friends, and I feel left behind. How do I stop?";

const browser = await chromium.launch();
await Promise.all([SHOTS, DEMO, `${ASSETS}brand/`].map((dir) => mkdir(dir, { recursive: true })));

async function desktop(options = {}) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 }, ...options });
  return { context, page: await context.newPage() };
}

/** Waits for the 3D scene (or, without WebGL, its still drawing) and lets it settle. */
async function sceneReady(page) {
  await page.locator('.stage[data-scene="ready"], .stage[data-scene="fallback"]').waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

async function answer(page) {
  await page
    .getByRole("article", { name: "Question 1" })
    .getByText(/What the Gita offers|Passages only/)
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
}

/** Scrolls smoothly, as a person would, so the recording is easy to follow. */
async function glide(page, to, ms = 1200) {
  await page.evaluate(
    ([target, duration]) =>
      new Promise((resolve) => {
        const from = window.scrollY;
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          window.scrollTo(0, from + (target - from) * eased);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

const top = (page, selector) =>
  page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().top + window.scrollY);

// ----------------------------------------------------------------- Screenshots

{
  const { context, page } = await desktop();

  await page.goto("/");
  await sceneReady(page);
  await page.screenshot({ path: `${SHOTS}01-homepage.png` });

  await page.getByLabel("Describe your situation").fill(QUESTION);
  await page.screenshot({ path: `${SHOTS}02-ask-question.png` });

  await page.getByRole("button", { name: "Reflect" }).click();
  await answer(page);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${SHOTS}03-grounded-answer.png` });

  await page.getByRole("button", { name: "Save this reflection" }).click();
  await page.goto("/reflections");
  await page.getByRole("heading", { level: 2 }).first().waitFor();
  await page.screenshot({ path: `${SHOTS}06-reflections.png` });

  await page.goto("/explore");
  await sceneReady(page);
  await page.screenshot({ path: `${SHOTS}04-explore.png` });

  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}05-scripture-source.png` });

  await page.goto("/settings");
  await page.getByText(/Following your device/).waitFor();
  await page.screenshot({ path: `${SHOTS}07-settings.png` });

  await page.goto("/");
  await sceneReady(page);
  await page.evaluate(() => document.getElementById("themes")?.scrollIntoView({ block: "start" }));
  await page.getByRole("tab", { name: "Hard choices" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}09-themes.png` });

  // The link preview, as the app serves it to social networks (the tag in the server's HTML).
  const preview = new URL((await page.locator('meta[property="og:image"]').first().getAttribute("content")) ?? "");
  const image = await page.request.get(`${preview.pathname}${preview.search}`);
  await writeFile(`${ASSETS}brand/social-preview.png`, await image.body());

  await context.close();
}

{
  const { context, page } = await desktop({ colorScheme: "dark" });
  await page.goto("/");
  await sceneReady(page);
  await page.screenshot({ path: `${SHOTS}10-dark-theme.png` });
  await context.close();
}

// Two phone screens side by side: the invitation, and a verse.
{
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto("/");
  await sceneReady(page);
  const home = await page.screenshot();
  await page.goto("/scripture/bhagavad-gita/2/47");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(500);
  const verse = await page.screenshot();
  await context.close();

  const frame = await browser.newPage({ viewport: { width: 1100, height: 1080 } });
  const img = (png) =>
    `<img src="data:image/png;base64,${png.toString("base64")}" style="width:412px;border-radius:28px;box-shadow:0 24px 60px -20px rgb(22 23 26 / .35),0 0 0 1px rgb(22 23 26 / .08)">`;
  await frame.setContent(
    `<body style="margin:0;height:100vh;display:flex;gap:72px;align-items:center;justify-content:center;background:#f0ede5">${img(home)}${img(verse)}</body>`,
  );
  await frame.screenshot({ path: `${SHOTS}08-mobile.png` });
  await frame.close();
}

// ----------------------------------------------------------------- Recording

{
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: size, recordVideo: { dir: DEMO, size } });
  // A visible pointer, so the recording shows where each click lands.
  await context.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const dot = document.createElement("div");
      dot.id = "demo-pointer";
      dot.style.cssText =
        "position:fixed;z-index:2147483647;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgb(166 81 13 / .35);border:2px solid rgb(166 81 13 / .9);pointer-events:none;transition:transform .15s";
      document.body.append(dot);
      addEventListener("mousemove", (event) => {
        dot.style.left = `${event.clientX}px`;
        dot.style.top = `${event.clientY}px`;
      });
      addEventListener("mousedown", () => (dot.style.transform = "scale(.7)"));
      addEventListener("mouseup", () => (dot.style.transform = ""));
    });
  });
  const page = await context.newPage();
  const video = page.video();

  const pointAt = async (locator) => {
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  };
  const click = async (locator) => {
    await pointAt(locator);
    await page.waitForTimeout(250);
    await locator.click();
  };

  // 1. The invitation, and the story below it.
  await page.goto("/");
  await sceneReady(page);
  await page.waitForTimeout(1500);
  await glide(page, await top(page, "#teachings"), 2600);
  await page.waitForTimeout(2200);
  await glide(page, await top(page, "#themes"), 2200);
  await page.waitForTimeout(800);
  await click(page.getByRole("tab", { name: "Hard choices" }));
  await page.waitForTimeout(1800);
  await glide(page, await top(page, "#understanding"), 2200);
  await page.waitForTimeout(1800);
  await glide(page, (await top(page, "#return")) - 40, 2400);
  await page.waitForTimeout(1500);

  // 2. Back to the question box, and a question.
  await click(page.locator("#return").getByRole("button", { name: "Ask a question" }));
  await page.waitForTimeout(1200);
  await page.getByLabel("Describe your situation").pressSequentially(QUESTION, { delay: 35 });
  await page.waitForTimeout(600);
  await click(page.getByRole("button", { name: "Reflect" }));

  // 3. The answer: passages exactly as printed, with their sources.
  await answer(page);
  await page.waitForTimeout(1500);
  await glide(page, await top(page, 'article[aria-label="Question 1"] article'), 1800);
  await page.waitForTimeout(2500);
  await glide(page, (await page.evaluate(() => window.scrollY)) + 520, 1600);
  await page.waitForTimeout(1500);

  // 4. A passage in its context, and the way back.
  await click(page.getByRole("link", { name: /Context & details/ }).first());
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(2200);
  await glide(page, 520, 1600);
  await page.waitForTimeout(2000);
  await page.goBack();
  await page.waitForTimeout(1500);

  // 5. Saving it, and reading it later.
  await click(page.getByRole("button", { name: "Save" }).first());
  await page.waitForTimeout(1000);
  await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Reflections" }));
  await page.getByRole("heading", { level: 2 }).first().waitFor();
  await page.waitForTimeout(2500);

  // 6. The dark theme, and home again.
  await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }));
  await page.waitForTimeout(1200);
  await click(page.locator("label").filter({ has: page.getByRole("radio", { name: "Dark", exact: true }) }));
  await page.waitForTimeout(1500);
  await click(page.getByRole("banner").getByRole("link", { name: "BODH", exact: true }));
  await sceneReady(page);
  await page.mouse.move(size.width - 1, size.height / 2, { steps: 20 });
  await page.evaluate(() => document.getElementById("demo-pointer")?.remove());
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${DEMO}bodh-demo-poster.png` });

  await context.close();
  await rm(`${DEMO}bodh-demo.webm`, { force: true });
  await rename(await video.path(), `${DEMO}bodh-demo.webm`);
}

await browser.close();
console.log(`Wrote screenshots, the link preview and the demo to ${ASSETS}`);
