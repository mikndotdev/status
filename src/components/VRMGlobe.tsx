"use client";

import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";
import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Clock,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
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

const GLOBE_TEXTURE_SIZE = 512;
const GLOBE_TEXTURE_FILL = 0.76;
const GLOBE_SPIN = 0.005;
const GLOBE_SCALE = 2.4;
const GLOBE_TOP_OFFSET = 0.06;
const HAND_HUG = 0.16;
const GLOBE_CLEARANCE = 0.015;
const HAND_CLEARANCE = 0.035;

const INTRO_ARMS = 1.15;
const INTRO_GLOBE_DELAY = 1.25;
const INTRO_GLOBE = 1.15;

const IDLE_START = INTRO_GLOBE_DELAY + INTRO_GLOBE;
const IDLE_FADE = 0.9;

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
  leftUpperArm: [0, 0, -1.46],
  rightUpperArm: [0, 0, 1.46],
  leftLowerArm: [0, -0.04, -0.03],
  rightLowerArm: [0, 0.04, 0.03],
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

const MARKERS = [
  { location: [35.6762, 139.6503] as [number, number], size: 0.09 },
  { location: [34.6937, 135.5023] as [number, number], size: 0.05 },
  { location: [1.3521, 103.8198] as [number, number], size: 0.06 },
  { location: [50.1109, 8.6821] as [number, number], size: 0.06 },
  { location: [51.5074, -0.1278] as [number, number], size: 0.05 },
  { location: [40.7128, -74.006] as [number, number], size: 0.06 },
  { location: [37.7595, -122.4367] as [number, number], size: 0.06 },
  { location: [-33.8688, 151.2093] as [number, number], size: 0.05 },
];

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

export function VRMGlobe({
  className,
  mood = "happy",
  onIntroComplete,
}: {
  className?: string;
  mood?: VRMGlobeMood;
  onIntroComplete?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const introCompleteRef = useRef(onIntroComplete);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

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
      theta: 0.22,
      dark: 1,
      diffuse: 1.2,
      scale: 1,
      mapSamples: 16000,
      mapBrightness: 6.5,
      baseColor: [0.45, 0.26, 0.05],
      markerColor: [1, 0.72, 0.16],
      glowColor: [0.85, 0.45, 0.1],
      markers: MARKERS,
    });

    const texture = new CanvasTexture(globeCanvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const globeGeometry = new PlaneGeometry(1, 1);
    const globeMaterial = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const globeMesh = new Mesh(globeGeometry, globeMaterial);
    globeMesh.visible = false;
    scene.add(globeMesh);

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
    let frame = 0;
    let phi = 0;
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

      if (!reduced) {
        phi += GLOBE_SPIN;
        globe.update({ phi });
        texture.needsUpdate = true;
      }

      if (vrm) {
        introElapsed += delta;
        const rise = reduced ? 1 : easeOut(clamp01(introElapsed / INTRO_ARMS));
        const bloom = reduced
          ? 1
          : strike(clamp01((introElapsed - INTRO_GLOBE_DELAY) / INTRO_GLOBE));

        const attention = reduced
          ? 1
          : easeOut(clamp01((introElapsed - INTRO_GLOBE_DELAY) / INTRO_GLOBE));

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
          globeMesh.scale.setScalar(span / GLOBE_TEXTURE_FILL);
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
        });
        axisSign = measureAxisSign(loaded);
        headTopOffset = measureHeadTop(loaded);
        torsoHeight = measureTorsoHeight(loaded);
        bodyFrontZ = new Box3().setFromObject(loaded.scene).max.z;
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
      globe.destroy();
      texture.dispose();
      globeGeometry.dispose();
      globeMaterial.dispose();
      if (vrm) VRMUtils.deepDispose(vrm.scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={cn("relative h-[560px] w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />
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
