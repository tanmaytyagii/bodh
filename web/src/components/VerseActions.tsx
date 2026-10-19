"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { BRAND } from "@/lib/brand";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";
import { speakerMessage } from "@/lib/passages";
import { passageItemId, reflectionsStore } from "@/lib/reflections";
import type { Passage } from "@/lib/types";
import { buttonClass } from "@/lib/ui";
import { useHydrated } from "@/lib/useHydrated";
import { renderVerseImage } from "@/lib/verseImage";

import { AskAboutLink } from "./AskAboutLink";
import { T } from "./i18n/T";
import { Icon } from "./Icon";

type Translate = ReturnType<typeof useT>;

/** The passage as text: reference, Sanskrit and transliteration when there are any, the translation, its source and a link. */
function verseText(passage: Passage, url: string, t: Translate): string {
  const parts = [passage.ref];
  const speaker = speakerMessage(passage);
  if (speaker) parts[0] += ` (${t(speaker.key, speaker.values)})`;
  if (passage.sanskrit) parts.push(passage.sanskrit);
  if (passage.transliteration) parts.push(passage.transliteration);
  parts.push(`“${passage.translation}”`);
  parts.push(`— ${t("verse.translatedByText", { translator: passage.translator })}. ${passage.citation.label}\n${url}`);
  return parts.join("\n\n");
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers and insecure contexts: copy through a hidden, selected field.
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy is not available.");
}

function useSavedPassage(passageId: string): boolean {
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  return items.some((item) => item.id === passageItemId(passageId));
}

/**
 * The same four actions under every passage: copy it with its citation;
 * share it (the device's share sheet, with an image of the passage when the
 * device can take one, otherwise the image and a link to save or copy); save
 * it to your reflections, once; and ask about it. "compact" shows icons only,
 * for lists.
 */
export function VerseActions({ passage, size = "full" }: { passage: Passage; size?: "full" | "compact" }) {
  const t = useT();
  const hydrated = useHydrated();
  const saved = useSavedPassage(passage.id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState<MessageKey | null>(null);
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const compact = size === "compact";

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  // Free the image once the dialog is done with it.
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const address = () => new URL(passage.path, window.location.origin).toString();

  async function copy() {
    try {
      await writeClipboard(verseText(passage, address(), t));
      setCopied(true);
      setAnnouncement("verse.copied");
    } catch {
      setAnnouncement("verse.copyFailed");
    }
  }

  async function share() {
    setBusy(true);
    setAnnouncement(null);
    try {
      const speaker = speakerMessage(passage);
      const meta = [speaker && t(speaker.key, speaker.values), passage.chapter_title].filter(Boolean).join(" · ");
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const blob = await renderVerseImage(
        passage,
        { source: t("label.source"), meta, attribution: t("verse.translatedByText", { translator: passage.translator }) },
        { theme, url: address() },
      );
      const name = `${BRAND.slug || "verse"}-${passage.id}.png`;
      const file = new File([blob], name, { type: "image/png" });
      const data = { title: passage.ref, text: `${passage.ref} — ${BRAND.name}`, url: address() };
      if (navigator.canShare?.({ ...data, files: [file] })) {
        await navigator.share({ ...data, files: [file] });
        return;
      }
      setImage({ url: URL.createObjectURL(blob), name });
      dialog.current?.showModal();
    } catch (error) {
      // Closing the share sheet is not a failure.
      if ((error as Error).name !== "AbortError") setAnnouncement("verse.shareFailed");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await writeClipboard(address());
      setAnnouncement("verse.linkCopied");
    } catch {
      setAnnouncement("verse.copyFailed");
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ title: passage.ref, url: address() });
    } catch {
      // cancelled, or not possible: the other choices remain
    }
  }

  const button = compact
    ? "inline-flex size-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
    : buttonClass("ghost", "sm", "-ml-1 px-2.5 text-ink-muted");

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      <button
        type="button"
        onClick={copy}
        className={button}
        aria-label={t(copied ? "verse.copied.label" : "verse.copy.label", { ref: passage.ref })}
        title={compact ? t("verse.copy") : undefined}
      >
        <Icon name={copied ? "check" : "copy"} className="size-4" />
        {!compact && <T k={copied ? "verse.copied" : "verse.copy"} />}
      </button>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-busy={busy || undefined}
        className={button}
        aria-label={t("verse.share.label", { ref: passage.ref })}
        title={compact ? t("verse.share") : undefined}
      >
        <Icon name="share" className="size-4" />
        {!compact && <T k="verse.share" />}
      </button>
      {saved ? (
        <Link
          href="/reflections"
          className={`${button} text-ok hover:text-ok`}
          aria-label={t("verse.saved.label", { ref: passage.ref })}
          title={compact ? t("verse.saved") : undefined}
        >
          <Icon name="bookmarkCheck" className="size-4" />
          {!compact && <T k="verse.saved" />}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setAnnouncement(reflectionsStore.savePassage(passage) ? "verse.savedAnnouncement" : "save.failed")}
          className={button}
          aria-label={t("verse.save.label", { ref: passage.ref })}
          title={t("verse.saveHint")}
        >
          <Icon name="bookmark" className="size-4" />
          {!compact && <T k="verse.save" />}
        </button>
      )}
      <AskAboutLink
        question="ask.about.verse"
        values={{ ref: passage.ref }}
        about={passage.ref}
        passageIds={[passage.id]}
        className={
          compact
            ? "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-medium text-accent transition-colors hover:bg-accent-soft"
            : buttonClass("ghost", "sm", "px-2.5 text-accent hover:bg-accent-soft hover:text-accent")
        }
      >
        <Icon name="reply" className="size-4 -scale-x-100" />
        {/* Named for its passage, so a list of passages has no two links alike. */}
        {compact ? (
          <>
            <span aria-hidden>
              <T k="verse.ask.short" />
            </span>
            <span className="sr-only">
              <T k="verse.ask.label" values={{ ref: passage.ref }} />
            </span>
          </>
        ) : (
          <>
            <T k="verse.ask" />
            <span className="sr-only"> ({passage.ref})</span>
          </>
        )}
      </AskAboutLink>
      <p aria-live="polite" className="sr-only">
        {announcement && <T k={announcement} />}
      </p>
      {announcement === "verse.copyFailed" || announcement === "verse.shareFailed" || announcement === "save.failed" ? (
        <p role="alert" className="w-full text-[0.8125rem] text-danger">
          <T k={announcement} />
        </p>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setImage(null)}
        className="m-auto w-[min(94vw,30rem)] rounded-2xl border border-rule bg-surface-raised p-0 text-ink shadow-overlay backdrop:bg-black/50"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-serif text-xl font-semibold">
              <T k="verse.shareTitle" values={{ ref: passage.ref }} />
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
            >
              <Icon name="close" className="size-5" />
              <span className="sr-only">
                <T k="common.close" />
              </span>
            </button>
          </div>
          {image && (
            // A generated image of the passage on this page; next/image adds nothing for a local blob.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={t("verse.imageAlt", { ref: passage.ref })}
              className="mt-4 max-h-[50vh] w-full rounded-xl object-contain ring-1 ring-rule"
            />
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {image && (
              <a href={image.url} download={image.name} className={buttonClass("primary", "md")}>
                <Icon name="download" className="size-4" />
                <T k="verse.downloadImage" />
              </a>
            )}
            <button type="button" onClick={copyLink} className={buttonClass("secondary", "md")}>
              <Icon name="copy" className="size-4" />
              <T k="verse.copyLink" />
            </button>
            {hydrated && "share" in navigator && (
              <button type="button" onClick={shareLink} className={buttonClass("secondary", "md")}>
                <Icon name="share" className="size-4" />
                <T k="verse.shareLink" />
              </button>
            )}
          </div>
          <p aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">
            {announcement === "verse.linkCopied" && <T k="verse.linkCopied" />}
          </p>
        </div>
      </dialog>
    </div>
  );
}
