import { describe, expect, it } from "vitest";
import { checkerboardBackground } from "./backgrounds";
import { AU, SOLAR_MASS } from "./constants";
import { einsteinRadius } from "./deflection";
import { renderLensedImage, type LensCameraConfig, type PointMassLens } from "./renderLensedImage";

function demoScene(): { lens: PointMassLens; camera: LensCameraConfig } {
  const lens: PointMassLens = {
    massKg: SOLAR_MASS * 1e6,
    angularPosition: { x: 0, y: 0 },
  };
  const distanceObserverLensM = 1000 * AU;
  const distanceObserverSourceM = 2000 * AU;
  const distanceLensSourceM = distanceObserverSourceM - distanceObserverLensM;
  const thetaE = einsteinRadius(
    lens.massKg,
    distanceObserverLensM,
    distanceObserverSourceM,
    distanceLensSourceM,
  );

  const camera: LensCameraConfig = {
    distanceObserverLensM,
    distanceObserverSourceM,
    fieldOfViewRad: thetaE * 6,
    width: 65,
    height: 65,
  };
  return { lens, camera };
}

describe("renderLensedImage", () => {
  it("produces a horizontally and vertically symmetric image for a centered lens", () => {
    const { lens, camera } = demoScene();
    const background = checkerboardBackground(camera.fieldOfViewRad / 10);
    const image = renderLensedImage(lens, camera, background);

    const pixelAt = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      return [image.data[i], image.data[i + 1], image.data[i + 2]];
    };

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const mirroredX = image.width - 1 - x;
        const mirroredY = image.height - 1 - y;
        expect(pixelAt(x, y)).toEqual(pixelAt(mirroredX, y));
        expect(pixelAt(x, y)).toEqual(pixelAt(x, mirroredY));
      }
    }
  });

  it("renders the shadow (black) at the lens center", () => {
    const { lens, camera } = demoScene();
    const background = checkerboardBackground(camera.fieldOfViewRad / 10);
    const image = renderLensedImage(lens, camera, background);

    const cx = Math.floor(image.width / 2);
    const cy = Math.floor(image.height / 2);
    const i = (cy * image.width + cx) * 4;
    expect([image.data[i], image.data[i + 1], image.data[i + 2]]).toEqual([0, 0, 0]);
  });
});
