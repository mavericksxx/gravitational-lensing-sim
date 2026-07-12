precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uFieldOfViewRad;
// Pan offset (radians) — where the view is centered, independent of any
// lens's own position. This is "camera pan," the drag half of the
// pan/zoom camera controls (there's no 3D orbit here: the renderer is a
// 2D angular sky-position ray-tracer, not a movable 3D viewpoint).
uniform vec2 uPanRad;

uniform float uDistanceObserverLensM;
// D_LS / D_S, i.e. the ratio that turns a raw deflection angle into the
// reduced deflection angle used by the lens equation.
uniform float uLensSourceDistanceRatio;

// Up to two lensing objects, on a shared lens plane (same
// uDistanceObserverLensM for both — a simplifying assumption, since nothing
// in the UI models them at different distances from the observer).
// uLensCount is 1 or 2; the second lens's uniforms are simply unused when
// uLensCount is 1. Deflections are summed (weak-field superposition) —
// astrophysically approximate for a real two-body system, but the
// standard simplification for this kind of visualization.
uniform int uLensCount;
uniform vec2 uLensPosition0;
uniform float uShadowRadiusRad0;
uniform vec2 uLensPosition1;
uniform float uShadowRadiusRad1;

// Deflection-angle lookup tables: alpha(b) precomputed per lens on the
// CPU (see src/render/deflectionTable.ts, reusing the same
// deflectionAngle() formula validated by Stage 1's unit tests) and
// sampled here instead of recomputing 4GM/(c^2 b) per fragment. Each
// lens gets its own table since they can have very different masses.
uniform sampler2D uDeflectionTable0;
uniform float uTableLogBMin0;
uniform float uTableLogBMax0;
uniform sampler2D uDeflectionTable1;
uniform float uTableLogBMin1;
uniform float uTableLogBMax1;

// Background source. 0 = procedural starfield, 1 = a real texture
// (uploaded image or an SDSS cutout) sampled over uBackgroundScaleRad.
uniform int uBackgroundMode;
uniform float uStarfieldCellRad;
uniform sampler2D uBackgroundTexture;
uniform float uBackgroundScaleRad;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Cell-based procedural starfield: each cell either has no star or one
// star at a pseudo-random position/size/brightness, all derived from a
// hash of the cell coordinate so it's fully deterministic (same view
// always shows the same sky, which matters for reproducible screenshots
// and shareable URLs).
vec3 starfield(vec2 theta) {
  vec2 cell = floor(theta / uStarfieldCellRad);
  vec2 cellUv = fract(theta / uStarfieldCellRad);

  vec3 color = vec3(0.02, 0.02, 0.035);

  float presence = hash21(cell);
  if (presence > 0.86) {
    vec2 starPos = vec2(hash21(cell + 17.1), hash21(cell + 31.7));
    float brightness = hash21(cell + 53.9);
    float size = mix(0.06, 0.18, brightness);
    float dist = length(cellUv - starPos);
    float star = smoothstep(size, 0.0, dist) * brightness;

    float warmth = hash21(cell + 71.3);
    vec3 tint = mix(vec3(0.79, 0.83, 1.0), vec3(1.0, 0.87, 0.68), step(0.8, warmth));
    color += tint * star;
  }

  return color;
}

vec3 backgroundTexture(vec2 beta) {
  vec2 uv = beta / uBackgroundScaleRad + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(0.02, 0.02, 0.035);
  }
  return texture2D(uBackgroundTexture, uv).rgb;
}

float lookupDeflection(sampler2D table, float logBMin, float logBMax, float bMeters) {
  float logB = log(max(bMeters, 1.0));
  float u = (logB - logBMin) / (logBMax - logBMin);
  u = clamp(u, 0.0, 1.0);
  return texture2D(table, vec2(u, 0.5)).r;
}

void main() {
  // vUv samples fragment centers, which already matches the CPU
  // renderer's (pixel + 0.5) convention.
  vec2 pixel = vUv * uResolution;
  float radPerPixel = uFieldOfViewRad / uResolution.x;
  vec2 theta = (pixel - uResolution * 0.5) * radPerPixel + uPanRad;

  vec2 rel0 = theta - uLensPosition0;
  float r0 = length(rel0);
  if (r0 < uShadowRadiusRad0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 rel1 = theta - uLensPosition1;
  float r1 = length(rel1);
  if (uLensCount >= 2 && r1 < uShadowRadiusRad1) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float alphaHat0 = lookupDeflection(uDeflectionTable0, uTableLogBMin0, uTableLogBMax0, r0 * uDistanceObserverLensM) * uLensSourceDistanceRatio;
  vec2 deflection = (rel0 / r0) * alphaHat0;

  if (uLensCount >= 2) {
    float alphaHat1 = lookupDeflection(uDeflectionTable1, uTableLogBMin1, uTableLogBMax1, r1 * uDistanceObserverLensM) * uLensSourceDistanceRatio;
    deflection += (rel1 / r1) * alphaHat1;
  }

  vec2 beta = theta - deflection;

  vec3 color = uBackgroundMode == 1 ? backgroundTexture(beta) : starfield(beta);
  gl_FragColor = vec4(color, 1.0);
}
