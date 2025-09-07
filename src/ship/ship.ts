import Phaser from "phaser";

export function preloadShip(scene: Phaser.Scene) {
  // Load default ship texture
  const url =
    "https://space-ship-sprites.s3.amazonaws.com/generated/3ca83705-99b6-4fb9-857f-d243b2773172.png";
  if (scene.textures.exists("ship")) return; // already loaded
  try {
    (scene.load as any).setCORS?.("anonymous");
  } catch {}
  scene.load.image("ship", url);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    if (scene.textures.exists("ship")) {
      makeNearBlackTransparent(scene, "ship");
    }
  });
}

export function createShipSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey = "ship"
) {
  const sprite = scene.physics.add.sprite(x, y, textureKey);
  sprite.setOrigin(0.5, 0.35); // forward bias
  sprite.setDamping(true);
  sprite.setDrag(0.98);
  sprite.setMaxVelocity(600, 600);
  return sprite;
}

// Target largest dimension for ships (world pixels)
export const SHIP_TARGET_MAX_SIZE = 96; // logical baseline size

// Dynamically load a PNG from a URL into the texture manager under a stable key.
// Returns a Promise that resolves with the (possibly new) texture key to use.
// Removed unused loadExternalShipTexture (server provides textures for all ships)

// Make near-black pixels transparent
export function makeNearBlackTransparent(
  scene: Phaser.Scene,
  key: string,
  opts?: { threshold?: number; clearWatermarkBox?: boolean }
) {
  const threshold = opts?.threshold ?? 56; // ~22% of 255
  const clearWatermark = opts?.clearWatermarkBox ?? true; // enable by default
  const tex = scene.textures.get(key);
  if (!tex) return;
  const src = tex.getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement
    | null;
  if (!src) return;
  const w = (src as any).naturalWidth || (src as any).width;
  const h = (src as any).naturalHeight || (src as any).height;
  if (!w || !h) return;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try {
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    // 1. Fade near-black background
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const avg = (r + g + b) / 3;
      if (avg > threshold) continue;
      const factor = avg / threshold; // 0..1
      data[i + 3] = Math.round(data[i + 3] * factor);
    }

    // 2. Hard clear bottom-right watermark area (normalized 0.95..1 range)
    if (clearWatermark) {
      const startX = Math.floor(w * 0.91);
      const startY = Math.floor(h * 0.91);
      for (let py = startY; py < h; py++) {
        for (let px = startX; px < w; px++) {
          const idx = (py * w + px) * 4;
          data[idx + 3] = 0; // fully transparent (RGB ignored)
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Replace existing texture with canvas version.
    scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  } catch {}
}

// Removed old client-side movement helper (server is authoritative now)
