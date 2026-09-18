"use client";

import { useEffect, useRef, useState } from "react";
import createGlobe, { type Arc, type Globe, type Marker } from "cobe";
import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  CanvasTexture,
  Clock,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  LinearFilter,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Spinner } from "@/components/ui/shadcn-io/spinner";
import { cdnUrl } from "@/lib/cdn-converter";
import { cn } from "@/lib/utils";

const MODEL_PATH = "vroid/みかん(Web).vrm";

const GLOBE_TEXTURE_SIZE = 1024;
const GLOBE_MAP_SAMPLES = 32000;
const GLOBE_TEXTURE_FILL = 0.76;
const GLOBE_SPIN = 0.005;
const GLOBE_THETA = 0.22;
const FOCUS_EASE = 3.2;
const FOCUS_SCALE = 3.4;
const MASK_SIZE = 256;
const GLOW_SPREAD = 1.26;
const GLOW_COLOR = "217, 115, 26";

const ZOOM_IN = 0.75;
const LINK_DRAW = 0.55;
const LINK_HOLD = 0.55;
const ZOOM_OUT = 0.75;
const LINK_WIDTH = 2.4;
const PULSE_WIDTH = 0.32;

const SIGNAL_LEG = 0.85;
const SIGNAL_STAGGER = 0.12;
const SIGNAL_HOLD = 0.7;
const SIGNAL_TRAIL = 0.22;
const FLASH_TIME = 0.7;
const FLASH_SIZE = 0.032;
const FLASH_FROM: [number, number, number] = [0.82, 0.38, 0.06];
const FLASH_TO: [number, number, number] = [0.16, 0.07, 0.01];
const GLOW_FADE = 0.9;
const POPOVER_GAP = 10;
const MARKER_LIFT = 0.1;
const GLOBE_SCALE = 2.4;
const GLOBE_TOP_OFFSET = 0.06;
const HAND_HUG = 0.16;
const GLOBE_CLEARANCE = 0.015;
const HAND_CLEARANCE = 0.035;

const INTRO_MATERIALIZE = 0.9;
const MATERIALIZE_MARGIN = 0.05;
const MATERIALIZE_OVERLAP = 0.02;
const BAND_PERIOD = 3;
const INTRO_ARMS = 1.15;
const INTRO_GLOBE_GAP = 0.1;
const INTRO_GLOBE = 1.15;
const LOOK_DOWN = 0.7;
const IDLE_FADE = 0.9;

const ARMS_START = INTRO_MATERIALIZE;
const GLOBE_START = ARMS_START + INTRO_ARMS + INTRO_GLOBE_GAP;
const GLOBE_END = GLOBE_START + INTRO_GLOBE;
const IDLE_START = GLOBE_END + LOOK_DOWN;

const CAMERA_FOV = 28;
const CAMERA_ORBIT = 0;
const FRAME_TOP_MARGIN = 0.1;
const FRAME_BOTTOM_MARGIN = 0.08;

export type VRMGlobeMood = "happy" | "neutral" | "concerned" | "critical";

const MOOD_EXPRESSIONS = ["happy", "relaxed", "sad", "angry", "surprised"] as const;

const MOODS: Record<VRMGlobeMood, Partial<Record<(typeof MOOD_EXPRESSIONS)[number], number>>> = {
  happy: { happy: 0.75, relaxed: 0.3 },
  neutral: { relaxed: 0.2 },
  concerned: { sad: 0.45 },
  critical: { sad: 0.8, angry: 0.25 },
};

const gazeYaw = (t: number) => Math.sin(t * 0.21) * 0.36 + Math.sin(t * 0.47) * 0.1;
const gazePitch = (t: number) => Math.sin(t * 0.17) * 0.12 + Math.sin(t * 0.31) * 0.04;

type Pose = (breath: number, sway: number, time: number, gaze: number) => [number, number, number];

const REST: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
  neck: [0, 0, 0],
  head: [0, 0, 0],
  leftShoulder: [0, 0, 0],
  rightShoulder: [0, 0, 0],
  leftUpperArm: [-0.4, 0, -1.16],
  rightUpperArm: [-0.4, 0, 1.16],
  leftLowerArm: [-0.2, -0.04, -0.2],
  rightLowerArm: [-0.2, 0.04, 0.2],
};

const ATTENTION_BONES = new Set<VRMHumanBoneName>(["neck", "head"]);

const FLICKER: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.04, 0.9],
  [0.08, 0.04],
  [0.2, 0],
  [0.24, 0.65],
  [0.28, 0.06],
  [0.37, 0],
  [0.41, 1],
  [0.46, 0.1],
  [0.52, 0.85],
  [0.56, 0.28],
  [0.62, 1],
  [0.67, 0.42],
  [0.72, 1],
];

const strike = (progress: number) => {
  let level = 0;
  for (const [at, value] of FLICKER) {
    if (progress < at) break;
    level = value;
  }
  return level;
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const easeOut = (value: number) => 1 - (1 - value) ** 3;

const POSE: Partial<Record<VRMHumanBoneName, Pose>> = {
  spine: (breath, sway) => [0.04 + breath * 0.006, sway * 0.012, 0],
  chest: (breath) => [0.03 + breath * 0.014, 0, 0],
  upperChest: (breath) => [breath * 0.008, 0, 0],
  neck: (breath, sway, t, gaze) => [
    0.1 - breath * 0.006 + gazePitch(t) * 0.35 * gaze,
    sway * 0.018 + gazeYaw(t) * 0.35 * gaze,
    0,
  ],
  head: (breath, sway, t, gaze) => [
    0.2 - breath * 0.005 + gazePitch(t) * 0.65 * gaze,
    sway * 0.026 + gazeYaw(t) * 0.65 * gaze,
    sway * 0.01 + gazeYaw(t) * 0.05 * gaze,
  ],
  leftShoulder: (breath) => [0, 0, -0.04 - breath * 0.012],
  rightShoulder: (breath) => [0, 0, 0.04 + breath * 0.012],
  leftUpperArm: (breath, sway) => [-0.45, -0.05, -0.26 - breath * 0.018 - sway * 0.012],
  rightUpperArm: (breath, sway) => [-0.45, 0.05, 0.26 + breath * 0.018 + sway * 0.012],
  leftLowerArm: (breath, sway) => [-0.12, -0.05, -0.4 - sway * 0.016],
  rightLowerArm: (breath, sway) => [-0.12, 0.05, 0.4 + sway * 0.016],
};

const FINGER_CURL = [
  ["Index", 0.1],
  ["Middle", 0.14],
  ["Ring", 0.2],
  ["Little", 0.26],
] as const;

function applyPose(
  vrm: VRM,
  time: number,
  reduced: boolean,
  sign: number,
  rise: number,
  attention: number,
  mood: VRMGlobeMood,
  gaze: number,
) {
  const breath = Math.sin(time * 1.5);
  const sway = Math.sin(time * 0.62);
  const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name);

  for (const [name, pose] of Object.entries(POSE) as [VRMHumanBoneName, Pose][]) {
    const [x, y, z] = pose(breath, sway, time, gaze);
    const rest = REST[name];
    const blend = ATTENTION_BONES.has(name) ? attention : rise;
    const rx = rest ? rest[0] + (x - rest[0]) * blend : x;
    const ry = rest ? rest[1] + (y - rest[1]) * blend : y;
    const rz = rest ? rest[2] + (z - rest[2]) * blend : z;
    bone(name)?.rotation.set(rx * sign, ry, rz * sign);
  }

  for (const [finger, curl] of FINGER_CURL) {
    bone(`left${finger}Proximal`)?.rotation.set(0, 0, -curl * sign);
    bone(`left${finger}Intermediate`)?.rotation.set(0, 0, -curl * 0.85 * sign);
    bone(`left${finger}Distal`)?.rotation.set(0, 0, -curl * 0.6 * sign);
    bone(`right${finger}Proximal`)?.rotation.set(0, 0, curl * sign);
    bone(`right${finger}Intermediate`)?.rotation.set(0, 0, curl * 0.85 * sign);
    bone(`right${finger}Distal`)?.rotation.set(0, 0, curl * 0.6 * sign);
  }

  bone("leftThumbMetacarpal")?.rotation.set(0.2 * sign, -0.5, -0.3 * sign);
  bone("leftThumbProximal")?.rotation.set(0, -0.25, -0.25 * sign);
  bone("leftThumbDistal")?.rotation.set(0, 0, -0.2 * sign);
  bone("rightThumbMetacarpal")?.rotation.set(0.2 * sign, 0.5, 0.3 * sign);
  bone("rightThumbProximal")?.rotation.set(0, 0.25, 0.25 * sign);
  bone("rightThumbDistal")?.rotation.set(0, 0, 0.2 * sign);

  const weights = MOODS[mood];
  for (const expression of MOOD_EXPRESSIONS) {
    vrm.expressionManager?.setValue(expression, (weights[expression] ?? 0) * rise);
  }

  const blink = time % 5.1;
  vrm.expressionManager?.setValue(
    "blink",
    reduced || blink > 0.18 ? 0 : Math.sin((blink / 0.18) * Math.PI),
  );
}

function measureAxisSign(vrm: VRM) {
  const shoulder = vrm.humanoid.getRawBoneNode("leftUpperArm");
  const hand = vrm.humanoid.getRawBoneNode("leftHand");
  if (!shoulder || !hand) return 1;

  for (const name of Object.keys(POSE) as VRMHumanBoneName[]) {
    vrm.humanoid.getNormalizedBoneNode(name)?.rotation.set(0, 0, 0);
  }
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);

  const from = vrm.scene.worldToLocal(shoulder.getWorldPosition(new Vector3()));
  const to = vrm.scene.worldToLocal(hand.getWorldPosition(new Vector3()));

  return to.x - from.x >= 0 ? 1 : -1;
}

function measureHeadTop(vrm: VRM) {
  const head = vrm.humanoid.getRawBoneNode("head");
  if (!head) return 0;
  vrm.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(vrm.scene);
  const headY = head.getWorldPosition(new Vector3()).y;
  return Math.max(box.max.y - headY, 0);
}

function measureTorsoHeight(vrm: VRM) {
  const hips = vrm.humanoid.getRawBoneNode("hips");
  const head = vrm.humanoid.getRawBoneNode("head");
  if (!hips || !head) return 1;
  vrm.scene.updateMatrixWorld(true);
  const hipsY = hips.getWorldPosition(new Vector3()).y;
  const headY = head.getWorldPosition(new Vector3()).y;
  return Math.max(headY - hipsY, 0.1);
}

const EMPTY_MARKERS: Marker[] = [];

export interface GlobeFocus {
  lat: number;
  lng: number;
  label?: string | null;
  icons?: string[];
}

function focusAngles(lat: number, lng: number): [number, number] {
  return [Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
}

export interface GlobeSignal {
  from: [number, number];
  hub: [number, number] | null;
  spokes: [number, number][];
}

function toUnit([lat, lng]: [number, number]): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

function alongGreatCircle(
  from: [number, number],
  to: [number, number],
  t: number,
): [number, number] {
  const a = toUnit(from);
  const b = toUnit(to);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return to;
  const sin = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sin;
  const wb = Math.sin(t * omega) / sin;
  const x = a[0] * wa + b[0] * wb;
  const y = a[1] * wa + b[1] * wb;
  const z = a[2] * wa + b[2] * wb;
  return [
    (Math.asin(Math.min(1, Math.max(-1, z))) * 180) / Math.PI,
    (Math.atan2(y, x) * 180) / Math.PI,
  ];
}

function sameSpot(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function signalCycle(signal: GlobeSignal, hasLeadIn: boolean) {
  const spread = Math.max(0, signal.spokes.length - 1) * SIGNAL_STAGGER;
  const leg = SIGNAL_LEG * (1 + SIGNAL_TRAIL);
  return (hasLeadIn ? leg : 0) + spread + leg + SIGNAL_HOLD;
}

function pulse(from: [number, number], to: [number, number], progress: number): Arc | null {
  const head = Math.min(1, progress);
  const tail = Math.max(0, progress - SIGNAL_TRAIL);
  if (head <= tail) return null;
  return {
    from: alongGreatCircle(from, to, tail),
    to: alongGreatCircle(from, to, head),
  };
}

function buildArcs(signal: GlobeSignal, elapsed: number): Arc[] {
  const hub = signal.hub ?? signal.from;
  const hasLeadIn = !sameSpot(signal.from, hub);
  const leg = SIGNAL_LEG * (1 + SIGNAL_TRAIL);
  const t = elapsed % signalCycle(signal, hasLeadIn);
  const arcs: Arc[] = [];

  if (hasLeadIn) {
    const lead = pulse(signal.from, hub, (t / SIGNAL_LEG) * (1 + SIGNAL_TRAIL));
    if (lead) arcs.push(lead);
  }

  const after = hasLeadIn ? t - leg : t;
  if (after > 0) {
    signal.spokes.forEach((spoke, index) => {
      const progress = ((after - index * SIGNAL_STAGGER) / SIGNAL_LEG) * (1 + SIGNAL_TRAIL);
      if (progress <= 0) return;
      const hop = pulse(hub, spoke, progress);
      if (hop) arcs.push(hop);
    });
  }

  return arcs;
}

function buildFlashes(signal: GlobeSignal, elapsed: number): Marker[] {
  const hub = signal.hub ?? signal.from;
  const hasLeadIn = !sameSpot(signal.from, hub);
  const t = elapsed % signalCycle(signal, hasLeadIn);
  const after = hasLeadIn ? t - SIGNAL_LEG * (1 + SIGNAL_TRAIL) : t;
  const landing = SIGNAL_LEG / (1 + SIGNAL_TRAIL);
  const flashes: Marker[] = [];

  signal.spokes.forEach((spoke, index) => {
    const age = after - (index * SIGNAL_STAGGER + landing);
    if (age < 0 || age > FLASH_TIME) return;
    const fade = age / FLASH_TIME;
    flashes.push({
      location: spoke,
      size: FLASH_SIZE,
      color: [
        FLASH_FROM[0] + (FLASH_TO[0] - FLASH_FROM[0]) * fade,
        FLASH_FROM[1] + (FLASH_TO[1] - FLASH_FROM[1]) * fade,
        FLASH_FROM[2] + (FLASH_TO[2] - FLASH_FROM[2]) * fade,
      ],
    });
  });

  return flashes;
}

function shortestTurn(from: number, to: number): number {
  const full = Math.PI * 2;
  return ((((to - from) % full) + full + Math.PI) % full) - Math.PI;
}

export function VRMGlobe({
  className,
  mood = "happy",
  markers = EMPTY_MARKERS,
  focus = null,
  signal = null,
  onIntroComplete,
}: {
  className?: string;
  mood?: VRMGlobeMood;
  markers?: Marker[];
  focus?: GlobeFocus | null;
  signal?: GlobeSignal | null;
  onIntroComplete?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focus);
  const signalRef = useRef(signal);
  const moodRef = useRef(mood);
  const markersRef = useRef(markers);
  const globeRef = useRef<Globe | null>(null);
  const introCompleteRef = useRef(onIntroComplete);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  useEffect(() => {
    signalRef.current = signal;
  }, [signal]);

  useEffect(() => {
    introCompleteRef.current = onIntroComplete;
  }, [onIntroComplete]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    const onMotionChange = () => {
      reduced = motionQuery.matches;
    };
    motionQuery.addEventListener("change", onMotionChange);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);

    scene.add(new AmbientLight(0xffffff, 2));
    const keyLight = new DirectionalLight(0xffe0b5, 1.5);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);

    const globeCanvas = document.createElement("canvas");
    globeCanvas.width = GLOBE_TEXTURE_SIZE;
    globeCanvas.height = GLOBE_TEXTURE_SIZE;

    const globe = createGlobe(globeCanvas, {
      devicePixelRatio: 1,
      width: GLOBE_TEXTURE_SIZE,
      height: GLOBE_TEXTURE_SIZE,
      phi: 0,
      theta: GLOBE_THETA,
      dark: 1,
      diffuse: 1.2,
      scale: 1,
      mapSamples: GLOBE_MAP_SAMPLES,
      mapBrightness: 6.5,
      baseColor: [0.45, 0.26, 0.05],
      markerColor: [1, 0.72, 0.16],
      glowColor: [0.85, 0.45, 0.1],
      markers: markersRef.current,
      arcs: [],
      arcColor: [1, 0.78, 0.35],
      arcWidth: 0.55,
      arcHeight: 0.12,
    });
    globeRef.current = globe;

    const texture = new CanvasTexture(globeCanvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.repeat.set(GLOBE_TEXTURE_FILL, GLOBE_TEXTURE_FILL);
    texture.offset.set((1 - GLOBE_TEXTURE_FILL) / 2, (1 - GLOBE_TEXTURE_FILL) / 2);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = MASK_SIZE;
    maskCanvas.height = MASK_SIZE;
    const maskContext = maskCanvas.getContext("2d");
    if (maskContext) {
      const half = MASK_SIZE / 2;
      const gradient = maskContext.createRadialGradient(half, half, 0, half, half, half);
      gradient.addColorStop(0.96, "#ffffff");
      gradient.addColorStop(1, "#000000");
      maskContext.fillStyle = gradient;
      maskContext.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    }
    const maskTexture = new CanvasTexture(maskCanvas);

    const globeGeometry = new PlaneGeometry(1, 1);
    const globeMaterial = new MeshBasicMaterial({
      map: texture,
      alphaMap: maskTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const globeMesh = new Mesh(globeGeometry, globeMaterial);
    globeMesh.visible = false;
    scene.add(globeMesh);

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = MASK_SIZE;
    glowCanvas.height = MASK_SIZE;
    const glowContext = glowCanvas.getContext("2d");
    if (glowContext) {
      const half = MASK_SIZE / 2;
      const edge = 1 / GLOW_SPREAD;
      const gradient = glowContext.createRadialGradient(half, half, 0, half, half, half);
      gradient.addColorStop(0, `rgba(${GLOW_COLOR}, 0)`);
      gradient.addColorStop(edge * 0.985, `rgba(${GLOW_COLOR}, 0)`);
      gradient.addColorStop(edge, `rgba(${GLOW_COLOR}, 0.95)`);
      gradient.addColorStop(edge + (1 - edge) * 0.18, `rgba(${GLOW_COLOR}, 0.34)`);
      gradient.addColorStop(edge + (1 - edge) * 0.5, `rgba(${GLOW_COLOR}, 0.07)`);
      gradient.addColorStop(1, `rgba(${GLOW_COLOR}, 0)`);
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    }
    const glowTexture = new CanvasTexture(glowCanvas);
    glowTexture.colorSpace = SRGBColorSpace;

    const glowGeometry = new PlaneGeometry(1, 1);
    const glowMaterial = new MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
    const glowMesh = new Mesh(glowGeometry, glowMaterial);
    glowMesh.visible = false;
    scene.add(glowMesh);

    const globeCentre = new Vector3();
    const aim = new Vector3();
    const handWorld = new Vector3();
    const radial = new Vector3();
    const tangent = new Vector3();
    const gazeTarget = new Vector3();
    const ahead = new Vector3();
    const aimed = new Quaternion();
    const chestPos = new Vector3();
    const fingerAxis = new Vector3();
    let globePlaced = false;
    let globeRadius = 0;
    let introElapsed = 0;
    const left = new Vector3();
    const right = new Vector3();
    const centre = new Vector3();
    const headPos = new Vector3();
    const clock = new Clock();

    let vrm: VRM | null = null;
    let axisSign = 1;
    let headTopOffset = 0;
    let torsoHeight = 1;
    let bodyFrontZ = 0;
    let bodyMinY = 0;
    let bodyMaxY = 1;
    const revealTop = new Plane(new Vector3(0, 1, 0), 0);
    const revealBottom = new Plane(new Vector3(0, -1, 0), 0);

    const setReveal = (progress: number) => {
      const mid = (bodyMinY + bodyMaxY) * 0.5;
      const from = bodyMaxY + MATERIALIZE_MARGIN;
      const to = bodyMinY - MATERIALIZE_MARGIN;
      revealTop.constant = -(from + (mid - MATERIALIZE_OVERLAP - from) * progress);
      revealBottom.constant = to + (mid + MATERIALIZE_OVERLAP - to) * progress;
    };

    const setBands = (progress: number) => {
      const style = renderer.domElement.style;
      if (progress >= 1) {
        style.removeProperty("mask-image");
        style.removeProperty("-webkit-mask-image");
        return;
      }
      const duty = BAND_PERIOD * progress;
      const bands = `repeating-linear-gradient(to bottom, #000 0 ${duty}px, transparent ${duty}px ${BAND_PERIOD}px)`;
      style.setProperty("mask-image", bands);
      style.setProperty("-webkit-mask-image", bands);
    };
    let frame = 0;
    let phi = 0;
    let theta = GLOBE_THETA;
    let zoom = 0;
    let signalTime = 0;
    let phase: "idle" | "in" | "hold" | "link" | "out" | "pulse" = "idle";
    let phaseTime = 0;
    let arcWidthNow = PULSE_WIDTH;
    let flashing = false;
    let popoverFade = 0;
    const screenPoint = new Vector3();
    const screenEdge = new Vector3();
    let disposed = false;
    let introSignalled = false;

    const signalIntroComplete = () => {
      if (introSignalled) return;
      introSignalled = true;
      introCompleteRef.current?.();
    };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const render = () => {
      frame = requestAnimationFrame(render);
      const delta = Math.min(clock.getDelta(), 0.05);

      const focus = focusRef.current;
      const ease = Math.min(1, delta * FOCUS_EASE);

      if (!focus) {
        if (phase !== "idle") {
          phase = "idle";
          phaseTime = 0;
          signalTime = 0;
          flashing = false;
          globe.update({ arcs: [], markers: markersRef.current });
        }
      } else if (phase === "idle") {
        phase = "in";
        phaseTime = 0;
      }

      if (phase !== "idle") {
        phaseTime += delta;
        if (phase === "in" && phaseTime >= ZOOM_IN) {
          phase = signalRef.current ? "link" : "hold";
          phaseTime = 0;
        } else if (phase === "link" && phaseTime >= LINK_DRAW + LINK_HOLD) {
          phase = "out";
          phaseTime = 0;
        } else if (phase === "out" && phaseTime >= ZOOM_OUT) {
          phase = "pulse";
          phaseTime = 0;
        }
      }

      if (phase === "in") {
        zoom = easeOut(clamp01(phaseTime / ZOOM_IN));
      } else if (phase === "link" || phase === "hold") {
        zoom = 1;
      } else if (phase === "out") {
        zoom = 1 - easeOut(clamp01(phaseTime / ZOOM_OUT));
      } else {
        zoom += (0 - zoom) * ease;
      }

      const signalNow = focus ? signalRef.current : null;
      let nextWidth = arcWidthNow;

      if (signalNow) {
        const hub = signalNow.hub ?? signalNow.from;
        if (phase === "link" || phase === "out") {
          nextWidth = LINK_WIDTH;
          const grow = phase === "link" ? clamp01(phaseTime / LINK_DRAW) : 1;
          globe.update({
            arcs: sameSpot(signalNow.from, hub)
              ? []
              : [{ from: signalNow.from, to: alongGreatCircle(signalNow.from, hub, grow) }],
          });
        } else if (phase === "pulse") {
          nextWidth = PULSE_WIDTH;
          signalTime += delta;
          const pulseSignal = { from: hub, hub, spokes: signalNow.spokes };
          const flashes = buildFlashes(pulseSignal, signalTime);
          globe.update({
            arcs: buildArcs(pulseSignal, signalTime),
            markers: flashes.length > 0 ? [...markersRef.current, ...flashes] : markersRef.current,
          });
          flashing = flashes.length > 0;
        } else if (flashing) {
          flashing = false;
          globe.update({ markers: markersRef.current });
        }
      }

      if (nextWidth !== arcWidthNow) {
        arcWidthNow = nextWidth;
        globe.update({ arcWidth: arcWidthNow });
      }

      if (focus) {
        const [targetPhi, targetTheta] = focusAngles(focus.lat, focus.lng);
        phi += shortestTurn(phi, targetPhi) * ease;
        theta += (targetTheta - theta) * ease;
      } else if (!reduced) {
        phi += GLOBE_SPIN;
        theta += (GLOBE_THETA - theta) * ease;
      }

      globe.update({ phi, theta, scale: 1 + zoom * (FOCUS_SCALE - 1) });
      texture.needsUpdate = true;

      if (vrm) {
        introElapsed += delta;
        const materialize = reduced ? 1 : easeOut(clamp01(introElapsed / INTRO_MATERIALIZE));
        setReveal(materialize);
        setBands(materialize);

        const rise = reduced ? 1 : easeOut(clamp01((introElapsed - ARMS_START) / INTRO_ARMS));
        const bloom = reduced
          ? 1
          : strike(clamp01((introElapsed - GLOBE_START) / INTRO_GLOBE));

        const attention = reduced ? 1 : easeOut(clamp01((introElapsed - GLOBE_END) / LOOK_DOWN));

        const idle = reduced ? 1 : easeOut(clamp01((introElapsed - IDLE_START) / IDLE_FADE));

        if (reduced || introElapsed >= IDLE_START) signalIntroComplete();

        applyPose(
          vrm,
          reduced ? 0 : clock.elapsedTime,
          reduced,
          axisSign,
          rise,
          attention,
          moodRef.current,
          idle,
        );

        if (globePlaced) {
          for (const [name, direction] of [
            ["leftHand", axisSign],
            ["rightHand", -axisSign],
          ] as const) {
            const hand = vrm.humanoid.getNormalizedBoneNode(name);
            if (!hand?.parent) continue;
            hand.getWorldPosition(handWorld);

            radial.copy(handWorld).sub(globeCentre);
            if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
            radial.normalize();

            tangent.set(0, -1, 0);
            tangent.addScaledVector(radial, -tangent.dot(radial));
            if (tangent.lengthSq() < 1e-6) tangent.set(0, -1, 0);
            tangent.normalize().addScaledVector(radial, -HAND_HUG).normalize();

            aim.copy(handWorld).add(tangent);
            hand.parent.worldToLocal(aim).sub(hand.position).normalize();
            fingerAxis.set(direction, 0, 0);
            hand.quaternion.identity();
            aimed.setFromUnitVectors(fingerAxis, aim);
            hand.quaternion.slerp(aimed, rise);
          }
        }

        if (globePlaced && vrm.lookAt) {
          const gazeTime = reduced ? 0 : clock.elapsedTime;
          gazeTarget.set(
            globeCentre.x + Math.sin(gazeYaw(gazeTime)) * globeRadius * 1.2,
            globeCentre.y + globeRadius * (0.5 + gazePitch(gazeTime) * 1.5),
            globeCentre.z + globeRadius * 0.85,
          );
          ahead.copy(camera.position);
          gazeTarget.lerp(ahead, 1 - attention);
          vrm.lookAt.lookAt(gazeTarget);
        }

        vrm.update(delta);
        vrm.scene.updateMatrixWorld(true);

        const leftHand = vrm.humanoid.getRawBoneNode("leftHand");
        const rightHand = vrm.humanoid.getRawBoneNode("rightHand");
        const head = vrm.humanoid.getRawBoneNode("head");

        if (leftHand && rightHand && head) {
          leftHand.getWorldPosition(left);
          rightHand.getWorldPosition(right);
          head.getWorldPosition(headPos);
          centre.addVectors(left, right).multiplyScalar(0.5);

          const span = torsoHeight * GLOBE_SCALE;
          const radius = span * 0.5;

          const chest =
            vrm.humanoid.getRawBoneNode("chest") ??
            vrm.humanoid.getRawBoneNode("upperChest") ??
            vrm.humanoid.getRawBoneNode("spine");
          if (chest) chest.getWorldPosition(chestPos);
          const globeY = chestPos.y + GLOBE_TOP_OFFSET - radius;
          const globeZ = Math.max(centre.z - HAND_CLEARANCE, bodyFrontZ + GLOBE_CLEARANCE);
          globeMesh.position.set(chestPos.x, globeY, globeZ);
          globeMaterial.opacity = bloom;
          globeMesh.scale.setScalar(span);
          glowMesh.position.copy(globeMesh.position);
          glowMesh.scale.setScalar(span * GLOW_SPREAD);
          const glowIn = reduced
            ? 1
            : easeOut(clamp01((introElapsed - GLOBE_END) / GLOW_FADE));
          glowMaterial.opacity = glowIn;
          glowMesh.visible = glowIn > 0.001;
          globeMesh.visible = bloom > 0.001;
          globeCentre.copy(globeMesh.position);
          globeRadius = radius;
          globePlaced = true;

          const rawTop = Math.max(headPos.y + headTopOffset, globeY + radius);
          const rawBottom = globeY - radius;
          const extent = Math.max(rawTop - rawBottom, 0.1);
          const top = rawTop + extent * FRAME_TOP_MARGIN;
          const bottom = rawBottom - extent * FRAME_BOTTOM_MARGIN;
          const mid = (top + bottom) * 0.5;
          const half = (top - bottom) * 0.5;
          const distance = half / Math.tan((camera.fov * Math.PI) / 360);

          const planeZ = globeMesh.position.z;
          const orbit = CAMERA_ORBIT * rise;
          camera.position.set(
            chestPos.x + Math.sin(orbit) * distance,
            mid,
            planeZ + Math.cos(orbit) * distance,
          );
          camera.lookAt(chestPos.x, mid, planeZ);
          globeMesh.quaternion.copy(camera.quaternion);
          glowMesh.quaternion.copy(camera.quaternion);

          const popover = popoverRef.current;
          if (popover) {
            const popoverTarget =
              !focus || phase === "idle" || phase === "in" ? 0 : clamp01(zoom * 1.4 - 0.4);
            popoverFade += (popoverTarget - popoverFade) * Math.min(1, delta * 9);

            if (popoverFade < 0.01) {
              popover.style.opacity = "0";
            } else {
              screenPoint.copy(globeCentre).project(camera);
              screenEdge.set(globeCentre.x, globeCentre.y + globeRadius, globeCentre.z);
              screenEdge.project(camera);
              const width = renderer.domElement.clientWidth;
              const height = renderer.domElement.clientHeight;
              const x = (screenPoint.x * 0.5 + 0.5) * width;
              const y = (-screenPoint.y * 0.5 + 0.5) * height;
              const top = (-screenEdge.y * 0.5 + 0.5) * height;
              const lift = Math.abs(y - top) * MARKER_LIFT + POPOVER_GAP;
              popover.style.opacity = String(popoverFade);
              popover.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - lift}px)`;
            }
          }
        }
      }

      renderer.render(scene, camera);
    };

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      cdnUrl(MODEL_PATH),
      (gltf: GLTF) => {
        const loaded = gltf.userData.vrm as VRM;
        if (disposed) {
          VRMUtils.deepDispose(loaded.scene);
          return;
        }
        VRMUtils.rotateVRM0(loaded);
        VRMUtils.combineSkeletons(loaded.scene);
        loaded.scene.traverse((object) => {
          object.frustumCulled = false;
          if (!(object instanceof Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.clippingPlanes = [revealTop, revealBottom];
            material.clipIntersection = true;
          }
        });
        axisSign = measureAxisSign(loaded);
        headTopOffset = measureHeadTop(loaded);
        torsoHeight = measureTorsoHeight(loaded);
        const bounds = new Box3().setFromObject(loaded.scene);
        bodyFrontZ = bounds.max.z;
        bodyMinY = bounds.min.y;
        bodyMaxY = Math.max(bounds.max.y, bounds.min.y + 0.1);
        setReveal(0);
        vrm = loaded;
        scene.add(loaded.scene);
        setReady(true);
      },
      undefined,
      (error) => {
        console.error("Failed to load VRM model:", error);
        if (disposed) return;
        setFailed(true);
        signalIntroComplete();
      },
    );

    resize();
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      setBands(1);
      globeRef.current = null;
      globe.destroy();
      texture.dispose();
      maskTexture.dispose();
      glowTexture.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      globeGeometry.dispose();
      globeMaterial.dispose();
      if (vrm) VRMUtils.deepDispose(vrm.scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const markerSignature = markers
    .map(
      (marker) =>
        `${marker.location[0]},${marker.location[1]},${marker.size},${marker.color?.join(",") ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    markersRef.current = markers;
    globeRef.current?.update({ markers });
  }, [markerSignature, markers]);

  return (
    <div className={cn("relative h-[560px] w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />

      <div
        ref={popoverRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 opacity-0"
      >
        <div className="rounded-lg border border-primary/40 bg-background/90 px-3 py-1.5 text-center shadow-lg backdrop-blur-sm">
          {focus?.icons && focus.icons.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {focus.icons.map((icon, index) => (
                <img
                  key={icon}
                  src={icon}
                  alt=""
                  loading="lazy"
                  style={{ animationDelay: `${index * 0.11}s` }}
                  className="size-5 shrink-0 rounded-sm motion-safe:animate-[icon-bounce_0.85s_ease-in-out_infinite]"
                />
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-foreground">{focus?.label ?? ""}</p>
          )}
        </div>
        <div className="mx-auto size-2 -translate-y-1 rotate-45 border-r border-b border-primary/40 bg-background/90" />
      </div>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          {failed ? (
            <p className="text-sm text-muted-foreground">Could not load the model.</p>
          ) : (
            <Spinner className="size-8 text-primary" />
          )}
        </div>
      )}
    </div>
  );
}
