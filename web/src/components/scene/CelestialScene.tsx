"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { journey } from "@/lib/journey";
import { CAMERA_FOV, CAMERA_Z, type SceneMode, type SceneQuality } from "@/lib/scene";

import { Armillary, type Theme } from "./armillary";

export interface CelestialSceneProps {
  mode: SceneMode;
  theme: Theme;
  quality: SceneQuality;
  reducedMotion: boolean;
  paused: boolean;
  /** Follow the landing page's scroll story (hero mode only). */
  story: boolean;
  /** Beside a conversation: rest beside the reading column (BESIDE_QUERY), as the stylesheet does. */
  beside: boolean;
  onReady: () => void;
}

/** The WebGL canvas. Loaded on its own, after the page is interactive (see Stage). */
export default function CelestialScene(props: CelestialSceneProps) {
  return (
    <Canvas
      dpr={props.quality === "lite" ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "default" }}
      camera={{ fov: CAMERA_FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 60 }}
      frameloop={props.paused ? "never" : props.reducedMotion ? "demand" : "always"}
      style={{ position: "absolute", inset: 0 }}
    >
      <Rig {...props} />
    </Canvas>
  );
}

/**
 * Drives the instrument: builds it once, keeps its theme in step, feeds it
 * every frame, and decides when drawing can stop — paused when hidden, single
 * still frames for reduced motion, and on demand once the reading position is
 * reached.
 */
function Rig({ mode, theme, quality, reducedMotion, paused, story, beside, onReady }: CelestialSceneProps) {
  const get = useThree((state) => state.get);
  const rig = useRef<Armillary | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const readyFired = useRef(false);

  useEffect(() => {
    const { gl, scene } = get();
    const armillary = new Armillary(gl, scene, quality);
    rig.current = armillary;
    return () => {
      armillary.dispose();
      rig.current = null;
    };
  }, [get, quality]);

  useEffect(() => {
    rig.current?.setTheme(theme);
    get().invalidate();
  }, [get, theme, quality]);

  // Pointer parallax on devices with a fine pointer, unless motion is reduced.
  useEffect(() => {
    if (reducedMotion || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  // A new mode, theme or place wakes the loop for its transition.
  useEffect(() => {
    rig.current?.wake();
    const { setFrameloop, invalidate } = get();
    setFrameloop(paused ? "never" : reducedMotion ? "demand" : "always");
    invalidate();
  }, [get, mode, theme, paused, reducedMotion, beside]);

  // When frames are drawn on demand, the story asks for one whenever it moves.
  useEffect(() => {
    if (!story) return;
    return journey.subscribeMotion(() => {
      rig.current?.wake();
      get().invalidate();
    });
  }, [get, story]);

  useFrame((state, delta) => {
    const armillary = rig.current;
    if (!armillary) return;
    const continuous = state.frameloop === "always";
    const resting = armillary.update({
      mode,
      time: state.clock.elapsedTime,
      delta,
      width: state.size.width,
      height: state.size.height,
      beside,
      snap: reducedMotion || !continuous,
      reducedMotion,
      pointer: pointer.current,
      story: story
        ? {
            position: journey.position,
            velocity: journey.velocity,
            focus: journey.focus,
            step: journey.step,
            hero: journey.heroFrame,
          }
        : null,
    });
    if (!readyFired.current) {
      readyFired.current = true;
      onReady();
    }
    // A still backdrop costs nothing: stop drawing once the reading position is reached.
    if (continuous && mode === "reading" && resting) state.setFrameloop("demand");
  });

  return null;
}
