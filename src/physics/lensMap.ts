export interface AngularPosition {
  x: number;
  y: number;
}

/**
 * Point-mass gravitational lens equation, in vector form:
 *
 *   beta = theta_rel * (1 - thetaE^2 / |theta_rel|^2)
 *
 * where theta_rel is the image-plane angle relative to the lens. Returns
 * the corresponding source-plane angle, or null if the ray falls within
 * the shadow radius (see `shadowAngularRadius`).
 */
export function pointLensMap(
  imageAngle: AngularPosition,
  lensAngle: AngularPosition,
  thetaERad: number,
  shadowRadiusRad: number,
): AngularPosition | null {
  const dx = imageAngle.x - lensAngle.x;
  const dy = imageAngle.y - lensAngle.y;
  const rSquared = dx * dx + dy * dy;

  if (rSquared < shadowRadiusRad * shadowRadiusRad) {
    return null;
  }

  const factor = 1 - (thetaERad * thetaERad) / rSquared;
  return {
    x: lensAngle.x + dx * factor,
    y: lensAngle.y + dy * factor,
  };
}
