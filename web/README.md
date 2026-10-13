# Web app

The Next.js front end of BODH: Ask, the scripture explorer, verse, theme and story pages, and saved reflections. It talks only to the FastAPI service (`../backend`). For the project overview, see the [root README](../README.md).

## Running

```bash
npm ci
npm run dev        # http://localhost:3000, with the API on http://127.0.0.1:8000
npm run build && npm run start
```

| Variable | Read at | Purpose |
| --- | --- | --- |
| `API_URL` | Runtime, server side only | Where the web server reaches the API. Default `http://127.0.0.1:8000`. |
| `NEXT_PUBLIC_SITE_URL` | Build time | The site's public address, for absolute URLs in link previews. Without it they point at localhost. |
| `NEXT_PUBLIC_APP_NAME` | Build time | Replaces the product name alone. Default "BODH"; the rest of the brand is in `src/lib/brand.ts`. |

The build does not need the API. Pages prerender a static shell and stream their data at request time.

## Structure

```
src/app/
  page.tsx                              Ask (the conversation UI is a client component)
  explore/                              search, the library, stories
  scripture/[source]/[chapter]/[verse]/ source, chapter and verse pages
  concepts/, stories/[id]/              editorial themes and stories
  reflections/, about/, settings/
  api/[...path]/route.ts                same-origin, allowlisted proxy to the API (streams SSE)
  icon.tsx, apple-icon.tsx, opengraph-image.tsx   favicons and the link preview, drawn from lib/brand.ts
  globals.css                           design tokens (light and dark palettes) and base styles
src/proxy.ts                            real 404s for unknown verses, themes and stories
src/lib/brand.ts                        the brand: name, lines, description, the mark's geometry and colours
src/lib/api.ts                          server-only corpus reads ('use cache' + cacheLife)
src/lib/stream.ts                       client for the /api/ask/stream event stream
src/lib/reflections.ts                  localStorage reflections, sessionStorage conversation
src/lib/theme.ts, useTheme.ts           appearance preference: System, Light or Dark
src/lib/ui.ts                           shared class recipes (buttons, links, panels)
src/lib/passages.ts                     passage id → page link (add new id prefixes here)
src/lib/themePaths.ts                   editorial grouping of themes into paths (new themes appear under “More themes”)
src/lib/scene.ts                        scene modes, framing and story poses, shared by the 3D scene and its still drawing
src/lib/journey.ts                      the landing story's position, written on scroll and read by the 3D scene
src/lib/askNavigation.ts                the Ask page's two views: the #conversation address, and links back to the invitation
src/components/
  ask/                                  QuestionComposer, Conversation, AnswerPanel, Progress
  layout/                               PageContainer, PageHeader, Breadcrumbs, EmptyState, LoadingState
  theme/                                ThemeScript (before first paint), ThemeSync, InlineScript
  settings/                             ThemeSelector, ReflectionSettings
  scene/                                Stage, CelestialScene (React Three Fiber), armillary.ts (three.js), SceneFallback
  brand/                                BrandMark, Wordmark
  landing/                              the landing story: its chapters (Story), the scroll observer, chapter rail and steps
  VerseCard, ThemeExplorer, SourceMetadata, Label, ProvenanceBadge, CitedText, SafetyPanel, ConfirmButton, Icon, …
e2e/                                    Playwright tests, including axe checks in both themes
```

This project uses Next.js 16 with Cache Components (`cacheComponents: true`):

- Read route `params` and `searchParams` inside a `<Suspense>` boundary.
- Keep `notFound()` outside `'use cache'` functions; they return `null` for missing records.
- `npx next typegen` generates the global `PageProps`, `LayoutProps` and `RouteContext` types.

`AGENTS.md` points coding agents at the bundled Next.js docs, because this version differs from older ones.

## Appearance

Three settings, chosen in Settings and stored in this browser (`localStorage["sw.theme"]`):
**System** (the default) follows the device and changes when it does; **Light** and **Dark** stay put.

- Colours are CSS custom properties in `globals.css`, one block per theme, mapped to Tailwind
  utilities (`bg-paper`, `text-ink`, `text-accent`, …) in `@theme inline`. Components never use raw
  colours; to change the palette, change the tokens.
- `data-theme="light|dark"` on `<html>` selects the palette. An inline script in `<head>`
  (`THEME_INIT_SCRIPT`) sets it while the page is parsed, so there is no flash of the wrong theme;
  without JavaScript the `prefers-color-scheme` media query applies.
- `ThemeSync` (in the root layout) re-applies the theme after hydration, follows the device while
  System is selected, and picks up a choice made in another tab.
- Any element can carry `data-theme` to show the other palette in a subtree (the Settings previews do).

## Brand

The product is **BODH** (बोध: understanding, awareness, discernment, insight). Everything that names or draws
it comes from `src/lib/brand.ts`; change it there.

- **Words.** The name; the name in Devanagari; the tagline, *Ancient Wisdom. Clearer Living.*; the philosophy,
  *Understand deeply. Choose consciously.*; a line in Hindi, *बोध — ज्ञान से समझ तक।* ("from knowledge to
  understanding"); and the description for search results and link previews. `NEXT_PUBLIC_APP_NAME` still
  replaces the name alone at build time. The Devanagari lines spell BODH, so with any other name they are not shown.
- **The mark.** A ring, its still centre, and a saffron bead just risen above the ring's left horizon (east, on a
  chart of the sky): the whole of a teaching, the understanding at its heart, the moment of discovery. It shares
  the instrument's language (rings, beads keeping time, a glowing core) without drawing the instrument, and it is
  deliberately unlike the verified-source seal (a ring with a diamond). `MARK` gives its geometry on a 32-unit square
  in two weights, regular (24px and up) and bold (favicons). `components/brand/BrandMark.tsx` draws it: `mono` in
  one colour, `orbit` with the bead travelling the ring (the step under way while an answer is prepared; still with
  reduced motion).
- **The wordmark.** `components/brand/Wordmark.tsx`: the mark, BODH in Instrument Serif capitals tracked at 0.15em,
  a hairline, and बोध in Tiro Devanagari Sanskrit. Its accessible name is the name alone. Never letter-space
  Devanagari: it breaks the headstroke that joins the letters.
- **Where it appears.** The navigation and the footer; page titles (`BODH — Ancient Wisdom. Clearer Living.` for the
  home page, `Page · BODH` elsewhere); the landing lede; the Understanding chapter, labelled बोध; the closing line of
  the Return chapter; About, which says what the name means; the step under way while an answer is prepared; and
  exported reflections (`bodh-reflections.md`). The tagline appears once in the interface (the footer), the
  philosophy on the landing page and on About. Keep it that way: the brand is in the details, not in slogans.
- **Images.** `app/icon.tsx` (an SVG favicon that follows the browser's appearance, and a 32px PNG on an ivory disc),
  `app/apple-icon.tsx` (180px, on charcoal) and `app/opengraph-image.tsx` (1200×630, also used for Twitter cards) are
  drawn from `MARK` and `BRAND_COLORS`, so a change to the brand needs no new image files. The preview image fetches
  its three fonts from Google Fonts when it is built, cut to the letters it uses; without them it renders in a default
  face and leaves out the Devanagari.
- **Link previews.** Each page's title and description become its preview's. Set `NEXT_PUBLIC_SITE_URL` when building
  for production, so the preview image has an absolute address; without it Next.js uses localhost and warns.
- **Kept on purpose.** Browser storage keys still start with `sw.` (`sw.theme`, `sw.reflections.v1`,
  `sw.conversation.v1`), from the working name. Renaming them would lose people's saved reflections and appearance.

## The Ask page

Ask has two views at one address (`components/ask/Conversation.tsx`).

- **The invitation.** The headline, the question box, four example questions that only fill the box, and the
  landing story below. It never shows an earlier answer. If this tab has a conversation, one line offers to return
  to it, and says that a new question here starts a new one.
- **The conversation** (`/#conversation`). Each question with its answer in a 46rem reading column, the follow-up
  box after the latest answer, and the instrument quietly beside the column (or above the question on narrower
  screens).
- **Moving between them.** Sending a first question adds the `#conversation` history entry, so back returns to
  the invitation and forward to the answer. A refresh keeps whichever view you are on; the conversation itself
  lives in `sessionStorage` and is gone when the tab closes. Links to Ask (the name, the navigation, the footer)
  open the invitation, even from the conversation (`AskLink`, `lib/askNavigation.ts`); the conversation stays one
  step back. "New question" in the answer does the same; "Start over" clears the conversation.
- **Asking.** As a first question is sent, the page becomes the conversation and the question becomes its heading,
  gliding up from where the question box was. Only transform and opacity move, so nothing waits on it and every
  control stays usable; with reduced motion it simply appears. The request starts at once. A question is sent only once, however often the button is pressed. If it
  fails, it goes back in its box with the reason and a "Try again" action; "Stop" does the same without an error.
  A new question from the invitation replaces the conversation only once it is answered.
- **An answer, in order.** Whether a model wrote any of it (a quiet note; without one, "Passages only — no AI
  interpretation" and the technical details); the passages, numbered, one after another, each exactly as printed
  with its provenance; the model's interpretation beneath each passage, only where one was written; the steps;
  the follow-up box; and a colophon with the passages, how they were checked, and saving and reporting. A compact
  toolbar of the passages (or sections), "Follow up" and "Save" sticks under the navigation while you read.

## The scene

Ask and Explore sit on a full-screen stage (`components/scene/Stage.tsx`), drawn with three.js through React
Three Fiber. It shows an observatory: a celestial armillary resting in an engraved bowl, after the instruments of
Jaipur's Jantar Mantar. The sphere has a graduated meridian, the equator, and the ecliptic at the Earth's tilt. The
bowl is a hemisphere engraved with circles of altitude and hour lines, and its rim is divided into the 27
nakshatras and their 108 quarters.

- **Decorative only.** The stage is `aria-hidden`, takes no pointer events and sits behind the content. The
  question box works before the scene loads, while it loads, and without it.
- **Loading.** The first paint is a still SVG drawing of the same instrument (`SceneFallback`), part of the server
  HTML. The 3D code is a separate chunk of about 250 kB gzipped, mostly three.js. It loads once the browser is
  idle, and only if WebGL is available, then fades in over the drawing. Without WebGL the drawing stays.
- **The landing story.** Below the invitation, the Ask page is a story in five chapters: invitation, teachings,
  themes, understanding, and return.
  - `components/landing/JourneyObserver.tsx` turns the scroll position into a position in the story
    (`lib/journey.ts`).
  - The instrument takes a pose for each chapter (`STORY_POSES` in `lib/scene.ts`): where it sits, how it is turned
    and tilted, how bright it is and how visible.
  - The rings turn a little faster while the page scrolls. In the themes chapter the instrument turns to the path in
    focus, and in the understanding chapter a bead moves on with each step.
  - The scene never moves the page, and nothing on the page waits for the scene.
- **Modes.**
  - `hero`: the Ask landing, following the story.
  - `thinking`: while an answer is prepared; faster and brighter.
  - `reading`: an answer is shown; small and quiet in the margin beside the reading column, or, on screens
    narrower than 1280px, above the question, giving way as the answer scrolls up (`conversationFraming`).
  - `ambient`: Explore.
- **Framing.** `lib/scene.ts` places the instrument for each mode, chapter and screen shape (wide, square, short
  landscape, portrait) as fractions of the viewport. The 3D scene and the drawing's CSS both read it, so they put
  the instrument in the same place. Movement is damped and can change course midway, so a transition can be
  interrupted at any point.
- **Scrolling.** On the landing page the stage's opacity follows the story, so text over it stays easy to read.
  Elsewhere the stage recedes to a faint presence as the page scrolls. A reply to someone at risk fades it out
  entirely (`quiet`).
- **Cost.** Touch devices, small CPUs and data-saver connections get the `lite` quality: fewer particles,
  engravings and tick marks, and a lower pixel ratio. Once the reading pose settles the scene renders only on
  demand, and it draws nothing while the page is in a background tab.
- **Reduced motion.** One still composition, rendered on demand. On the landing page the instrument keeps its
  opening place and only fades, staying faint behind the middle chapters.
- **Code layout.** The geometry, materials and shaders are in `components/scene/armillary.ts`, a plain three.js
  class, so React components hold no mutable 3D state.
- **Pinned version.** three.js is pinned to 0.182. From 0.183, the `THREE.Clock` that @react-three/fiber 9 uses
  logs a deprecation warning on every page, and the console tests fail on any warning. Unpin it once
  @react-three/fiber stops using `THREE.Clock`.

## Motion

- **Reveals.** Content moves into place as it scrolls into view, with CSS scroll-driven animations (`.reveal`,
  `.reveal-tilt` and `.reveal-rule` in `globals.css`). They are tied to the scroll position, not to time, so
  nothing waits, and they run backwards when the page is scrolled back.
- **Text is moved, never faded.** It stays readable at every point, and the contrast checks can measure it.
- **Nothing lingers.** Once content is in place no animation stays applied (fill `backwards`), so it keeps no
  transform or stacking context of its own. Keep that when adding reveals, or tooltips inside them can end up
  under the next element.
- **Other scroll-linked touches.** The answer's section bar shows reading progress the same way
  (`.reading-progress`, on the answer's `--answer` view timeline). Library volumes lean back a little on hover and
  focus (`.volume`).
- **When it is off.** All of this is off with reduced motion and in browsers without scroll timelines; the
  content is simply in place.
- **No scroll-jacking.** The page always scrolls natively. The story only reads the scroll position.

## Navigation

The navigation floats rather than sitting in a bar: the name at the left, and a capsule of links at the right (a
round menu button on small screens), each with its own frosted backdrop. The fixed layer that holds them lets
clicks through to the page; only the pills take them. The current page is raised inside the capsule. On the
landing page a rail of chapter marks sits at the right edge of large screens, with a hairline of progress across
the top of smaller ones.

## Design rules

- Scripture comes only from the API. Never hard-code a verse, Sanskrit or a translation in the UI.
- Source text, translator's notes, editorial material and AI interpretation each have their own label (`components/Label.tsx`). Keep them visually distinct.
- Typography: Instrument Serif (`display` class) for headlines and pull quotes only; Literata (`font-serif`) for
  scripture in translation and for numerals; Geist for the interface and for model-written text; Tiro Devanagari
  Sanskrit for Sanskrit. Mark Sanskrit with `lang="sa"` and the `deva` class.
- Colour: ink and ivory carry the page; saffron (`accent`) marks what matters; gold is for ornaments, large numerals
  and the verified-source seal only (it is below 4.5:1 on light surfaces, so never use it for small text).
- Prefer open sections, hairline dividers and margin notes to bordered cards. A passage is set as a plate
  (`VerseCard variant="feature"`) only where it is the focus; lists use `variant="plain"`.
- Destructive actions ask first with `ConfirmButton`.
- Every page must pass the axe checks and fit a phone-width screen without horizontal scrolling (the tests use a Pixel 7).
- The scene stays clear of the header, and of the hero text on the screens the responsive tests cover. Text that
  scrolls over it sits on the faded stage, never on the scene at full strength.
- Anything rendered on the server must produce the same HTML in the browser. Round computed coordinates (see
  `SceneFallback`), and use `useSyncExternalStore` with a server snapshot for values only the browser knows.

## Checks

```bash
npx tsc --noEmit && npx eslint src e2e
npx playwright test     # needs the API running; starts the web app if none is on :3000
PORT=3100 npx playwright test   # use another port, e.g. while `npm run dev` holds :3000
BASE_URL=http://localhost:3000 npx playwright test e2e/console.spec.ts e2e/theme.spec.ts e2e/scene.spec.ts   # against `npm run dev`
```

Run the console, theme and scene tests against the development server too. Only development builds report
hydration mismatches. Use `localhost`, not `127.0.0.1`: the development server refuses its hot-reload
connection from `127.0.0.1`, and that error fails the console test. A long-running development server can keep
serving an old stylesheet after `globals.css` changes; restart it if a style test fails only there.

The tests keep a trace of every test while it runs (`trace: "retain-on-failure"`). On a machine short of disk
space, add `--trace off`.

The browser tests run on desktop Chrome and a Pixel 7 profile. They pass with or without a model configured. With a key set, the ask test makes real model calls; start the API with `LLM_PROVIDER=none` to avoid that.
