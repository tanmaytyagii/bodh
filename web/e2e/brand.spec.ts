import { expect, test, type Page } from "@playwright/test";

import { BRAND, DEFAULT_TITLE } from "../src/lib/brand";

// The product is BODH everywhere: in the navigation and the footer, in every
// page title and link preview, and in the icons. It has one slogan, the
// invitation's headline, repeated only by the footer; and one supporting line,
// at the close of the landing story and on About. Earlier lines are retired.

const RETIRED = ["Ancient Wisdom. Clearer Living.", "From knowledge to understanding"];

const ROUTES: [path: string, title: string][] = [
  ["/", DEFAULT_TITLE],
  ["/explore", `Explore the texts · ${BRAND.name}`],
  ["/concepts", `Themes · ${BRAND.name}`],
  ["/reflections", `Your reflections · ${BRAND.name}`],
  ["/about", `About · ${BRAND.name}`],
  ["/settings", `Settings · ${BRAND.name}`],
  ["/scripture/bhagavad-gita/2/47", `Bhagavad Gita 2.47 · ${BRAND.name}`],
];

const meta = (page: Page, key: string) =>
  page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");

test("every page names the product in its title, its header and its link preview", async ({ page }) => {
  for (const [path, title] of ROUTES) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
    // The wordmark links to Ask; its accessible name is the name alone.
    await expect(page.getByRole("banner").getByRole("link", { name: BRAND.name, exact: true }), path).toBeVisible();
    expect(await meta(page, "og:site_name"), path).toBe(BRAND.name);
    expect(await meta(page, "og:title"), path).toBe(title);
    expect(await meta(page, "description"), path).toBeTruthy();
    expect(await meta(page, "twitter:card"), path).toBe("summary_large_image");
    await expect(page.locator("body"), path).not.toContainText("Scriptural Wisdom");
  }
});

test("the name in Devanagari is marked as Hindi, beside the name", async ({ page }) => {
  test.skip(!BRAND.devanagari, "shown only with the default name");
  await page.goto("/about");
  // Inside the wordmark: every interface label also carries a hidden Hindi twin.
  const native = page.getByRole("banner").getByRole("link", { name: BRAND.name, exact: true }).locator("[lang=hi]");
  await expect(native).toHaveText(BRAND.devanagari as string);
  await expect(native).toBeVisible();
  // It says what the name means.
  const header = page.locator("main header").first();
  await expect(header.getByText(/means understanding/)).toBeVisible();
  await expect(header.getByText(BRAND.philosophy)).toBeVisible();
});

test("the slogan is the invitation's headline and the footer's line, and nothing older survives", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: BRAND.tagline })).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText(BRAND.name, { exact: true })).toBeVisible();
  await expect(footer.getByText(BRAND.tagline)).toBeVisible();
  for (const path of ["/", "/about"]) {
    await page.goto(path);
    for (const line of RETIRED) await expect(page.locator("body"), `${path}: ${line}`).not.toContainText(line);
  }
});

test("the landing story carries the name: in the understanding chapter, and at its close", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#invitation").getByText(`${BRAND.name} helps you explore`)).toBeVisible();
  if (BRAND.devanagari) {
    const name = page.locator("#understanding").getByText(BRAND.devanagari, { exact: true });
    await expect(name).toHaveAttribute("lang", "hi");
    await expect(name).toBeVisible();
  }
  await expect(page.locator("#return").getByText(BRAND.philosophy)).toBeAttached();
});

test("the icons and the link preview image load", async ({ page, request }) => {
  await page.goto("/");
  const icons = await page.locator('link[rel="icon"]').evaluateAll((links) =>
    links.map((link) => ({ href: link.getAttribute("href") as string, type: link.getAttribute("type") })),
  );
  expect(icons.map((icon) => icon.type).sort()).toEqual(["image/png", "image/svg+xml"]);
  for (const icon of icons) {
    const response = await request.get(icon.href);
    expect(response.status(), icon.href).toBe(200);
    expect(response.headers()["content-type"], icon.href).toContain(icon.type as string);
  }
  const svg = await (await request.get(icons.find((icon) => icon.type === "image/svg+xml")!.href)).text();
  expect(svg).toContain("prefers-color-scheme:dark");

  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const appleResponse = await request.get(apple as string);
  expect(appleResponse.status()).toBe(200);
  expect(appleResponse.headers()["content-type"]).toContain("image/png");

  // The preview's address is absolute (localhost unless NEXT_PUBLIC_SITE_URL is set); fetch its path from this server.
  const image = new URL((await meta(page, "og:image")) as string);
  expect(await meta(page, "og:image:alt")).toBe(DEFAULT_TITLE);
  const preview = await request.get(`${image.pathname}${image.search}`);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toContain("image/png");
});

test("while an answer is prepared the bead travels its ring, and holds still with reduced motion", async ({ page }) => {
  // Hold the request, so the question stays in progress.
  await page.route("**/api/ask/stream", () => new Promise<void>(() => undefined));
  const running = () =>
    page
      .getByRole("list", { name: "Progress" })
      .locator(".mark-orbit")
      .evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length);

  for (const [motion, expected] of [["no-preference", 1], ["reduce", 0]] as const) {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto("/");
    await page.getByLabel("Describe your situation").fill("I keep putting off a difficult decision.");
    await page.getByRole("button", { name: "Reflect" }).click();
    await expect(page.getByRole("list", { name: "Progress" }).locator(".mark-orbit")).toHaveCount(1);
    await expect.poll(running, { message: motion }).toBe(expected);
  }
});
