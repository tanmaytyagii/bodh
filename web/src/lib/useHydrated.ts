import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** False during server rendering and hydration, true once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
