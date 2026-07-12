precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uFieldOfViewRad;
uniform vec2 uLensAngularPosition;
uniform float uDistanceObserverLensM;
// D_LS / D_S, i.e. the ratio that turns a raw deflection angle into the
// reduced deflection angle used by the lens equation.
uniform float uLensSourceDistanceRatio;
uniform float uShadowRadiusRad;

// Deflection-angle lookup table: alpha(b) precomputed on the CPU (see
// src/render/deflectionTable.ts, reusing the same deflectionAngle()
// formula validated by Stage 1's unit tests) and sampled here instead of
// recomputing 4GM/(c^2 b) per fragment.
uniform sampler2D uDeflectionTable;
uniform float uTableLogBMin;
uniform float uTableLogBMax;

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

float lookupDeflection(float bMeters) {
  float logB = log(max(bMeters, 1.0));
  float u = (logB - uTableLogBMin) / (uTableLogBMax - uTableLogBMin);
  u = clamp(u, 0.0, 1.0);
  return texture2D(uDeflectionTable, vec2(u, 0.5)).r;
}

void main() {
  // vUv samples fragment centers, which already matches the CPU
  // renderer's (pixel + 0.5) convention.
  vec2 pixel = vUv * uResolution;
  float radPerPixel = uFieldOfViewRad / uResolution.x;
  vec2 theta = (pixel - uResolution * 0.5) * radPerPixel;

  vec2 rel = theta - uLensAngularPosition;
  float r = length(rel);

  if (r < uShadowRadiusRad) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float bMeters = r * uDistanceObserverLensM;
  float alpha = lookupDeflection(bMeters);
  float alphaHat = alpha * uLensSourceDistanceRatio;

  vec2 sourceRel = rel * (1.0 - alphaHat / r);
  vec2 beta = uLensAngularPosition + sourceRel;

  vec3 color = uBackgroundMode == 1 ? backgroundTexture(beta) : starfield(beta);
  gl_FragColor = vec4(color, 1.0);
}
