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
  /** View-center offset (radians) — the "pan" half of camera controls. */
  panRad: { x: number; y: number };
}

export type BackgroundConfig =
  { mode: "starfield" } | { mode: "texture"; texture: THREE.Texture; scaleRad: number };

export interface LensScene {
  setSize(width: number, height: number): void;
  /**
   * Pushes 1-2 lenses and the camera configuration to the shader's
   * uniforms. Deflections from multiple lenses are summed in the shader
   * (weak-field superposition) — see the shader's own comment for the
   * caveats on that approximation.
   */
  update(lenses: PointMassLensConfig[], camera: LensSceneCameraConfig): void;
  /** Switches the background source the shader samples for unlensed sky. */
  setBackground(background: BackgroundConfig): void;
  render(): void;
  dispose(): void;
}

const MAX_LENSES = 2;

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
      uPanRad: { value: new THREE.Vector2(0, 0) },
      uDistanceObserverLensM: { value: 1 },
      uLensSourceDistanceRatio: { value: 0.5 },
      uStarfieldCellRad: { value: 1 },
      uLensCount: { value: 1 },
      uLensPosition0: { value: new THREE.Vector2(0, 0) },
      uShadowRadiusRad0: { value: 0 },
      uLensPosition1: { value: new THREE.Vector2(0, 0) },
      uShadowRadiusRad1: { value: 0 },
      uDeflectionTable0: { value: null as THREE.DataTexture | null },
      uTableLogBMin0: { value: 0 },
      uTableLogBMax0: { value: 1 },
      uDeflectionTable1: { value: null as THREE.DataTexture | null },
      uTableLogBMin1: { value: 0 },
      uTableLogBMax1: { value: 1 },
      uBackgroundMode: { value: 0 },
      uBackgroundTexture: { value: fallbackTexture as THREE.Texture },
      uBackgroundScaleRad: { value: 1 },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  let currentTables: (DeflectionTable | null)[] = [null, null];
  let lastFieldOfViewRad = 1;

  function setSize(width: number, height: number): void {
    renderer.setSize(width, height, false);
    (material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  // Rebuilding the tables (1024 samples each, a few KB texture upload) is
  // cheap enough to do on every update — including every slider-drag
  // tick — and it sidesteps a correctness bug: each table's b-range
  // depends on both that lens's mass and the field of view, so a partial
  // rebuild policy risks a stale range when only one of those changes.
  function update(lenses: PointMassLensConfig[], camera: LensSceneCameraConfig): void {
    const distanceLensSourceM = camera.distanceObserverSourceM - camera.distanceObserverLensM;
    const lensSourceRatio = distanceLensSourceM / camera.distanceObserverSourceM;
    lastFieldOfViewRad = camera.fieldOfViewRad;

    material.uniforms.uFieldOfViewRad.value = camera.fieldOfViewRad;
    (material.uniforms.uPanRad.value as THREE.Vector2).set(camera.panRad.x, camera.panRad.y);
    material.uniforms.uDistanceObserverLensM.value = camera.distanceObserverLensM;
    material.uniforms.uLensSourceDistanceRatio.value = lensSourceRatio;
    material.uniforms.uStarfieldCellRad.value = camera.fieldOfViewRad / 12;
    material.uniforms.uLensCount.value = Math.min(lenses.length, MAX_LENSES);

    const positionUniforms = [material.uniforms.uLensPosition0, material.uniforms.uLensPosition1];
    const shadowUniforms = [
      material.uniforms.uShadowRadiusRad0,
      material.uniforms.uShadowRadiusRad1,
    ];
    const tableUniforms = [
      material.uniforms.uDeflectionTable0,
      material.uniforms.uDeflectionTable1,
    ];
    const logBMinUniforms = [material.uniforms.uTableLogBMin0, material.uniforms.uTableLogBMin1];
    const logBMaxUniforms = [material.uniforms.uTableLogBMax0, material.uniforms.uTableLogBMax1];

    for (let i = 0; i < MAX_LENSES; i++) {
      // When only one lens is active, slot 1 just mirrors slot 0 — the
      // shader's uLensCount gate means it's never actually sampled, but
      // every uniform still needs a valid, finite value bound.
      const lens = lenses[i] ?? lenses[0];

      currentTables[i]?.texture.dispose();
      const shadowRadius = shadowAngularRadius(lens.massKg, camera.distanceObserverLensM);
      const bMin = schwarzschildRadius(lens.massKg);
      const bMax = camera.distanceObserverLensM * camera.fieldOfViewRad * 1.5;
      const table = buildDeflectionTable(lens.massKg, bMin, bMax);
      currentTables[i] = table;

      (positionUniforms[i].value as THREE.Vector2).set(
        lens.angularPosition.x,
        lens.angularPosition.y,
      );
      shadowUniforms[i].value = shadowRadius;
      tableUniforms[i].value = table.texture;
      logBMinUniforms[i].value = table.logBMin;
      logBMaxUniforms[i].value = table.logBMax;
    }
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
    for (const table of currentTables) table?.texture.dispose();
    currentTables = [null, null];
    fallbackTexture.dispose();
    renderer.dispose();
  }

  return { setSize, update, setBackground, render, dispose };
}
