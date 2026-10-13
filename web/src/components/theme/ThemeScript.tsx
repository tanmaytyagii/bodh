import { THEME_INIT_SCRIPT } from "@/lib/theme";

import { InlineScript } from "./InlineScript";

/** Applies the saved appearance before the page paints. Render inside <head>. */
export function ThemeScript() {
  return <InlineScript html={THEME_INIT_SCRIPT} />;
}
