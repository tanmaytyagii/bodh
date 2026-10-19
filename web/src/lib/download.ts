import { BRAND } from "./brand";
import { exportDocument, type SavedItem } from "./reflections";

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

/** Every saved item, as Markdown to read that can also be imported again. */
export function downloadReflections(items: SavedItem[]): void {
  downloadFile(named("reflections.md"), exportDocument(items), "text/markdown");
}

export function downloadReflection(item: SavedItem): void {
  const id = item.id.replace(/^passage:/, "").replace(/[^a-z0-9.-]+/gi, "-").slice(0, 24);
  downloadFile(named(`reflection-${id}.md`), exportDocument([item]), "text/markdown");
}
