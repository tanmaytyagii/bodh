import type { Page } from "@playwright/test";

/**
 * Scrollbars of one kind, whatever the machine running the tests has. Overlay
 * scrollbars take no room, as on phones and on a Mac with a trackpad. Classic
 * ones take room from the page (15px on a Mac with a mouse, 17px on Windows;
 * these take 17px), while media queries still measure the whole window.
 * Headless Chromium hides scrollbars, yet keeps the room of classic ones on
 * some machines and not on others; a test file using this launches without
 * --hide-scrollbars.
 */
export async function withScrollbars(page: Page, kind: "overlay" | "classic") {
  const css = kind === "overlay" ? ":root { scrollbar-width: none; }" : "::-webkit-scrollbar { width: 17px; height: 17px; }";
  await page.addInitScript((content) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = content;
      document.head.append(style);
    });
  }, css);
}

/** Make WebGL unavailable to the page, as on devices without it. */
export async function withoutWebGL(page: Page) {
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
