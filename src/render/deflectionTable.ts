import * as THREE from "three";
import { deflectionAngle } from "../physics/deflection";

export interface DeflectionTable {
  texture: THREE.DataTexture;
  logBMin: number;
  logBMax: number;
}

/**
 * Precomputes deflectionAngle(massKg, b) — the same weak-field formula
 * validated against the solar-limb deflection in Stage 1 — over a
 * log-spaced range of impact parameters, and uploads it as a 1D-ish
 * texture. The fragment shader samples this instead of recomputing the
 * closed-form division per pixel, matching the project's "lookup table
 * for real-time" approach to the deflection calculation.
 */
export function buildDeflectionTable(
  massKg: number,
  bMinM: number,
  bMaxM: number,
  samples = 1024,
): DeflectionTable {
  const logBMin = Math.log(bMinM);
  const logBMax = Math.log(bMaxM);
  const data = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const b = Math.exp(logBMin + t * (logBMax - logBMin));
    data[i] = deflectionAngle(massKg, b);
  }

  const texture = new THREE.DataTexture(data, samples, 1, THREE.RedFormat, THREE.FloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return { texture, logBMin, logBMax };
}
