import Phaser from "phaser";
import { ArcadeInput, MovementConfig } from "../types/ship";

export function preloadShip(scene: Phaser.Scene) {
  // Load the default ship texture from external URL (replaces old triangle placeholder)
  const url =
    "https://space-ship-sprites.s3.amazonaws.com/generated/3ca83705-99b6-4fb9-857f-d243b2773172.png";
  if (scene.textures.exists("ship")) return; // already loaded
  scene.load.image("ship", url);
  // After the load completes, post-process to knock out black background.
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
  // Apply standard scale (only scales down large textures)
  applyStandardShipScale(sprite);
  return sprite;
}

// Target dimension (largest side) in world pixels for the ship.
// All ship textures will be uniformly scaled (up or down) so their largest dimension equals this.
export const SHIP_TARGET_MAX_SIZE = 96; // logical baseline size
// Multiplier to enlarge rendered ships (does not affect grid cell calc which uses baseline)
export const SHIP_SCALE_MULTIPLIER = 1.5; // +50%

export function applyStandardShipScale(
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
) {
  const tex = sprite.texture;
  if (!tex) return;
  const frame = tex.get();
  const w = frame.width;
  const h = frame.height;
  const maxDim = Math.max(w, h) || 1;
  const scale = (SHIP_TARGET_MAX_SIZE / maxDim) * SHIP_SCALE_MULTIPLIER;
  sprite.setScale(scale);
}

// Dynamically load a PNG from a URL into the texture manager under a stable key.
// Returns a Promise that resolves with the (possibly new) texture key to use.
export async function loadExternalShipTexture(
  scene: Phaser.Scene,
  url: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = "ship-external"; // overwrite prior external for simplicity
    // If key already exists and same URL, resolve immediately (no cache-bust logic here)
    // We'll just reload always to allow updating.
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }

    // Use Phaser's Loader for cross-origin images (assuming server allows it)
    scene.load.image(key, url);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.textures.exists(key)) {
        // Post-process transparency
        makeNearBlackTransparent(scene, key);
        resolve(key);
      } else {
        reject(new Error("Failed to load ship texture"));
      }
    });
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      reject(new Error(`Failed to load: ${file?.src || url}`));
    });
    scene.load.start();
  });
}

// Make near-black pixels transparent (used for generated ships that come with black bg)
// Strategy: For any pixel whose average brightness <= threshold, reduce alpha proportionally.
// This keeps very dark grey slightly visible (glow, outline) while cutting out pure black.
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
      if (avg <= threshold) {
        const factor = avg / threshold; // 0..1
        data[i + 3] = Math.round(data[i + 3] * factor);
      }
    }

    // 2. Hard clear bottom-right watermark area (normalized 0.95..1 range)
    if (clearWatermark) {
      const startX = Math.floor(w * 0.92);
      const startY = Math.floor(h * 0.92);
      for (let y = startY; y < h; y++) {
        for (let x = startX; x < w; x++) {
          const idx = (y * w + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0; // fully transparent
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Replace existing texture with canvas version.
    scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  } catch (e) {
    // Likely a CORS-tainted canvas; skip silently.
    // eslint-disable-next-line no-console
    console.warn("[texture] transparency post-process skipped", e);
  }
}

export function updateShip(
  scene: Phaser.Scene,
  ship: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  input: ArcadeInput,
  cfg: MovementConfig,
  delta: number
) {
  const dt = delta / 1000;
  const { keys } = input;

  // Rotation via A (left) and D (right)
  if (keys.A?.isDown) {
    ship.rotation -= cfg.rotationSpeed * dt;
  } else if (keys.D?.isDown) {
    ship.rotation += cfg.rotationSpeed * dt;
  }

  // Forward thrust (no inertia heavy sim) when W is held
  const forwardHeld = keys.W?.isDown;
  const speed = cfg.baseSpeed;
  if (forwardHeld) {
    // Ship graphic points up; forward direction is rotation - 90deg
    const angle = ship.rotation - Math.PI / 2;
    ship.body.velocity.x = Math.cos(angle) * speed;
    ship.body.velocity.y = Math.sin(angle) * speed;
  } else {
    // Quick deceleration for responsive stop
    ship.body.velocity.scale(0.85);
  }
}
