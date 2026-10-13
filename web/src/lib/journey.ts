import type { HeroFrame } from "./scene";

// The landing page's scroll story, shared between the page and the 3D scene.
// The page writes here as it scrolls; the scene reads it on every frame. Only
// a change of chapter (or of the theme or step in focus) notifies listeners,
// so scrolling never re-renders React.

type Listener = () => void;

class Journey {
  /** Chapter index plus progress towards the next: 0 at the top of the page. */
  position = 0;
  /** How fast the story is moving, in chapters per second (smoothed). */
  velocity = 0;
  /** The theme path in focus in the themes chapter (0-based), or -1. */
  focus = -1;
  /** The step in focus in the understanding chapter (0-based). */
  step = 0;
  /** Where the invitation's visual region is, once measured: the story opens there. */
  heroFrame: HeroFrame | null = null;

  private chapter = 0;
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The chapter nearest the current position. */
  getChapter = () => this.chapter;

  setPosition(position: number, velocity: number) {
    this.position = position;
    this.velocity = velocity;
    const chapter = Math.round(position);
    if (chapter !== this.chapter) {
      this.chapter = chapter;
      this.emit();
    } else {
      this.emitMotion();
    }
  }

  setFocus(focus: number) {
    if (focus === this.focus) return;
    this.focus = focus;
    this.emit();
  }

  setStep(step: number) {
    if (step === this.step) return;
    this.step = step;
    this.emit();
  }

  setHeroFrame(frame: HeroFrame | null) {
    const current = this.heroFrame;
    const same =
      current === frame ||
      (current !== null && frame !== null && current.x === frame.x && current.y === frame.y && current.size === frame.size);
    if (same) return;
    this.heroFrame = frame;
    this.emitMotion();
  }

  reset() {
    this.position = 0;
    this.velocity = 0;
    this.focus = -1;
    this.step = 0;
    this.chapter = 0;
    this.emit();
  }

  // Listeners that need every movement (a scene drawn on demand) subscribe here.
  private readonly motionListeners = new Set<Listener>();
  subscribeMotion = (listener: Listener) => {
    this.motionListeners.add(listener);
    return () => {
      this.motionListeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
    this.emitMotion();
  }

  private emitMotion() {
    for (const listener of this.motionListeners) listener();
  }
}

export const journey = new Journey();
