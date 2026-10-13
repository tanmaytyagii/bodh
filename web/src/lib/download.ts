import { BRAND } from "./brand";
import { reflectionToMarkdown, type SavedReflection } from "./reflections";

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** File names start with the product's name: "bodh-reflections.md". */
const named = (file: string) => (BRAND.slug ? `${BRAND.slug}-${file}` : file);

export function downloadReflections(items: SavedReflection[]): void {
  downloadFile(named("reflections.md"), items.map(reflectionToMarkdown).join("\n\n"), "text/markdown");
}

export function downloadReflection(item: SavedReflection): void {
  downloadFile(named(`reflection-${item.id.slice(0, 8)}.md`), reflectionToMarkdown(item), "text/markdown");
}
