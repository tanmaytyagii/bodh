import { InlineScript } from "@/components/theme/InlineScript";
import { LOCALE_INIT_SCRIPT } from "@/lib/i18n/locale";
import { READING_INIT_SCRIPT } from "@/lib/reading";

/** Applies the saved language and reading preferences before the page paints. Render inside <head>. */
export function PreferencesScript() {
  return <InlineScript html={`${LOCALE_INIT_SCRIPT};${READING_INIT_SCRIPT}`} />;
}
