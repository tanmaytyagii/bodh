import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import {
  CAMERA_FOV,
  CAMERA_Z,
  chapterIndex,
  conversationFraming,
  FRAME_WIDTH,
  frameCx,
  INSTRUMENT_RADIUS,
  orientationFor,
  OUTER_RADIUS,
  SCENE_FRAMING,
  storyPose,
  type Framing,
  type HeroFrame,
  type SceneMode,
  type SceneQuality,
} from "@/lib/scene";

// The observatory: a celestial armillary resting in an engraved bowl, after
// the instruments of Jaipur's Jantar Mantar. The sphere turns on an upright
// axis, with its equator, the ecliptic at the Earth's tilt, and a graduated
// meridian. The bowl below is a hemisphere engraved with lines of altitude
// and hour, like the Jai Prakash Yantra; its rim is divided into the 27
// nakshatras, the lunar mansions, and their 108 quarters. Two beads keep time
// on their orbits and fine dust drifts around it all. Everything is generated
// here; there are no textures or models to download.
//
// Plain three.js, owned by one object: React only creates it, feeds it each
// frame and disposes of it (see CelestialScene).

export type Theme = "light" | "dark";

interface Palette {
  ring: string;
  ringRoughness: number;
  engrave: string;
  envIntensity: number;
  tick: string;
  coreInner: string;
  coreRim: string;
  coreIntensity: number;
  halo: string;
  haloOpacity: number;
  additive: boolean;
  dust: string;
  dustOpacity: number;
  bead: string;
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
  sky: string;
  ground: string;
  hemiIntensity: number;
  coreLight: string;
  coreLightIntensity: number;
  exposure: number;
  /** The page colour: distant parts of the instrument fade towards it. */
  fog: string;
}

const PALETTES: Record<Theme, Palette> = {
  dark: {
    ring: "#d9a548",
    ringRoughness: 0.22,
    engrave: "#7f6230",
    envIntensity: 1.15,
    tick: "#ecc983",
    coreInner: "#ffe9bd",
    coreRim: "#d9862a",
    coreIntensity: 1.15,
    halo: "#eaa24f",
    haloOpacity: 0.5,
    additive: true,
    dust: "#f0d49a",
    dustOpacity: 0.9,
    bead: "#ffe4ad",
    key: "#ffe1b3",
    keyIntensity: 2.4,
    rim: "#9db2ff",
    rimIntensity: 0.9,
    sky: "#fff4dd",
    ground: "#191c28",
    hemiIntensity: 0.5,
    coreLight: "#ffb84d",
    coreLightIntensity: 5,
    exposure: 1.05,
    fog: "#0f1012",
  },
  light: {
    ring: "#b8862e",
    ringRoughness: 0.28,
    engrave: "#c9a668",
    envIntensity: 0.95,
    tick: "#94631a",
    coreInner: "#fff0d2",
    coreRim: "#d0802a",
    coreIntensity: 1.0,
    halo: "#e9ab55",
    haloOpacity: 0.32,
    additive: false,
    dust: "#a8741f",
    dustOpacity: 0.5,
    bead: "#b9711a",
    key: "#fff3dc",
    keyIntensity: 2,
    rim: "#c8d2ff",
    rimIntensity: 0.6,
    sky: "#ffffff",
    ground: "#d6cab4",
    hemiIntensity: 0.85,
    coreLight: "#ffb24a",
    coreLightIntensity: 2.5,
    exposure: 1,
    fog: "#f8f6f1",
  },
};

const DAMPING = 4.2;
const OBLIQUITY = THREE.MathUtils.degToRad(23.4);
const BOWL_RADIUS = 2.2;
const AXIS_TOP = 2.05;
/** Turn and tilt when the instrument is not following the landing story. */
const RESTING_YAW = 0;
const RESTING_PITCH = 0.2;
/** The story chapters in which the instrument answers to the page: it turns to the theme in focus, and keeps step. */
const THEMES_CHAPTER = chapterIndex("themes");
const STEPS_CHAPTER = chapterIndex("understanding");

export interface StoryInput {
  /** Chapter index plus progress towards the next. */
  position: number;
  /** Chapters per second. */
  velocity: number;
  /** Theme path in focus (0-based), or -1. */
  focus: number;
  /** Step in focus in the understanding chapter (0-based). */
  step: number;
  /** The invitation's visual region, where the story opens, once measured. */
  hero: HeroFrame | null;
}

export interface FrameInput {
  mode: SceneMode;
  time: number;
  delta: number;
  width: number;
  height: number;
  /** Jump straight to the resting pose (reduced motion, or a single on-demand frame). */
  snap: boolean;
  reducedMotion: boolean;
  pointer: { x: number; y: number };
  /** The landing story, when the hero is part of it. */
  story: StoryInput | null;
}

export class Armillary {
  readonly object = new THREE.Group();
  private readonly lights = new THREE.Group();
  /** Turn and tilt: the camera's view of the instrument, as the story moves around it. */
  private readonly view = new THREE.Group();
  private readonly sphere = new THREE.Group();
  private readonly bowl = new THREE.Group();
  private readonly meridian = new THREE.Group();
  private readonly ecliptic = new THREE.Group();
  private readonly innerA = new THREE.Group();
  private readonly innerB = new THREE.Group();
  private readonly core = new THREE.Group();
  private readonly beadA: THREE.Mesh;
  private readonly beadB: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly dust: THREE.Points;
  private readonly farDust: THREE.Points;

  private readonly ringMaterial = new THREE.MeshPhysicalMaterial({ metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  private readonly engraveMaterial = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.42 });
  private readonly tickMaterial = new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.35 });
  private readonly beadMaterial = new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.3, emissiveIntensity: 0.9 });
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly dustMaterial: THREE.ShaderMaterial;
  private readonly farDustMaterial: THREE.ShaderMaterial;
  private readonly hemi = new THREE.HemisphereLight();
  private readonly keyLight = new THREE.DirectionalLight();
  private readonly rimLight = new THREE.DirectionalLight();
  private readonly coreLight = new THREE.PointLight(0xffffff, 1, 4.5, 2);
  private readonly fog = new THREE.Fog(0x000000, CAMERA_Z, CAMERA_Z + 4);
  private readonly disposables: { dispose(): void }[] = [];
  private readonly environment: THREE.Texture;

  private palette: Palette = PALETTES.dark;
  private speed = 1;
  private glow = 1;
  private phase = 0;
  private stepAngle = 0;
  private settledFor = 0;
  /** Whether a frame has been drawn: the first is placed directly, over the still drawing it replaces. */
  private placed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    quality: SceneQuality,
  ) {
    const lite = quality === "lite";
    const segments = lite ? 110 : 220;

    // Studio-like reflections for the metal, generated on the GPU from a simple room.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.environment;
    scene.fog = this.fog;

    const ring = (
      radius: number,
      tube: number,
      radial: number,
      material: THREE.Material = this.ringMaterial,
      arc = Math.PI * 2,
      tubular = segments,
    ) => {
      const geometry = new THREE.TorusGeometry(radius, tube, radial, tubular, arc);
      this.disposables.push(geometry);
      return new THREE.Mesh(geometry, material);
    };
    const bead = (radius: number) => {
      const geometry = new THREE.SphereGeometry(radius, 20, 20);
      this.disposables.push(geometry);
      return new THREE.Mesh(geometry, this.beadMaterial);
    };
    const instanced = (matrices: THREE.Matrix4[], width: number) => {
      const geometry = new THREE.BoxGeometry(width, width, 1);
      this.disposables.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, this.tickMaterial, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    };

    // The sphere. Meridian: the graduated outer ring, turning about the axis.
    this.meridian.add(ring(OUTER_RADIUS, 0.016, 12), instanced(meridianTicks(lite ? 36 : 72), 0.007));
    this.meridian.rotation.y = 0.45;

    // Equator, at right angles to the axis.
    const equator = ring(OUTER_RADIUS * 0.985, 0.011, 10);
    equator.rotation.x = Math.PI / 2;

    // Ecliptic, inclined by the obliquity of the Earth's axis, with a bead keeping time.
    const eclipticPlane = new THREE.Group();
    eclipticPlane.rotation.x = Math.PI / 2 - OBLIQUITY;
    this.beadA = bead(0.045);
    eclipticPlane.add(ring(1.45, 0.009, 10), this.beadA);
    this.ecliptic.add(eclipticPlane);

    // Inner orbits.
    this.beadB = bead(0.032);
    this.innerA.add(ring(1.12, 0.008, 10), this.beadB);
    this.innerA.rotation.set(1.05, 0, 0.3);
    this.innerB.add(ring(0.78, 0.006, 8));
    this.innerB.rotation.set(-0.5, 0.2, 0.7);

    // The inner light: a soft-edged sphere, a halo and a warm point light.
    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uInner: { value: new THREE.Color() },
        uRim: { value: new THREE.Color() },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
    });
    const coreGeometry = new THREE.SphereGeometry(0.27, 48, 48);
    this.disposables.push(coreGeometry);
    this.core.add(new THREE.Mesh(coreGeometry, this.coreMaterial), this.coreLight);

    const haloTexture = radialTexture();
    this.disposables.push(haloTexture);
    this.haloMaterial = new THREE.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.scale.setScalar(2.6);

    this.sphere.add(this.meridian, equator, this.ecliptic, this.innerA, this.innerB, this.core, this.halo);

    // The axis, from the pivot at the bottom of the bowl through the poles to a finial.
    const axisLength = AXIS_TOP + BOWL_RADIUS;
    const axisGeometry = new THREE.CylinderGeometry(0.011, 0.011, axisLength, 10);
    this.disposables.push(axisGeometry);
    const axis = new THREE.Mesh(axisGeometry, this.ringMaterial);
    axis.position.y = AXIS_TOP - axisLength / 2;
    const knob = (radius: number) => {
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      this.disposables.push(geometry);
      return new THREE.Mesh(geometry, this.ringMaterial);
    };
    const finial = knob(0.042);
    finial.position.y = AXIS_TOP;
    const pivot = knob(0.055);
    pivot.position.y = -BOWL_RADIUS;

    // The bowl: a rim divided into nakshatras and their quarters, and a
    // hemisphere engraved with circles of altitude and lines of hour.
    const rim = ring(BOWL_RADIUS, 0.021, 10);
    rim.rotation.x = Math.PI / 2;
    this.bowl.add(rim, instanced(rimTicks(lite ? 27 : 108, BOWL_RADIUS), 0.008));
    for (const degrees of lite ? [30, 58, 78] : [22, 44, 64, 80]) {
      const polar = THREE.MathUtils.degToRad(degrees);
      const circle = ring(BOWL_RADIUS * Math.sin(polar), 0.006, 6, this.engraveMaterial);
      circle.rotation.x = Math.PI / 2;
      circle.position.y = -BOWL_RADIUS * Math.cos(polar);
      this.bowl.add(circle);
    }
    const hours = lite ? 8 : 12;
    for (let i = 0; i < hours; i++) {
      // A quarter circle from the bottom of the bowl up to the rim.
      const arc = ring(BOWL_RADIUS, 0.006, 6, this.engraveMaterial, Math.PI / 2, lite ? 32 : 56);
      arc.rotation.z = -Math.PI / 2;
      const meridianOfHour = new THREE.Group();
      meridianOfHour.rotation.y = (i / hours) * Math.PI * 2;
      meridianOfHour.add(arc);
      this.bowl.add(meridianOfHour);
    }

    const instrument = new THREE.Group();
    instrument.add(this.sphere, axis, finial, pivot, this.bowl);

    // Dust: a drifting cloud around the instrument, and a sparse far field that
    // stays put while the instrument turns, so the two move against each other.
    const dustGeometry = makeDust(lite ? 360 : 900, 7);
    const farGeometry = makeFarDust(lite ? 90 : 200, 11);
    this.disposables.push(dustGeometry, farGeometry);
    this.dustMaterial = dustShader(30, DUST_FADE_NEAR);
    this.farDustMaterial = dustShader(18, DUST_FADE_FAR);
    this.dust = new THREE.Points(dustGeometry, this.dustMaterial);
    this.farDust = new THREE.Points(farGeometry, this.farDustMaterial);

    this.view.add(instrument, this.dust);
    this.object.add(this.view, this.farDust);
    this.keyLight.position.set(3, 4, 5);
    this.rimLight.position.set(-4, -2, -3);
    this.lights.add(this.hemi, this.keyLight, this.rimLight);
    scene.add(this.lights, this.object);

    this.view.rotation.set(RESTING_PITCH, RESTING_YAW, 0);

    this.disposables.push(
      this.ringMaterial,
      this.engraveMaterial,
      this.tickMaterial,
      this.beadMaterial,
      this.haloMaterial,
      this.coreMaterial,
      this.dustMaterial,
      this.farDustMaterial,
    );
  }

  setTheme(theme: Theme) {
    const p = (this.palette = PALETTES[theme]);
    this.ringMaterial.color.set(p.ring);
    this.ringMaterial.roughness = p.ringRoughness;
    this.engraveMaterial.color.set(p.engrave);
    this.tickMaterial.color.set(p.tick);
    this.beadMaterial.color.set(p.bead);
    this.beadMaterial.emissive.set(p.bead);
    this.haloMaterial.color.set(p.halo);
    this.haloMaterial.blending = p.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.coreMaterial.uniforms.uInner.value.set(p.coreInner);
    this.coreMaterial.uniforms.uRim.value.set(p.coreRim);
    this.coreMaterial.uniforms.uIntensity.value = p.coreIntensity;
    for (const [material, opacity] of [
      [this.dustMaterial, p.dustOpacity],
      [this.farDustMaterial, p.dustOpacity * 0.55],
    ] as const) {
      material.uniforms.uColor.value.set(p.dust);
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      material.blending = p.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    }
    this.hemi.color.set(p.sky);
    this.hemi.groundColor.set(p.ground);
    this.hemi.intensity = p.hemiIntensity;
    this.keyLight.color.set(p.key);
    this.keyLight.intensity = p.keyIntensity;
    this.rimLight.color.set(p.rim);
    this.rimLight.intensity = p.rimIntensity;
    this.coreLight.color.set(p.coreLight);
    this.coreLight.intensity = p.coreLightIntensity;
    this.fog.color.set(p.fog);
    this.scene.environmentIntensity = p.envIntensity;
    this.renderer.toneMappingExposure = p.exposure;
  }

  /** Advance one frame. Returns true once the instrument rests where this mode places it. */
  update(input: FrameInput): boolean {
    const { mode, reducedMotion } = input;
    const snap = input.snap || !this.placed;
    this.placed = true;
    const dt = Math.min(input.delta, 1 / 20);
    const t = input.time;
    const story = mode === "hero" ? input.story : null;

    // Framing for this mode (or this moment of the story) and viewport. With
    // reduced motion the instrument keeps its first pose; only the page moves.
    // Beside a conversation it is placed in pixels, beside the reading column;
    // the story's poses come placed on the screen already.
    const aspect = input.width / Math.max(input.height, 1);
    const vh = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const vw = vh * aspect;
    const orientation = orientationFor(aspect, input.height);
    const view = { width: input.width, height: input.height, hero: story?.hero ?? null };
    const pose = story ? storyPose(reducedMotion ? 0 : story.position, orientation, view) : null;
    let diameter: number;
    let targetX: number;
    let targetY: number;
    if (mode === "thinking" || mode === "reading") {
      const place = conversationFraming(mode, input.width, input.height);
      diameter = (place.size / input.height) * vh;
      targetX = (place.x / input.width - 0.5) * vw;
      targetY = (0.5 - place.y / input.height) * vh;
    } else {
      const f: Framing = pose ?? SCENE_FRAMING[mode][orientation];
      diameter = orientation === "portrait" ? Math.min(f.d * vw, (f.dMax ?? 1) * vh) : f.d * vh;
      targetX = ((pose ? f.cx : frameCx(f.cx, input.width, FRAME_WIDTH)) - 0.5) * vw;
      targetY = (0.5 - f.cy) * vh;
    }
    const targetScale = diameter / (2 * INSTRUMENT_RADIUS);

    const root = this.object;
    if (snap) {
      root.position.set(targetX, targetY, 0);
      root.scale.setScalar(targetScale);
    } else {
      root.position.x = THREE.MathUtils.damp(root.position.x, targetX, DAMPING, dt);
      root.position.y = THREE.MathUtils.damp(root.position.y, targetY, DAMPING, dt);
      root.scale.setScalar(THREE.MathUtils.damp(root.scale.x, targetScale, DAMPING, dt));
    }
    const scale = root.scale.x;
    // Beads stay small when the instrument fills the screen.
    const beadScale = Math.min(1, 1.2 / Math.max(scale, 0.01));
    this.beadA.scale.setScalar(beadScale);
    this.beadB.scale.setScalar(beadScale);

    // Dust is drawn in pixels, so it follows the instrument's size on screen (900px tall is the reference).
    this.dustMaterial.uniforms.uScale.value = (scale * input.height) / 900;
    this.farDustMaterial.uniforms.uScale.value = (scale * input.height) / 900;

    // Depth: the far side of the instrument fades towards the page.
    this.fog.near = CAMERA_Z - INSTRUMENT_RADIUS * scale * 0.2;
    this.fog.far = CAMERA_Z + INSTRUMENT_RADIUS * scale * 1.4;

    // Turn and tilt. In the themes chapter the instrument turns to the path in
    // focus; the pointer adds a little parallax.
    let yaw = pose ? pose.yaw : RESTING_YAW;
    const pitch = pose ? pose.pitch : RESTING_PITCH;
    if (story && !reducedMotion && story.focus >= 0) {
      yaw += story.focus * (Math.PI / 3) * Math.max(0, 1 - Math.abs(story.position - THEMES_CHAPTER));
    }
    const pointer = reducedMotion ? { x: 0, y: 0 } : input.pointer;
    if (snap) {
      this.view.rotation.set(pitch, yaw, 0);
    } else {
      this.view.rotation.x = THREE.MathUtils.damp(this.view.rotation.x, pitch + pointer.y * 0.08, 2.5, dt);
      this.view.rotation.y = THREE.MathUtils.damp(this.view.rotation.y, yaw + pointer.x * 0.16, 2.5, dt);
      this.farDust.rotation.x = THREE.MathUtils.damp(this.farDust.rotation.x, pointer.y * 0.03, 2, dt);
      this.farDust.rotation.y = THREE.MathUtils.damp(this.farDust.rotation.y, pointer.x * 0.05, 2, dt);
    }

    // Scrolling quickens the rings a little, as if the instrument were being turned.
    const baseSpeed = mode === "thinking" ? 3.2 : mode === "reading" ? 0.35 : mode === "ambient" ? 0.6 : 1;
    const targetSpeed = baseSpeed + (story ? Math.min(Math.abs(story.velocity), 4) * 0.9 : 0);
    const targetGlow = (mode === "thinking" ? 1.35 : mode === "reading" ? 0.85 : 1) * (pose?.glow ?? 1);
    this.speed = snap ? targetSpeed : THREE.MathUtils.damp(this.speed, targetSpeed, 2.5, dt);
    this.glow = snap ? targetGlow : THREE.MathUtils.damp(this.glow, targetGlow, 3, dt);

    // In the understanding chapter, the ecliptic bead moves on a fifth of a turn per step.
    const targetStep =
      story && !reducedMotion
        ? story.step * ((Math.PI * 2) / 5) * Math.max(0, 1 - Math.abs(story.position - STEPS_CHAPTER))
        : 0;
    this.stepAngle = snap ? targetStep : THREE.MathUtils.damp(this.stepAngle, targetStep, 2, dt);

    if (reducedMotion) {
      // A considered still composition.
      this.meridian.rotation.y = 0.45;
      this.ecliptic.rotation.y = 0;
      this.innerA.rotation.set(1.05, 0, 0.3);
      this.innerB.rotation.set(-0.5, 0.2, 0.7);
      this.bowl.rotation.y = 0;
      this.dust.rotation.y = 0;
      placeOnRing(this.beadA, 1.45, 0.8);
      placeOnRing(this.beadB, 1.12, 2.6);
    } else {
      this.phase += dt * this.speed;
      const p = this.phase;
      this.meridian.rotation.y = 0.45 + p * 0.11;
      this.ecliptic.rotation.y = p * -0.05;
      this.innerA.rotation.set(1.05 + Math.sin(p * 0.21) * 0.08, p * 0.17, 0.3);
      this.innerB.rotation.set(-0.5, 0.2, 0.7 - p * 0.13);
      // The bowl's divisions precess very slowly, like the sky over a year.
      this.bowl.rotation.y = p * -0.012;
      placeOnRing(this.beadA, 1.45, p * 0.32 + this.stepAngle);
      placeOnRing(this.beadB, 1.12, 2 - p * 0.45);
      this.dust.rotation.y = p * 0.018;
      this.dustMaterial.uniforms.uTime.value = t;
      this.farDustMaterial.uniforms.uTime.value = t;
      this.coreMaterial.uniforms.uTime.value = t;
    }

    const pulse = reducedMotion ? 1 : mode === "thinking" ? 1 + Math.sin(t * 3.4) * 0.07 : 1 + Math.sin(t * 1.1) * 0.02;
    this.core.scale.setScalar(pulse);
    this.coreMaterial.uniforms.uIntensity.value = this.palette.coreIntensity * (0.75 + 0.25 * this.glow);
    this.coreLight.intensity = this.palette.coreLightIntensity * this.glow;
    this.haloMaterial.opacity = this.palette.haloOpacity * Math.min(this.glow, 1.4);
    this.halo.scale.setScalar(2.6 * this.glow * pulse);

    const near =
      Math.abs(root.position.x - targetX) + Math.abs(root.position.y - targetY) + Math.abs(scale - targetScale) < 0.003;
    this.settledFor = near ? this.settledFor + dt : 0;
    return input.snap || this.settledFor > 0.6;
  }

  /** Called when the mode changes, so a resting scene wakes up for the transition. */
  wake() {
    this.settledFor = 0;
  }

  dispose() {
    this.scene.remove(this.lights, this.object);
    if (this.scene.environment === this.environment) this.scene.environment = null;
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.environment.dispose();
    for (const item of this.disposables) item.dispose();
  }
}

function placeOnRing(object: THREE.Object3D, radius: number, angle: number) {
  object.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
}

/** Graduations on the meridian: a long mark every 30°, short marks between. */
function meridianTicks(count: number): THREE.Matrix4[] {
  const matrices: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  const majorEvery = count / 12;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const length = i % majorEvery === 0 ? 0.13 : 0.055;
    const r = OUTER_RADIUS + 0.035 + length / 2;
    position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
    // The marks are boxes whose length runs along z; lay them in the ring's plane, pointing outwards.
    rotation.setFromAxisAngle(axis, angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    scale.set(1, 1, length);
    matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
  }
  return matrices;
}

/**
 * Divisions on the rim of the bowl: one long mark for each of the 27
 * nakshatras, and short marks for their quarters (108 in all).
 */
function rimTicks(count: number, radius: number): THREE.Matrix4[] {
  const matrices: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const majorEvery = count / 27;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const length = i % majorEvery === 0 ? 0.17 : 0.07;
    const r = radius + 0.03 + length / 2;
    position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    // Point the box's length (z) outwards from the centre.
    rotation.setFromAxisAngle(up, Math.PI / 2 - angle);
    scale.set(1, 1, length);
    matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
  }
  return matrices;
}

/** Deterministic random numbers, so every visit composes the same way. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function pointsGeometry(positions: Float32Array, scales: Float32Array, phases: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geometry;
}

/** Dust around the instrument: a flattened shell, thickest near the rim of the bowl. */
function makeDust(count: number, seed: number): THREE.BufferGeometry {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    let x: number;
    let y: number;
    let z: number;
    if (i < count * 0.55) {
      // Settled in a band around the rim.
      const r = 2.45 + Math.pow(random(), 1.5) * 1.3;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = (random() + random() + random() - 1.5) * 0.22;
    } else {
      // Drifting in a loose shell around the sphere.
      const r = 2.3 + random() * 1.4;
      const u = random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      x = Math.cos(a) * s * r;
      y = u * r * 0.75;
      z = Math.sin(a) * s * r;
    }
    positions.set([x, y, z], i * 3);
    scales[i] = 0.45 + random() * 1.1;
    phases[i] = random() * Math.PI * 2;
  }
  return pointsGeometry(positions, scales, phases);
}

/** A sparse field around and behind the instrument, for depth. */
function makeFarDust(count: number, seed: number): THREE.BufferGeometry {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const r = 3.4 + random() * 3;
    const u = random() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    positions.set([Math.cos(a) * s * r * 1.25, u * r * 0.6, Math.sin(a) * s * r - 2.5], i * 3);
    scales[i] = 0.4 + random() * 0.9;
    phases[i] = random() * Math.PI * 2;
  }
  return pointsGeometry(positions, scales, phases);
}

/** A soft radial falloff, drawn once into a small canvas. */
function radialTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.22, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dustShader(size: number, fade: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 1 },
    },
    vertexShader: DUST_VERTEX.replace("/* fade */", fade),
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

// Near dust gathers around the instrument and thins out with distance; far dust stays faint.
const DUST_FADE_NEAR = "float fade = smoothstep(4.2, 2.6, length(position));";
const DUST_FADE_FAR = "float fade = 0.6 * smoothstep(7.5, 4.0, length(position));";

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uPixelRatio;
  attribute float aScale;
  attribute float aPhase;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    /* fade */
    vTwinkle = (0.55 + 0.45 * sin(uTime * 0.9 + aPhase)) * fade;
    gl_PointSize = max(uSize * aScale * uScale * uPixelRatio / max(-mv.z, 0.5), 1.0);
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.05, d) * vTwinkle * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uRim;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float facing = max(dot(n, normalize(vView)), 0.0);
    float rim = pow(1.0 - facing, 1.5);
    float light = 0.5 + 0.5 * dot(n, normalize(vec3(-0.45, 0.6, 0.65)));
    float shimmer = 0.025 * sin(uTime * 1.7 + n.y * 7.0 + n.x * 4.0);
    vec3 color = mix(uInner, uRim, rim) * (0.72 + 0.38 * light) * (uIntensity + shimmer);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
