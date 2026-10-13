"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { journey } from "@/lib/journey";
import {
  BESIDE_QUERY,
  conversationFraming,
  framingStyle,
  orientationFor,
  SCENE_OPACITY,
  STORY_CHAPTERS,
  storyPose,
  type SceneMode,
  type SceneQuality,
} from "@/lib/scene";
import { useTheme } from "@/lib/useTheme";

import { SceneFallback } from "./SceneFallback";

// The 3D scene is its own chunk, fetched only once the page is interactive.
const CelestialScene = dynamic(() => import("./CelestialScene"), { ssr: false });

const noSubscribe = () => () => {};

// Probed once per page load; the probe's context is released straight away.
let webglSupport: boolean | null = null;
function supportsWebGL(): boolean {
  if (webglSupport === null) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webglSupport = Boolean(gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Fewer particles and pixels on touch devices, small CPUs and data-saver connections. */
let quality: SceneQuality | null = null;
function preferredQuality(): SceneQuality {
  if (quality === null) {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    quality = coarse || small || nav.connection?.saveData ? "lite" : "full";
  }
  return quality;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The full-screen stage behind a page: an atmospheric glow, the still drawing
 * of the armillary, and — once the browser is idle and if WebGL is available —
 * the live 3D scene, which fades in over the drawing. Purely decorative: it is
 * hidden from assistive technology and never takes pointer events.
 *
 * On the landing page ("story") the instrument follows the scroll story, and
 * the stage's opacity follows its pose. The story opens in the invitation's
 * visual region (InstrumentFrame), which holds the still drawing itself; the
 * glow is centred on it once it has been measured. Beside a conversation the
 * instrument rests in the margin, or, on narrow screens, above the question,
 * giving way as the answer scrolls up. On Explore it recedes to a faint presence as the page scrolls.
 * "quiet" fades it out altogether. Nothing is drawn while it is invisible or
 * while the page is in a background tab.
 */
export function Stage({ mode, quiet = false, story = false }: { mode: SceneMode; quiet?: boolean; story?: boolean }) {
  const { resolved } = useTheme();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Beside a conversation, the instrument goes wherever the stylesheet puts the still drawing.
  const beside = useMediaQuery(BESIDE_QUERY);
  const webgl = useSyncExternalStore(noSubscribe, supportsWebGL, () => null);
  const sceneQuality = useSyncExternalStore(noSubscribe, preferredQuality, () => "full" as const);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pageHidden = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "hidden", () => false);
  const following = story && mode === "hero";
  const chapter = useSyncExternalStore(journey.subscribe, journey.getChapter, () => 0);
  const layer = useRef<HTMLDivElement>(null);

  // Let the page (and the question box) become interactive first.
  useEffect(() => {
    if (!webgl) return;
    const start = () => setLoad(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 300);
    return () => clearTimeout(id);
  }, [webgl]);

  // Fade with scroll, or with the story; pause the scene once it is out of sight.
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    let frame = 0;
    if (following) {
      const apply = () => {
        frame = 0;
        const orientation = orientationFor(window.innerWidth / Math.max(window.innerHeight, 1), window.innerHeight);
        const { opacity } = storyPose(journey.position, orientation);
        // With reduced motion the instrument keeps its opening place, beside the
        // text; between the invitation and the return it would sit behind other
        // text, so it stays faint there.
        const aside = journey.position < 0.5 || journey.position > STORY_CHAPTERS.length - 1.5;
        element.style.opacity = String(reducedMotion && !aside ? Math.min(opacity, 0.15) : opacity);
        const hero = journey.heroFrame;
        if (hero) {
          element.style.setProperty("--scene-x", `${hero.x}px`);
          element.style.setProperty("--scene-y", `${hero.y}px`);
          const glow = orientation === "portrait" ? window.innerWidth * 0.45 : hero.size * 0.62;
          element.style.setProperty("--scene-glow-size", `${glow}px`);
        }
        element.toggleAttribute("data-framed", hero !== null);
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(apply);
      };
      apply();
      const unsubscribe = journey.subscribeMotion(schedule);
      window.addEventListener("resize", schedule);
      return () => {
        unsubscribe();
        window.removeEventListener("resize", schedule);
        cancelAnimationFrame(frame);
        for (const name of ["--scene-x", "--scene-y", "--scene-glow-size"]) element.style.removeProperty(name);
        element.removeAttribute("data-framed");
      };
    }
    const update = () => {
      frame = 0;
      let fade: number;
      if (mode === "thinking" || mode === "reading") {
        // Beside the reading column the instrument stays; above the question it
        // gives way as soon as the answer scrolls up to it. Sized as the scene
        // sizes it: by the stage, which a classic scrollbar makes narrower than the window.
        const place = conversationFraming(mode, element.clientWidth, element.clientHeight, beside);
        fade = place.beside ? 1 : Math.max(0, 1 - window.scrollY / (place.size + 24));
      } else {
        const floor = mode === "hero" ? 0 : 0.2;
        const distance = mode === "hero" ? 0.85 : 0.5;
        fade = Math.max(floor, 1 - window.scrollY / (window.innerHeight * distance));
      }
      element.style.opacity = String(fade);
      setHidden(fade === 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [mode, following, reducedMotion, beside]);

  const state = webgl === false ? "fallback" : ready ? "ready" : "loading";
  const style = { ...framingStyle(mode), "--stage-opacity": quiet ? "0" : String(SCENE_OPACITY[mode]) } as CSSProperties;

  return (
    <div
      aria-hidden
      className="stage"
      data-scene={state}
      data-mode={mode}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-quality={sceneQuality}
      data-quiet={quiet || undefined}
      data-paused={hidden || quiet || pageHidden}
      data-chapter={following ? chapter : undefined}
      data-story={following || undefined}
      style={style}
    >
      <div ref={layer} className="stage-layer">
        <div className="stage-atmosphere" />
        {!following && <SceneFallback className={ready ? "opacity-0" : "opacity-100"} />}
        {load && webgl && resolved && (
          <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
            <CelestialScene
              mode={mode}
              theme={resolved}
              quality={sceneQuality}
              reducedMotion={reducedMotion}
              paused={hidden || quiet || pageHidden}
              story={following}
              beside={beside}
              onReady={() => setReady(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
