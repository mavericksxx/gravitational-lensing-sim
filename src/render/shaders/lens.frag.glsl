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

const vec3 SPACE_COLOR = vec3(0.02, 0.02, 0.035);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Lattice-hash value noise with Hermite (smoothstep) interpolation between
// the four surrounding corners — the standard cheap building block for
// fractal Brownian motion, entirely hand-rolled since GLSL ES 1.00 has no
// built-in noise.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4 octaves: enough cloud-like detail at multiple scales to read as gas
// structure rather than a single smooth blob, still cheap (a handful of
// hash evaluations per octave, no texture sampling).
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Colored nebula-like cloud structure behind the stars — a direct
// response to the background being too sparse for the lensing distortion
// to read clearly against it. Two independent FBM layers: one for cloud
// density/color, one (differently offset, so it doesn't just echo the
// first) for dust-lane occlusion that darkens patches of the cloud, the
// way real emission nebulae show dark dust structure cutting through the
// glow. A coarse third hash picks between an emission (pink/magenta) and
// reflection (blue/teal) palette per sky region, so the field doesn't
// read as one uniform tint everywhere.
vec3 nebula(vec2 theta) {
  float scale = uStarfieldCellRad * 12.0;
  vec2 p = theta / scale;

  float cloud = fbm(p);
  cloud = smoothstep(0.35, 0.78, cloud); // most of the sky stays near-empty

  float dust = fbm(p * 1.8 + 91.7);
  dust = smoothstep(0.25, 0.65, dust);

  vec2 region = floor(theta / (scale * 4.0));
  float theme = hash21(region + 500.0);
  vec3 emission = vec3(0.62, 0.16, 0.34);
  vec3 reflection = vec3(0.12, 0.24, 0.52);
  vec3 tint = mix(reflection, emission, step(0.5, theme));

  return tint * cloud * dust * 0.32;
}

// Thin plus-shaped flare through a star's center, falling off with
// distance along each axis — the diffraction-spike look bright stars get
// in real astrophotography, reserved for a small fraction of stars so it
// reads as a highlight rather than a repeating pattern.
float diffractionSpike(vec2 offsetFromCenter) {
  float armLength = 0.42;
  float thickness = 0.012;
  float horizontal =
    smoothstep(thickness, 0.0, abs(offsetFromCenter.y)) *
    smoothstep(armLength, 0.0, abs(offsetFromCenter.x));
  float vertical =
    smoothstep(thickness, 0.0, abs(offsetFromCenter.x)) *
    smoothstep(armLength, 0.0, abs(offsetFromCenter.y));
  return max(horizontal, vertical);
}

// Cell-based procedural starfield layered over the nebula: each cell
// either has no star or one star at a pseudo-random position/size/
// brightness, all derived from a hash of the cell coordinate so it's
// fully deterministic (same view always shows the same sky, which
// matters for reproducible screenshots and shareable URLs). A small
// fraction of stars are brighter "hero" stars with a diffraction spike.
vec3 starfield(vec2 theta) {
  vec3 color = SPACE_COLOR + nebula(theta);

  vec2 cell = floor(theta / uStarfieldCellRad);
  vec2 cellUv = fract(theta / uStarfieldCellRad);

  float presence = hash21(cell);
  if (presence > 0.76) {
    vec2 starPos = vec2(hash21(cell + 17.1), hash21(cell + 31.7));
    float brightness = hash21(cell + 53.9);
    float size = mix(0.05, 0.16, brightness);
    vec2 offset = cellUv - starPos;
    float dist = length(offset);
    float core = smoothstep(size, 0.0, dist) * brightness;

    float warmth = hash21(cell + 71.3);
    vec3 tint = mix(vec3(0.79, 0.83, 1.0), vec3(1.0, 0.87, 0.68), step(0.8, warmth));

    float isHero = step(0.93, hash21(cell + 113.7));
    float spike = diffractionSpike(offset) * isHero * brightness;

    color += tint * (core + spike);
  }

  return color;
}

vec3 backgroundTexture(vec2 beta) {
  vec2 uv = beta / uBackgroundScaleRad + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return SPACE_COLOR;
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
