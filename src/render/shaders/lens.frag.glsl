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
uniform float uCheckerPeriodRad;

// Deflection-angle lookup table: alpha(b) precomputed on the CPU (see
// src/render/deflectionTable.ts, reusing the same deflectionAngle()
// formula validated by Stage 1's unit tests) and sampled here instead of
// recomputing 4GM/(c^2 b) per fragment.
uniform sampler2D uDeflectionTable;
uniform float uTableLogBMin;
uniform float uTableLogBMax;

// Same tiling as src/physics/backgrounds.ts: nearest-integer tile
// indexing centers a tile on the optical axis, so the checkerboard is
// exactly mirror-symmetric there. floor(x + 0.5) matches JS Math.round.
vec3 checkerboard(vec2 theta) {
  vec2 tile = floor(theta / uCheckerPeriodRad + 0.5);
  float parity = mod(tile.x + tile.y, 2.0);
  return parity < 1.0 ? vec3(235.0, 235.0, 245.0) / 255.0 : vec3(20.0, 20.0, 35.0) / 255.0;
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

  gl_FragColor = vec4(checkerboard(beta), 1.0);
}
