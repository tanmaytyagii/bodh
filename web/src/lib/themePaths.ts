// Editorial grouping of the theme index into a few paths, so people can start
// from the kind of situation they are in. Themes not listed here appear under
// "More themes", so a new theme is never hidden.

import type { MessageKey } from "./i18n/messages";

export interface ThemePath {
  id: string;
  /** Interface text (lib/i18n/messages.ts), in the chosen language. */
  title: MessageKey;
  description: MessageKey;
  themes: string[];
}

export const THEME_PATHS: ThemePath[] = [
  {
    id: "work",
    title: "path.work.title",
    description: "path.work.description",
    themes: [
      "action-without-attachment",
      "no-effort-wasted",
      "five-factors-of-action",
      "equanimity",
      "work-as-offering",
      "acting-not-escaping",
      "leading-by-example",
      "balanced-living",
    ],
  },
  {
    id: "mind",
    title: "path.mind.title",
    description: "path.mind.description",
    themes: [
      "mastering-the-mind",
      "anger-and-desire",
      "three-gates",
      "senses-and-desire",
      "pleasure-and-lasting-good",
      "meditation",
      "steady-wisdom",
      "impermanence-and-endurance",
    ],
  },
  {
    id: "choices",
    title: "path.choices.title",
    description: "path.choices.description",
    themes: ["dilemma-and-despair", "doubt-and-clarity", "reflect-then-choose", "own-path", "courage"],
  },
  {
    id: "self",
    title: "path.self.title",
    description: "path.self.description",
    themes: [
      "self-as-friend",
      "comparison-and-envy",
      "contentment",
      "ego-and-humility",
      "learning-and-humility",
      "divine-qualities",
      "three-qualities",
    ],
  },
  {
    id: "others",
    title: "path.others.title",
    description: "path.others.description",
    themes: ["forgiveness", "goodwill-toward-all", "right-speech", "equal-regard"],
  },
  {
    id: "meaning",
    title: "path.meaning.title",
    description: "path.meaning.description",
    themes: ["grief-and-the-self", "faith-and-self-trust", "refuge-and-trust", "devotion"],
  },
];
