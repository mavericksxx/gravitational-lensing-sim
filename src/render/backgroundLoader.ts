import * as THREE from "three";
import type { SdssTargetId } from "../state/sceneState";

/** RA/Dec (degrees) for each known SDSS cutout target. */
export const SDSS_TARGETS: Record<SdssTargetId, { label: string; ra: number; dec: number }> = {
  whirlpool: { label: "Whirlpool Galaxy", ra: 202.4696, dec: 47.1953 },
  andromeda: { label: "Andromeda Galaxy", ra: 10.6847, dec: 41.269 },
  sombrero: { label: "Sombrero Galaxy", ra: 189.9976, dec: -11.6231 },
};

export function buildSdssCutoutUrl(target: SdssTargetId): string {
  const { ra, dec } = SDSS_TARGETS[target];
  const params = new URLSearchParams({
    ra: String(ra),
    dec: String(dec),
    scale: "0.4",
    width: "512",
    height: "512",
  });
  return `https://skyserver.sdss.org/dr16/SkyServerWS/ImgCutout/getjpeg?${params.toString()}`;
}

function finishTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Loads any image URL (an SDSS cutout, or an object URL from a local file) as a texture. */
export function loadImageAsTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (texture) => resolve(finishTexture(texture)),
      undefined,
      () => reject(new Error(`Failed to load background image: ${url}`)),
    );
  });
}

/** Loads a user-selected file as a texture, without leaking the intermediate object URL. */
export async function loadFileAsTexture(file: File): Promise<THREE.Texture> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageAsTexture(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
