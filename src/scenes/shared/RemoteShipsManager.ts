import Phaser from "phaser";
import { createShipSprite } from "../../ship/ship";
import { ensureTextureFor } from "./TextureUtils";
import { OffscreenIndicators } from "../main/OffscreenIndicators";
import { HealthBarManager } from "../main/HealthBarManager";
import { getClientId, getRemoteShips } from "../../clientState";
import type { RemoteShipSnapshot } from "../../types/state";

export class RemoteShipsManager {
  private scene: Phaser.Scene;
  private indicators: OffscreenIndicators;
  private healthBars: HealthBarManager;
  readonly sprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private syncing = false;
  private pending = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.indicators = new OffscreenIndicators(scene);
    this.healthBars = new HealthBarManager(scene);
  }

  async sync() {
    if (this.syncing) {
      this.pending = true;
      return;
    }
    this.syncing = true;
    try {
      const snapshots = getRemoteShips();
      const wanted = new Set(Object.keys(snapshots));

      // Remove missing
      for (const [id, sprite] of this.sprites) {
        if (!wanted.has(id)) {
          sprite.destroy();
          this.sprites.delete(id);
          this.indicators.destroyFor(id);
          this.healthBars.destroyFor(id);
        }
      }

      // Add/update
      for (const id of wanted) {
        const snap: RemoteShipSnapshot | undefined = (snapshots as any)[id];
        if (!snap) continue;
        let sprite = this.sprites.get(id);
        const tex = await ensureTextureFor(
          this.scene,
          snap.appearance.shipImageUrl
        );
        if (!sprite) {
          sprite = this.sprites.get(id);
        }
        if (!sprite) {
          sprite = createShipSprite(
            this.scene,
            snap.physics.position.x,
            snap.physics.position.y,
            tex
          );
          sprite.setData("shipId", id);
          this.sprites.set(id, sprite);
          this.healthBars.getOrCreate(id);
        } else if (sprite.texture.key !== tex) {
          sprite.setTexture(tex);
        }
        sprite.x = snap.physics.position.x;
        sprite.y = snap.physics.position.y;
        sprite.rotation = snap.physics.rotation;
        this.healthBars.refresh(id, sprite, snap.health, snap.kills, snap.name);
      }

      // Safety: destroy any child tagged shipId that isn't tracked
      this.scene.children.list.forEach((obj) => {
        const go = obj as any;
        const id: string | undefined = go?.getData?.("shipId");
        if (id && !this.sprites.has(id)) go.destroy();
      });
    } finally {
      this.syncing = false;
      if (this.pending) {
        this.pending = false;
        this.sync();
      }
    }
  }

  updateHUD() {
    const id = getClientId();
    this.indicators.update(this.sprites, getRemoteShips(), id);
    this.healthBars.positionAll(this.sprites);
  }

  destroy() {
    this.indicators.clear();
    this.healthBars.clear();
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
  }
}
