import Phaser from "phaser";
import { ProjectileSnapshot } from "../../types/state";

export class ProjectileRenderer {
  static readonly MAX_RENDERED = 500;
  private scene: Phaser.Scene;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private textureKey = "projectile-ball";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensureTexture();
  }

  private ensureTexture() {
    if (this.scene.textures.exists(this.textureKey)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    g.clear();
    const radius = 5;
    const diameter = radius * 2;
    g.fillStyle(0xffffff, 1).fillCircle(radius, radius, radius);
    g.generateTexture(this.textureKey, diameter, diameter);
    g.destroy();
  }

  sync(snapshots: Record<string, ProjectileSnapshot>) {
    const allIds = Object.keys(snapshots);
    const ids = new Set(
      allIds
        .map((id) => ({ id, createdAt: snapshots[id].createdAt }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, ProjectileRenderer.MAX_RENDERED)
        .map((o) => o.id)
    );

    this.sprites.forEach((img, id) => {
      if (!ids.has(id)) {
        img.destroy();
        this.sprites.delete(id);
      }
    });

    ids.forEach((id) => {
      const p = snapshots[id];
      if (!p) return;
      let img = this.sprites.get(id);
      if (!img) {
        img = this.scene.add.image(p.position.x, p.position.y, this.textureKey);
        img.setOrigin(0.5, 0.5).setData("projectileId", id).setDepth(50);
        this.sprites.set(id, img);
      }
      img.x = p.position.x;
      img.y = p.position.y;
    });
  }

  extrapolate(delta: number, snapshots: Record<string, ProjectileSnapshot>) {
    if (!this.sprites.size) return;
    const dt = delta / 1000;
    this.sprites.forEach((img, id) => {
      const snap = snapshots[id];
      if (!snap) return;
      img.x += snap.velocity.x * dt;
      img.y += snap.velocity.y * dt;
      const age = Date.now() - snap.createdAt;
      const life = 3000;
      const alpha =
        age > life ? 0.05 : Phaser.Math.Clamp(1 - age / life, 0.1, 1);
      img.setAlpha(alpha);
      const cam = this.scene.cameras.main;
      const view = cam.worldView;
      const margin = 40;
      const inView =
        img.x >= view.x - margin &&
        img.x <= view.right + margin &&
        img.y >= view.y - margin &&
        img.y <= view.bottom + margin;
      img.setVisible(inView);
    });
  }

  destroy() {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
  }
}
