import Phaser from "phaser";
import { RemoteShipSnapshot } from "../../types/state";

export interface IndicatorParts {
  container: Phaser.GameObjects.Container;
  arrow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

export class OffscreenIndicators {
  private scene: Phaser.Scene;
  private containers = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensureIndicatorTexture();
  }

  private ensureIndicatorTexture() {
    const key = "indicator-triangle";
    if (this.scene.textures.exists(key)) return;
    const w = 24;
    const h = 16;
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    g.clear();
    g.lineStyle(2, 0x263238, 0.9);
    g.fillStyle(0xffffff, 0.95);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h / 2);
    g.lineTo(0, h);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture(key, w + 2, h + 2);
    g.destroy();
  }

  private getOrCreate(id: string): IndicatorParts {
    let container = this.containers.get(id);
    if (container) {
      const kids = container.list as any[];
      const arrow = kids.find(
        (c) => c.getData && c.getData("kind") === "arrow"
      ) as Phaser.GameObjects.Image;
      const label = kids.find(
        (c) => c.getData && c.getData("kind") === "label"
      ) as Phaser.GameObjects.Text;
      return { container, arrow, label };
    }
    const c = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);
    const arrow = this.scene.add.image(0, 0, "indicator-triangle");
    arrow.setOrigin(0.5, 0.5).setData("kind", "arrow");
    const label = this.scene.add.text(0, 14, "", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0).setData("kind", "label").setVisible(false);
    c.add([arrow, label]);
    this.containers.set(id, c);
    return { container: c, arrow, label };
  }

  update(
    sprites: Map<string, Phaser.Types.Physics.Arcade.SpriteWithDynamicBody>,
    snapshots: Record<string, RemoteShipSnapshot>,
    clientId?: string
  ) {
    const cam = this.scene.cameras.main;
    const halfW = cam.width / 2;
    const halfH = cam.height / 2;
    const margin = 28;
    const centerX = halfW;
    const centerY = halfH;
    const active = new Set<string>();

    for (const [id, sprite] of sprites) {
      if (id === clientId) continue;
      const snap: RemoteShipSnapshot | undefined = (snapshots as any)[id];
      if (snap && typeof snap.health === "number" && snap.health <= 0) {
        this.containers.get(id)?.setVisible(false);
        continue;
      }
      const dxWorld = sprite.x - cam.midPoint.x;
      const dyWorld = sprite.y - cam.midPoint.y;
      const sx = dxWorld * cam.zoom;
      const sy = dyWorld * cam.zoom;
      const absX = Math.abs(sx);
      const absY = Math.abs(sy);
      const insideX = absX <= halfW - margin;
      const insideY = absY <= halfH - margin;
      if (insideX && insideY) {
        this.containers.get(id)?.setVisible(false);
        continue;
      }
      const denom = Math.max(absX / (halfW - margin), absY / (halfH - margin));
      if (denom === 0) {
        this.containers.get(id)?.setVisible(false);
        continue;
      }
      const nx = sx / denom;
      const ny = sy / denom;
      const screenX = centerX + nx;
      const screenY = centerY + ny;
      const { container, arrow, label } = this.getOrCreate(id);
      container
        .setVisible(true)
        .setPosition(Math.round(screenX), Math.round(screenY));
      const angle = Math.atan2(sy, sx);
      arrow.setRotation(angle);
      const dist = Math.hypot(dxWorld, dyWorld);
      const minScale = 0.6;
      const maxScale = 1.8;
      const near = 300;
      const far = 4000;
      const t = Phaser.Math.Clamp((dist - near) / (far - near), 0, 1);
      arrow.setScale(maxScale - t * (maxScale - minScale));
      const nm = snap && typeof snap.name === "string" ? snap.name.trim() : "";
      if (nm) {
        const maxChars = 18;
        const txt = nm.length > maxChars ? nm.slice(0, maxChars - 1) + "…" : nm;
        label.setText(txt).setVisible(true);
      } else {
        label.setVisible(false);
      }
      active.add(id);
    }

    for (const [id, cont] of this.containers) {
      if (!active.has(id)) cont.setVisible(false);
    }
  }

  destroyFor(id: string) {
    const c = this.containers.get(id);
    if (c) {
      c.destroy(true);
      this.containers.delete(id);
    }
  }

  clear() {
    for (const [, c] of this.containers) c.destroy(true);
    this.containers.clear();
  }
}
