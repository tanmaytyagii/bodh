"use client";

import { useEffect } from "react";

import { journey } from "@/lib/journey";
import { STORY_CHAPTERS } from "@/lib/scene";

/**
 * The story moves on to a chapter while the chapter's top travels from the
 * bottom of the screen to this fraction of the screen's height above it.
 */
const ENTRY = 0.6;

/**
 * Turns the scroll position of the landing page into a position in the story
 * (chapter index plus progress towards the next), for the 3D scene and the
 * chapter rail. It only reads the page; it never moves it.
 */
export function JourneyObserver() {
  useEffect(() => {
    let frame = 0;
    let idle = 0;
    let lastPosition = 0;
    let lastTime = performance.now();
    let velocity = 0;

    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      let position = 0;
      for (let i = 1; i < STORY_CHAPTERS.length; i++) {
        const element = document.getElementById(STORY_CHAPTERS[i].id);
        if (!element) break;
        const entered = (viewport - element.getBoundingClientRect().top) / (viewport * ENTRY);
        if (entered <= 0) break;
        position = i - 1 + Math.min(1, entered);
      }
      const now = performance.now();
      const seconds = Math.max(0.016, (now - lastTime) / 1000);
      velocity = velocity * 0.7 + ((position - lastPosition) / seconds) * 0.3;
      lastPosition = position;
      lastTime = now;
      journey.setPosition(position, velocity);
      // Once scrolling stops, so does the extra turn of the rings.
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        velocity = 0;
        journey.setPosition(lastPosition, 0);
      }, 140);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Chapters below stream in after the first paint, and fonts change heights.
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      journey.reset();
    };
  }, []);

  return null;
}
