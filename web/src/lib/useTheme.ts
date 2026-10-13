import { useSyncExternalStore } from "react";

import { getSnapshot, parseSnapshot, setPreference, subscribe } from "./theme";

/** The saved appearance and the theme in effect. `resolved` is null until hydrated. */
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return { ...parseSnapshot(snapshot), setPreference };
}
