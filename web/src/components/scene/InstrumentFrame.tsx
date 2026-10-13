"use client";

import { useLayoutEffect, useRef } from "react";

import { journey } from "@/lib/journey";

import { SceneFallback } from "./SceneFallback";

/**
 * The invitation's visual region: a square laid out with the page, beside the
 * headline and the question box (or above them on narrow screens), that the
 * instrument fills. It holds the still drawing, so the first paint is complete
 * before any script runs, and it reports where it is, so the 3D instrument is
 * drawn exactly over the drawing and follows the region as the window resizes
 * (see storyPose in lib/scene.ts).
 */
export function InstrumentFrame() {
  const region = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = region.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      if (!rect.width) return;
      journey.setHeroFrame({
        x: rect.left + window.scrollX + rect.width / 2,
        y: rect.top + window.scrollY + rect.height / 2,
        size: rect.width,
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // The region moves whenever the layout around it does: a new window size,
    // the fonts arriving, or the copy beside it growing (an error, a link back
    // to the conversation).
    const observer = new ResizeObserver(schedule);
    const grid = element.parentElement;
    for (const item of grid ? [grid, ...grid.children] : [element]) observer.observe(item);
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      journey.setHeroFrame(null);
    };
  }, []);

  return (
    <div ref={region} aria-hidden className="hero-visual">
      <SceneFallback name="hero" />
    </div>
  );
}
