import * as THREE from "three";
import { schwarzschildRadius, shadowAngularRadius } from "../physics/deflection";
import { buildDeflectionTable } from "./deflectionTable";
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

export interface LensScene {
  setSize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}

/**
 * Sets up a Three.js full-screen-quad scene that runs the point-lens
 * equation from src/physics/ as a GLSL fragment shader, so the same
 * deflection math from Stage 1 renders at interactive framerates instead
 * of a few seconds per frame on the CPU.
 */
export function createLensScene(
  canvas: HTMLCanvasElement,
  lens: PointMassLensConfig,
  camera: LensSceneCameraConfig,
): LensScene {
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

  const distanceLensSourceM = camera.distanceObserverSourceM - camera.distanceObserverLensM;
  const shadowRadius = shadowAngularRadius(lens.massKg, camera.distanceObserverLensM);
  const bMin = schwarzschildRadius(lens.massKg);
  const bMax = camera.distanceObserverLensM * camera.fieldOfViewRad * 1.5;
  const table = buildDeflectionTable(lens.massKg, bMin, bMax);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFieldOfViewRad: { value: camera.fieldOfViewRad },
      uLensAngularPosition: {
        value: new THREE.Vector2(lens.angularPosition.x, lens.angularPosition.y),
      },
      uDistanceObserverLensM: { value: camera.distanceObserverLensM },
      uLensSourceDistanceRatio: { value: distanceLensSourceM / camera.distanceObserverSourceM },
      uShadowRadiusRad: { value: shadowRadius },
      uCheckerPeriodRad: { value: camera.fieldOfViewRad / 12 },
      uDeflectionTable: { value: table.texture },
      uTableLogBMin: { value: table.logBMin },
      uTableLogBMax: { value: table.logBMax },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  function setSize(width: number, height: number): void {
    renderer.setSize(width, height, false);
    (material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  function render(): void {
    renderer.render(scene, orthoCamera);
  }

  function dispose(): void {
    material.dispose();
    quad.geometry.dispose();
    table.texture.dispose();
    renderer.dispose();
  }

  return { setSize, render, dispose };
}
