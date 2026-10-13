import type { Page } from "@playwright/test";

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
