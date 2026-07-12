import * as THREE from "three";
import { schwarzschildRadius, shadowAngularRadius } from "../physics/deflection";
import { buildDeflectionTable, type DeflectionTable } from "./deflectionTable";
import fragmentShader from "./shaders/lens.frag.glsl?raw";
import vertexShader from "./shaders/lens.vert.glsl?raw";

export interface PointMassLensConfig {
  massKg: number;
  angularPosition: { x: number; y: number };
}

export interface LensSceneCameraConfig {
  distanceObserverLensM: number;
  distanceObserverSourceM: number;
  /** Full angular width of the rendered view, radians. */
  fieldOfViewRad: number;
}

export type BackgroundConfig =
  { mode: "starfield" } | { mode: "texture"; texture: THREE.Texture; scaleRad: number };

export interface LensScene {
  setSize(width: number, height: number): void;
  /** Pushes a new lens/camera configuration to the shader's uniforms. */
  update(lens: PointMassLensConfig, camera: LensSceneCameraConfig): void;
  /** Switches the background source the shader samples for unlensed sky. */
  setBackground(background: BackgroundConfig): void;
  render(): void;
  dispose(): void;
}

// A 1x1 dark fallback texture bound to the sampler at all times, so the
// uniform is never null — starfield mode never actually samples it, but
// leaving a sampler unbound is asking for driver-specific warnings.
function createFallbackTexture(): THREE.DataTexture {
  const data = new Uint8Array([5, 5, 9, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sets up a Three.js full-screen-quad scene that runs the point-lens
 * equation from src/physics/ as a GLSL fragment shader, so the same
 * deflection math from Stage 1 renders at interactive framerates instead
 * of a few seconds per frame on the CPU.
 */
export function createLensScene(canvas: HTMLCanvasElement): LensScene {
  // preserveDrawingBuffer is required for the screenshot-export feature
  // planned in the frontend spec, and it also makes the canvas readable
  // for pixel-level testing/debugging; the cost is negligible for a
  // single full-screen-quad shader with no extra render passes.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fallbackTexture = createFallbackTexture();

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFieldOfViewRad: { value: 1 },
      uLensAngularPosition: { value: new THREE.Vector2(0, 0) },
      uDistanceObserverLensM: { value: 1 },
      uLensSourceDistanceRatio: { value: 0.5 },
      uShadowRadiusRad: { value: 0 },
      uStarfieldCellRad: { value: 1 },
      uDeflectionTable: { value: null as THREE.DataTexture | null },
      uTableLogBMin: { value: 0 },
      uTableLogBMax: { value: 1 },
      uBackgroundMode: { value: 0 },
      uBackgroundTexture: { value: fallbackTexture as THREE.Texture },
      uBackgroundScaleRad: { value: 1 },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  let currentTable: DeflectionTable | null = null;
  let lastFieldOfViewRad = 1;

  function setSize(width: number, height: number): void {
    renderer.setSize(width, height, false);
    (material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  // Rebuilding the table (1024 samples, a few KB texture upload) is cheap
  // enough to do on every update — including every slider-drag tick —
  // and it sidesteps a correctness bug: the table's b-range depends on
  // both mass and field of view, so a partial rebuild policy risks a
  // stale range when only one of those changes.
  function update(lens: PointMassLensConfig, camera: LensSceneCameraConfig): void {
    const distanceLensSourceM = camera.distanceObserverSourceM - camera.distanceObserverLensM;
    const shadowRadius = shadowAngularRadius(lens.massKg, camera.distanceObserverLensM);
    const bMin = schwarzschildRadius(lens.massKg);
    const bMax = camera.distanceObserverLensM * camera.fieldOfViewRad * 1.5;

    currentTable?.texture.dispose();
    currentTable = buildDeflectionTable(lens.massKg, bMin, bMax);
    lastFieldOfViewRad = camera.fieldOfViewRad;

    material.uniforms.uFieldOfViewRad.value = camera.fieldOfViewRad;
    (material.uniforms.uLensAngularPosition.value as THREE.Vector2).set(
      lens.angularPosition.x,
      lens.angularPosition.y,
    );
    material.uniforms.uDistanceObserverLensM.value = camera.distanceObserverLensM;
    material.uniforms.uLensSourceDistanceRatio.value =
      distanceLensSourceM / camera.distanceObserverSourceM;
    material.uniforms.uShadowRadiusRad.value = shadowRadius;
    material.uniforms.uStarfieldCellRad.value = camera.fieldOfViewRad / 12;
    material.uniforms.uDeflectionTable.value = currentTable.texture;
    material.uniforms.uTableLogBMin.value = currentTable.logBMin;
    material.uniforms.uTableLogBMax.value = currentTable.logBMax;
  }

  function setBackground(background: BackgroundConfig): void {
    if (background.mode === "starfield") {
      material.uniforms.uBackgroundMode.value = 0;
      return;
    }
    material.uniforms.uBackgroundMode.value = 1;
    material.uniforms.uBackgroundTexture.value = background.texture;
    material.uniforms.uBackgroundScaleRad.value = background.scaleRad || lastFieldOfViewRad;
  }

  function render(): void {
    renderer.render(scene, orthoCamera);
  }

  function dispose(): void {
    material.dispose();
    quad.geometry.dispose();
    currentTable?.texture.dispose();
    fallbackTexture.dispose();
    renderer.dispose();
  }

  return { setSize, update, setBackground, render, dispose };
}
