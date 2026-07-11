import { C, G } from "./constants";

/** Schwarzschild radius (event horizon radius) of a point mass, in meters. */
export function schwarzschildRadius(massKg: number): number {
  return (2 * G * massKg) / (C * C);
}

/**
 * Weak-field deflection angle (radians) of a light ray passing a point mass
 * with the given impact parameter (meters). Valid for impact parameters well
 * outside the Schwarzschild radius; the approximation breaks down near the
 * photon sphere.
 */
export function deflectionAngle(massKg: number, impactParameterM: number): number {
  return (4 * G * massKg) / (C * C * impactParameterM);
}

/**
 * Angular Einstein radius (radians) of a point-mass lens, given the
 * observer-lens, observer-source, and lens-source distances (meters).
 */
export function einsteinRadius(
  massKg: number,
  distanceObserverLensM: number,
  distanceObserverSourceM: number,
  distanceLensSourceM: number,
): number {
  return Math.sqrt(
    ((4 * G * massKg) / (C * C)) *
      (distanceLensSourceM / (distanceObserverLensM * distanceObserverSourceM)),
  );
}

/**
 * Angular radius (radians) of the black-hole shadow as seen from the
 * observer, approximated as the photon-sphere capture radius (~2.6x the
 * Schwarzschild radius) projected to an angle at the observer-lens
 * distance. Inside this radius the weak-field formulas above no longer
 * hold, so the renderer treats it as opaque rather than extrapolating.
 */
export function shadowAngularRadius(massKg: number, distanceObserverLensM: number): number {
  const PHOTON_CAPTURE_FACTOR = 2.6;
  return (PHOTON_CAPTURE_FACTOR * schwarzschildRadius(massKg)) / distanceObserverLensM;
}
