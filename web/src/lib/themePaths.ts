// Editorial grouping of the theme index into a few paths, so people can start
// from the kind of situation they are in. Themes not listed here appear under
// "More themes", so a new theme is never hidden.

export interface ThemePath {
  id: string;
  title: string;
  description: string;
  themes: string[];
}

export const THEME_PATHS: ThemePath[] = [
  {
    id: "work",
    title: "Work and effort",
    description: "Results you cannot control, setbacks after hard work, burnout, and work worth doing.",
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
    title: "The restless mind",
    description: "Anger, craving, distraction, and the search for steadiness.",
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
    title: "Hard choices",
    description: "Doubt, conflicting duties, and finding a path that is your own.",
    themes: ["dilemma-and-despair", "doubt-and-clarity", "reflect-then-choose", "own-path", "courage"],
  },
  {
    id: "self",
    title: "Self and character",
    description: "Self-worth, comparison, ego, and the qualities worth growing.",
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
    title: "With other people",
    description: "Forgiveness, honest and kind speech, compassion, and fairness.",
    themes: ["forgiveness", "goodwill-toward-all", "right-speech", "equal-regard"],
  },
  {
    id: "meaning",
    title: "Loss, faith and meaning",
    description: "Grief, trust, devotion, and what endures.",
    themes: ["grief-and-the-self", "faith-and-self-trust", "refuge-and-trust", "devotion"],
  },
];
