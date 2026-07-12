import { AU } from "../physics/constants";
import type { SceneState } from "./sceneState";

export interface Preset {
  id: string;
  name: string;
  state: SceneState;
}

function baseCamera(): SceneState["camera"] {
  return {
    distanceObserverLensM: 1000 * AU,
    distanceObserverSourceM: 2000 * AU,
    zoom: 1,
    pan: { x: 0, y: 0 },
  };
}

// Hardcoded SceneState snapshots — deliberately not a generic "preset
// system," per the stage's scope fence. Each is just a plain object;
// selecting one replaces SceneState wholesale.
export const PRESETS: Preset[] = [
  {
    id: "einstein-ring",
    name: "Einstein Ring",
    state: {
      objects: [{ massSolarMasses: 1e6, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }],
      camera: baseCamera(),
      background: { type: "starfield" },
      quality: "fast",
    },
  },
  {
    id: "orbiting-binary",
    name: "Orbiting Binary",
    state: {
      // Symmetric positions with opposing tangential velocities — each
      // object just drifts in a straight line at constant velocity (the
      // existing single-object drift mechanism, applied per-object).
      // There's no actual gravity between the two lenses, so this reads
      // as "orbiting" only briefly; it's linear drift, not a real
      // two-body orbit.
      objects: [
        { massSolarMasses: 3e5, position: { x: -0.2, y: 0 }, velocity: { x: 0, y: 0.015 } },
        { massSolarMasses: 3e5, position: { x: 0.2, y: 0 }, velocity: { x: 0, y: -0.015 } },
      ],
      camera: baseCamera(),
      background: { type: "starfield" },
      quality: "fast",
    },
  },
  {
    id: "black-hole-shadow",
    name: "Black Hole Shadow",
    state: {
      objects: [{ massSolarMasses: 5e8, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }],
      camera: { ...baseCamera(), zoom: 2.5 },
      background: { type: "starfield" },
      quality: "fast",
    },
  },
  {
    id: "off-axis-microlensing",
    name: "Off-Axis Microlensing",
    state: {
      objects: [{ massSolarMasses: 5e3, position: { x: 0.3, y: 0.15 }, velocity: { x: 0, y: 0 } }],
      camera: { ...baseCamera(), zoom: 1.5 },
      background: { type: "starfield" },
      quality: "fast",
    },
  },
  {
    id: "lensed-galaxy",
    name: "Lensed Galaxy",
    state: {
      objects: [{ massSolarMasses: 2e7, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }],
      camera: baseCamera(),
      background: { type: "sdss", target: "whirlpool" },
      quality: "fast",
    },
  },
];
