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
  const key = "remote-" + btoa(url).replace(/=+$/g, "");
  if (scene.textures.exists(key)) return key;
  return await new Promise<string>((resolve) => {
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
