import { describe, expect, it } from "vitest";
import { ARCSEC_PER_RAD, SOLAR_MASS } from "./constants";
import { deflectionAngle, einsteinRadius, schwarzschildRadius } from "./deflection";

describe("schwarzschildRadius", () => {
  it("matches the known Schwarzschild radius of the Sun (~2.95 km)", () => {
    expect(schwarzschildRadius(SOLAR_MASS)).toBeCloseTo(2954, -1);
  });
});

describe("deflectionAngle", () => {
  it("matches the historically measured solar-limb deflection (~1.75 arcsec)", () => {
    const solarRadiusM = 6.957e8;
    const deflectionArcsec = deflectionAngle(SOLAR_MASS, solarRadiusM) * ARCSEC_PER_RAD;
    expect(deflectionArcsec).toBeCloseTo(1.75, 1);
  });

  it("scales inversely with impact parameter", () => {
    const b = 1e9;
    const a1 = deflectionAngle(SOLAR_MASS, b);
    const a2 = deflectionAngle(SOLAR_MASS, b * 2);
    expect(a2).toBeCloseTo(a1 / 2, 12);
  });
});

describe("einsteinRadius", () => {
  it("matches the source-at-infinity identity thetaE = sqrt(2 * Rs / D_L)", () => {
    const distanceObserverLensM = 3.0857e19; // 1 kpc
    const distanceObserverSourceM = distanceObserverLensM * 1e10; // source effectively at infinity
    const distanceLensSourceM = distanceObserverSourceM - distanceObserverLensM;

    const thetaE = einsteinRadius(
      SOLAR_MASS,
      distanceObserverLensM,
      distanceObserverSourceM,
      distanceLensSourceM,
    );

    const expected = Math.sqrt((2 * schwarzschildRadius(SOLAR_MASS)) / distanceObserverLensM);
    expect(thetaE / expected).toBeCloseTo(1, 6);
  });

  it("scales with sqrt(mass)", () => {
    const dL = 3.0857e19;
    const dS = dL * 2;
    const dLS = dS - dL;
    const theta1 = einsteinRadius(SOLAR_MASS, dL, dS, dLS);
    const theta4x = einsteinRadius(SOLAR_MASS * 4, dL, dS, dLS);
    expect(theta4x / theta1).toBeCloseTo(2, 6);
  });
});
