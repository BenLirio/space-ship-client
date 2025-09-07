import Phaser from "phaser";
import { makeNearBlackTransparent } from "../../ship/ship";

// Deterministically ensure a texture exists for a given image URL.
// Returns a key suitable for use with sprites. Falls back to `fallbackKey`.
export async function ensureTextureFor(
  scene: Phaser.Scene,
  url?: string,
  fallbackKey = "ship"
): Promise<string> {
  if (!url) return fallbackKey;
  const key =
    "remote-" +
    btoa(url).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (scene.textures.exists(key)) return key;
  return await new Promise<string>((resolve) => {
    // Ensure cross-origin images can be used and processed on canvas
    try {
      (scene.load as any).setCORS?.("anonymous");
    } catch {}
    scene.load.image(key, url);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.textures.exists(key)) {
        makeNearBlackTransparent(scene, key, { clearWatermarkBox: true });
        resolve(key);
      } else {
        resolve(fallbackKey);
      }
    });
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      resolve(fallbackKey);
    });
    scene.load.start();
  });
}

// Direct, non-loader image fetch for UI/scoreboard thumbnails.
// Does NOT use Phaser's Loader; instead, creates an HTMLImageElement on demand.
// Returns the texture key (or fallback) once available.
const pendingDirect: Map<string, Promise<string>> = new Map();
export async function ensureTextureForDirect(
  scene: Phaser.Scene,
  url?: string,
  fallbackKey = "ship"
): Promise<string> {
  if (!url) return fallbackKey;
  const key =
    "remote-" +
    btoa(url).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (scene.textures.exists(key)) return key;
  if (pendingDirect.has(key)) return pendingDirect.get(key)!;
  const p = new Promise<string>((resolve) => {
    const img = new Image();
    // Allow canvas processing (server must send proper CORS headers)
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        scene.textures.addImage(key, img);
        makeNearBlackTransparent(scene, key, { clearWatermarkBox: true });
        resolve(key);
      } catch {
        resolve(fallbackKey);
      } finally {
        pendingDirect.delete(key);
      }
    };
    img.onerror = () => {
      pendingDirect.delete(key);
      resolve(fallbackKey);
    };
    img.src = url;
  });
  pendingDirect.set(key, p);
  return p;
}
