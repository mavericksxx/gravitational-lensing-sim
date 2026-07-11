export interface Color {
  r: number;
  g: number;
  b: number;
}

export type BackgroundSampler = (thetaXRad: number, thetaYRad: number) => Color;

/**
 * Infinite checkerboard pattern in angular source-plane coordinates.
 * `periodRad` is the angular size of one tile.
 *
 * Tiles are indexed by nearest-integer rounding rather than floor, so tile
 * 0 is centered on the optical axis (x=0, y=0) instead of having an edge
 * there. That makes the pattern exactly mirror-symmetric about the axis,
 * which is what a centered, radially-symmetric lens configuration needs
 * for the ring it produces to come out symmetric too.
 */
export function checkerboardBackground(
  periodRad: number,
  colorA: Color = { r: 235, g: 235, b: 245 },
  colorB: Color = { r: 20, g: 20, b: 35 },
): BackgroundSampler {
  return (x, y) => {
    const tileX = Math.round(x / periodRad);
    const tileY = Math.round(y / periodRad);
    const parity = (((tileX + tileY) % 2) + 2) % 2;
    return parity === 0 ? colorA : colorB;
  };
}
